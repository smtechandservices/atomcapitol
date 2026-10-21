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
    submission = getattr(customer, "kyc_submission", None) if customer.pk else None
    awaiting_plot = customer.assigned_plot_id is None and customer.is_active and bool(submission and submission.step1_submitted_at)

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

    if role == "PRIMARY":
        from payments.services import ensure_schedule

        ensure_schedule(plot)  # waits for the buyer's KYC Step 2 approval unless that's already happened

    if awaiting_plot:
        from notifications.services import notify_customer

        notify_customer(
            customer,
            "PLOT_ASSIGNED",
            "Your plot is assigned",
            f"Plot {plot.plot_number} at {plot.project.name} is now linked to your account. Continue your KYC in the app.",
            deep_link="kyc",
        )

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
    """Columns: plot_number,size,block_sector,rate_per_sq_yd,plc_percent,plc_type"""
    decoded = io.TextIOWrapper(file_obj.file, encoding="utf-8-sig")
    reader = csv.DictReader(decoded)
    created, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            size = (row.get("size") or "").strip()
            if Plot.parse_area(size) is None:
                raise ValueError("size must be a positive number (sq. yd)")
            rate = Decimal((row.get("rate_per_sq_yd") or "").strip())
            plc_percent = Decimal((row.get("plc_percent") or "").strip() or 0)
            if rate < 0 or not 0 <= plc_percent <= 100:
                raise ValueError("rate_per_sq_yd must be >= 0 and plc_percent between 0 and 100")
            plot, _ = Plot.objects.update_or_create(
                project=project,
                plot_number=row["plot_number"].strip(),
                defaults={
                    "size": size,
                    "block_sector": (row.get("block_sector") or "").strip(),
                    "rate_per_sq_yd": rate,
                    "plc_percent": plc_percent,
                    "plc_type": (row.get("plc_type") or "").strip(),
                },
            )
            created.append(plot.plot_number)
        except InvalidOperation:
            errors.append({"row": i, "error": "rate_per_sq_yd and plc_percent must be numbers"})
        except (KeyError, ValueError, ValidationError) as exc:
            errors.append({"row": i, "error": str(exc)})
    return created, errors


def _instalment_count(value):
    if not value:
        return None
    count = int(value)
    if count < 2:
        raise ValueError("instalment_count must be at least 2 (instalment 1 is the KYC receipt)")
    return count


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
                    "instalment_count": _instalment_count(row.get("instalment_count")),
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
