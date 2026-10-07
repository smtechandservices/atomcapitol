import csv
import io
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction

from accounts.models import Customer

from .models import Plot, PlotAssignmentHistory, Project


class AssignmentError(Exception):
    def __init__(self, message, code="assignment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


@transaction.atomic
def assign_plot(plot, email, *, role="PRIMARY", name="", phone="", commercial_position=None, performed_by=None):
    email = email.strip().lower()
    if not email:
        raise AssignmentError("Email is required.", "invalid_email")

    if role == "PRIMARY" and plot.customers.filter(plot_role=Customer.PlotRole.PRIMARY).exclude(email__iexact=email).exists():
        raise AssignmentError("This plot already has a primary buyer assigned.", "already_assigned")

    existing_owner = Customer.objects.filter(email__iexact=email).exclude(assigned_plot=None).exclude(assigned_plot=plot).first()
    if existing_owner:
        raise AssignmentError("This email is already mapped to another plot.", "email_taken")

    customer = Customer.objects.filter(email__iexact=email).first()
    if customer is None:
        customer = Customer(email=email, name=name, phone=phone)
    elif name or phone:
        customer.name = name or customer.name
        customer.phone = phone or customer.phone

    customer.assigned_plot = plot
    customer.plot_role = role
    customer.is_active = True
    customer.save()

    if role == "PRIMARY" and commercial_position:
        plot.total_value = commercial_position.get("total_value", plot.total_value)
        plot.amount_paid_outside_app = commercial_position.get("amount_paid_outside_app", plot.amount_paid_outside_app or 0)
        plot.instalment_count = commercial_position.get("instalment_count", plot.instalment_count)

    if plot.status == Plot.Status.AVAILABLE:
        plot.status = Plot.Status.BOOKED
    plot.save()

    PlotAssignmentHistory.objects.create(
        plot=plot, action=PlotAssignmentHistory.Action.ASSIGNED, to_email=email, performed_by=performed_by
    )

    if role == "PRIMARY" and plot.total_value and plot.instalment_count and not plot.milestones.exists():
        from payments.services import generate_milestone_schedule

        generate_milestone_schedule(plot)

    return customer


@transaction.atomic
def unassign_plot(plot, customer, *, reason="", performed_by=None):
    email = customer.email
    customer.assigned_plot = None
    customer.plot_role = None
    customer.is_active = False
    customer.save()

    PlotAssignmentHistory.objects.create(
        plot=plot,
        action=PlotAssignmentHistory.Action.UNASSIGNED,
        from_email=email,
        reason=reason,
        performed_by=performed_by,
    )
    return customer


@transaction.atomic
def transfer_plot(plot, current_customer, new_email, *, reason="", performed_by=None):
    unassign_plot(plot, current_customer, reason=reason, performed_by=performed_by)
    new_customer = assign_plot(
        plot, new_email, role=Customer.PlotRole.PRIMARY, performed_by=performed_by
    )
    PlotAssignmentHistory.objects.create(
        plot=plot,
        action=PlotAssignmentHistory.Action.TRANSFERRED,
        from_email=current_customer.email,
        to_email=new_email,
        reason=reason,
        performed_by=performed_by,
    )
    return new_customer


def bulk_import_plots_csv(project, file_obj):
    """Columns: plot_number,size,block_sector,price"""
    decoded = io.TextIOWrapper(file_obj.file, encoding="utf-8")
    reader = csv.DictReader(decoded)
    created, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            plot, _ = Plot.objects.update_or_create(
                project=project,
                plot_number=row["plot_number"].strip(),
                defaults={
                    "size": row.get("size", "").strip(),
                    "block_sector": row.get("block_sector", "").strip(),
                    "price": row["price"],
                },
            )
            created.append(plot.plot_number)
        except (KeyError, ValidationError) as exc:
            errors.append({"row": i, "error": str(exc)})
    return created, errors


def bulk_assign_csv(file_obj, performed_by=None):
    """Columns: project,plot_number,email,role,name,phone,total_value,amount_paid_outside_app,instalment_count"""
    decoded = io.TextIOWrapper(file_obj.file, encoding="utf-8")
    reader = csv.DictReader(decoded)
    assigned, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            plot = Plot.objects.get(project__name=row["project"].strip(), plot_number=row["plot_number"].strip())
            commercial_position = None
            if row.get("total_value"):
                commercial_position = {
                    "total_value": Decimal(row["total_value"]),
                    "amount_paid_outside_app": Decimal(row.get("amount_paid_outside_app") or 0),
                    "instalment_count": int(row["instalment_count"]) if row.get("instalment_count") else None,
                }
            assign_plot(
                plot,
                row["email"],
                role=row.get("role", "PRIMARY").strip().upper() or "PRIMARY",
                name=row.get("name", "").strip(),
                phone=row.get("phone", "").strip(),
                commercial_position=commercial_position,
                performed_by=performed_by,
            )
            assigned.append(row["email"])
        except (Plot.DoesNotExist, KeyError, ValueError, InvalidOperation, AssignmentError) as exc:
            errors.append({"row": i, "error": str(exc)})
    return assigned, errors


# ---------------------------------------------------------------------------
# Deleting plots / projects (super admin) — only when nothing customer-facing would be lost.
# ---------------------------------------------------------------------------
def plot_delete_blockers(plot):
    """Reasons this plot can't be deleted. Plot deletion cascades to milestones, payment proofs and
    change requests, and unlinks buyers (who then lose app access) — so those must not exist."""
    from payments.models import Milestone, PaymentProof

    reasons = []
    buyers = plot.customers.count()
    if buyers:
        reasons.append(f"{buyers} buyer{'s' if buyers != 1 else ''} assigned — unassign them first")
    if plot.milestones.filter(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]).exists() or PaymentProof.objects.filter(milestone__plot=plot).exists():
        reasons.append("has payment history (paid or submitted instalments)")
    return reasons


def project_delete_summary(project):
    """What deleting the project would remove, and which plots block it."""
    from payments.models import Milestone

    plots = list(project.plots.all())
    blocked = []
    for plot in plots:
        reasons = plot_delete_blockers(plot)
        if reasons:
            blocked.append({"plot_id": plot.id, "plot_number": plot.plot_number, "reasons": reasons})
    return {
        "can_delete": not blocked,
        "blocked_plots": blocked[:20],
        "blocked_count": len(blocked),
        "will_delete": {
            "plots": len(plots),
            "milestones": Milestone.objects.filter(plot__project=project).count(),
            "documents": project.documents.count(),
            "images": project.images.count(),
        },
    }
