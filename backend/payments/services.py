from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.utils import timezone

from core.models import AuditLog
from notifications.services import notify_customer

from .models import Milestone, MilestoneChangeRequest, PaymentProof


class PaymentError(Exception):
    def __init__(self, message, code="payment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


# Instalment 1 is the booking payment the buyer uploads as their KYC Step 2 receipt;
# the generated schedule covers instalments 2..instalment_count.
KYC_INSTALMENT_SEQUENCE = 1
KYC_PAYMENT_MODE = "KYC receipt"


def _split(amount, parts):
    """Even split; any rounding remainder is absorbed into the last part."""
    amount = max(amount, Decimal(0))
    base = round(amount / parts, 2)
    return [base] * (parts - 1) + [amount - base * (parts - 1)]


@transaction.atomic
def generate_milestone_schedule(plot, start_date=None):
    """Splits what's left after the booking instalment into instalments 2..instalment_count,
    monthly. If the buyer's KYC receipt is already approved, it's recorded as instalment 1 first.
    """
    if not (plot.total_value and plot.instalment_count):
        raise PaymentError("Plot is missing total_value / instalment_count.", "missing_commercial_position")
    if plot.instalment_count < 2:
        raise PaymentError("Instalment count must be at least 2 (instalment 1 is the KYC receipt).", "invalid_instalment_count")

    first = plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE).first() or _record_approved_kyc_receipt(plot)
    n = plot.instalment_count
    if first and first.name != f"Instalment 1 of {n}":
        first.name = f"Instalment 1 of {n}"
        first.save(update_fields=["name"])
    remaining = plot.total_value - (plot.amount_paid_outside_app or 0) - (first.amount if first else 0)
    start = start_date or (date.today() + relativedelta(months=1))

    milestones = [
        Milestone(
            plot=plot,
            sequence=i,
            name=f"Instalment {i} of {n}",
            amount=amount,
            due_date=start + relativedelta(months=i - 2),
            status=Milestone.Status.UPCOMING,
        )
        for i, amount in zip(range(2, n + 1), _split(remaining, n - 1))
    ]
    Milestone.objects.bulk_create(milestones)
    refresh_plot_milestone_statuses(plot)
    return plot.milestones.all()


def _record_approved_kyc_receipt(plot):
    from kyc.models import KYCSubmission, StepStatus

    submission = (
        KYCSubmission.objects.filter(customer__assigned_plot=plot, step2_status=StepStatus.APPROVED)
        .exclude(receipt_amount=None)
        .order_by("reviewed_at")
        .first()
    )
    return record_kyc_instalment(submission, resplit=False) if submission else None


@transaction.atomic
def record_kyc_instalment(submission, *, resplit=True, receipt_entries=None):
    """Records an approved KYC Step 2 receipt as instalment 1 (PAID) on the buyer's plot, with the
    receipt as its approved proof. Then re-splits the still-unpaid instalments so the plan still
    adds up to total_value. No-op if the plot already has an instalment 1 (e.g. a legacy schedule).

    `receipt_entries` (admin-verified payments, see render_payment_receipt_pdf) set the instalment
    amount and issue a payment receipt document; without them no receipt is issued.
    """
    customer = submission.customer
    plot = customer.assigned_plot
    if plot is None or submission.receipt_amount is None:
        return None
    if plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE).exists():
        return None

    amount = submission.receipt_amount
    paid_on = submission.receipt_payment_date or date.today()
    payment_mode, reference = KYC_PAYMENT_MODE, ""
    if receipt_entries:
        amount = sum(Decimal(e["amount"]) for e in receipt_entries)
        paid_on = max(e["payment_date"] for e in receipt_entries)
        payment_mode = ", ".join(dict.fromkeys(e["payment_by"] for e in receipt_entries))[:50]
        reference = ", ".join(e["reference"] for e in receipt_entries if e.get("reference"))[:100]
    n = plot.instalment_count
    milestone = Milestone.objects.create(
        plot=plot,
        sequence=KYC_INSTALMENT_SEQUENCE,
        name=f"Instalment 1 of {n}" if n else "Instalment 1",
        description="Booking payment submitted with KYC",
        amount=amount,
        due_date=paid_on,
        status=Milestone.Status.PAID,
        paid_date=paid_on,
        payment_mode=payment_mode,
        transaction_reference=reference,
    )
    proof = PaymentProof.objects.create(
        milestone=milestone,
        submitted_by=customer,
        file=submission.receipt_file.name,
        claimed_amount=amount,
        payment_date=paid_on,
        payment_mode=payment_mode,
        transaction_reference=reference,
        status=PaymentProof.Status.APPROVED,
        reviewed_by=submission.reviewed_by,
        reviewed_at=submission.reviewed_at,
    )

    if receipt_entries:
        from documents.services import generate_receipt_document

        generate_receipt_document(milestone, proof, amount, entries=receipt_entries)

    if resplit and plot.total_value:
        _resplit_unpaid(plot)
    refresh_plot_milestone_statuses(plot)
    return milestone


def _resplit_unpaid(plot):
    settled = [Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]
    unpaid = list(plot.milestones.exclude(status__in=settled).order_by("sequence"))
    if not unpaid:
        return
    settled_total = sum(m.amount for m in plot.milestones.filter(status__in=settled))
    remaining = plot.total_value - (plot.amount_paid_outside_app or 0) - settled_total
    for m, amount in zip(unpaid, _split(remaining, len(unpaid))):
        if m.amount != amount:
            m.amount = amount
            m.save(update_fields=["amount"])


def refresh_plot_milestone_statuses(plot):
    """Promotes the earliest unpaid milestone to DUE and flags any past-due ones as OVERDUE.
    Safe to call repeatedly (e.g. from a nightly cron and on every read).
    """
    today = date.today()
    unpaid = plot.milestones.exclude(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]).order_by("sequence")
    first = unpaid.first()
    for m in unpaid:
        if m.due_date < today:
            new_status = Milestone.Status.OVERDUE
        elif first and m.id == first.id:
            new_status = Milestone.Status.DUE
        else:
            new_status = Milestone.Status.UPCOMING
        if m.status != new_status:
            m.status = new_status
            m.save(update_fields=["status"])


def submit_payment_proof(milestone, customer, *, file, claimed_amount, payment_date, payment_mode, transaction_reference):
    if milestone.status not in (Milestone.Status.DUE, Milestone.Status.OVERDUE):
        raise PaymentError("This milestone is not open for a new payment proof.", "not_payable")

    proof = PaymentProof.objects.create(
        milestone=milestone,
        submitted_by=customer,
        file=file,
        claimed_amount=claimed_amount,
        payment_date=payment_date,
        payment_mode=payment_mode,
        transaction_reference=transaction_reference,
    )
    milestone.status = Milestone.Status.UNDER_REVIEW
    milestone.save(update_fields=["status"])
    return proof


@transaction.atomic
def approve_payment_proof(proof, admin_user, *, corrected_amount=None, corrected_date=None):
    if proof.status != PaymentProof.Status.PENDING:
        raise PaymentError("This proof has already been reviewed.", "already_reviewed")

    # Approval marks the whole milestone PAID, so a short amount would silently write off the difference.
    approved_amount = corrected_amount if corrected_amount is not None else proof.claimed_amount
    if approved_amount < proof.milestone.amount:
        raise PaymentError(
            f"Approved amount ₹{approved_amount:,.2f} is less than the milestone amount ₹{proof.milestone.amount:,.2f}. "
            "Reject the proof, or edit the milestone amount first.",
            "short_payment",
        )

    proof.status = PaymentProof.Status.APPROVED
    proof.reviewed_by = admin_user
    proof.reviewed_at = timezone.now()
    proof.save()

    milestone = proof.milestone
    milestone.status = Milestone.Status.PAID
    milestone.paid_date = corrected_date or proof.payment_date
    milestone.payment_mode = proof.payment_mode
    milestone.transaction_reference = proof.transaction_reference
    milestone.save()

    from documents.services import generate_receipt_document

    generate_receipt_document(milestone, proof, corrected_amount or proof.claimed_amount)

    notify_customer(
        proof.submitted_by,
        "PAYMENT_APPROVED",
        "Payment verified",
        f"Your payment for '{milestone.name}' has been approved. Receipt is now in Documents.",
        deep_link=f"milestone:{milestone.id}",
    )
    AuditLog.record(admin_user, "payment_proof.approve", target=proof, ip_address=None)
    refresh_plot_milestone_statuses(milestone.plot)
    return proof


def reject_payment_proof(proof, admin_user, *, reason):
    if proof.status != PaymentProof.Status.PENDING:
        raise PaymentError("This proof has already been reviewed.", "already_reviewed")

    proof.status = PaymentProof.Status.REJECTED
    proof.rejection_reason = reason
    proof.reviewed_by = admin_user
    proof.reviewed_at = timezone.now()
    proof.save()

    milestone = proof.milestone
    milestone.status = Milestone.Status.DUE
    milestone.save(update_fields=["status"])

    notify_customer(
        proof.submitted_by,
        "PAYMENT_REJECTED",
        "Payment proof rejected",
        reason or f"Your proof for '{milestone.name}' was rejected. Please re-upload.",
        deep_link=f"milestone:{milestone.id}",
    )
    AuditLog.record(admin_user, "payment_proof.reject", target=proof, details={"reason": reason}, ip_address=None)
    return proof


# ---------------------------------------------------------------------------
# 5.6 / 7.11 Milestone change requests
# ---------------------------------------------------------------------------
def create_change_request(customer, plot, *, change_type, proposed_details, reason, attachment=None):
    return MilestoneChangeRequest.objects.create(
        plot=plot,
        requested_by=customer,
        change_type=change_type,
        proposed_details=proposed_details,
        reason=reason,
        attachment=attachment,
    )


@transaction.atomic
def apply_schedule(plot, schedule):
    """Replaces every non-paid, non-under-review milestone with `schedule`
    (a list of {name, amount, due_date}), keeping paid milestones untouched.
    """
    kept = plot.milestones.filter(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW])
    next_sequence = (kept.count()) + 1
    plot.milestones.exclude(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]).delete()

    new_milestones = [
        Milestone(
            plot=plot,
            sequence=next_sequence + i,
            name=item.get("name") or f"Instalment {next_sequence + i}",
            amount=item["amount"],
            due_date=item["due_date"],
            status=Milestone.Status.UPCOMING,
        )
        for i, item in enumerate(schedule)
    ]
    Milestone.objects.bulk_create(new_milestones)
    refresh_plot_milestone_statuses(plot)


def _jsonable_schedule(schedule):
    """Validated schedules carry Decimal/date values, which JSONFields (audit details, counter_schedule) can't store."""
    return [
        {"name": item.get("name") or "", "amount": str(item["amount"]), "due_date": str(item["due_date"])}
        for item in schedule
    ]


@transaction.atomic
def approve_change_request(change_request, admin_user, *, schedule=None):
    if change_request.status != MilestoneChangeRequest.Status.PENDING:
        raise PaymentError("This request has already been decided.", "already_reviewed")
    # The customer is told the change "has been applied", so approving must actually apply a schedule.
    if not schedule:
        raise PaymentError("Approving needs the revised schedule to apply to the unpaid milestones.", "schedule_required")
    apply_schedule(change_request.plot, schedule)

    change_request.status = MilestoneChangeRequest.Status.APPROVED
    change_request.reviewed_by = admin_user
    change_request.reviewed_at = timezone.now()
    change_request.save()

    notify_customer(
        change_request.requested_by,
        "MILESTONE_CHANGE_APPROVED",
        "Milestone change approved",
        "Your requested change has been applied to your payment schedule.",
        deep_link="payments",
    )
    AuditLog.record(
        admin_user, "milestone_change_request.approve", target=change_request,
        details={"schedule": _jsonable_schedule(schedule)}, ip_address=None,
    )
    return change_request


def decline_change_request(change_request, admin_user, *, reason):
    if change_request.status != MilestoneChangeRequest.Status.PENDING:
        raise PaymentError("This request has already been decided.", "already_reviewed")

    change_request.status = MilestoneChangeRequest.Status.DECLINED
    change_request.admin_response = reason
    change_request.reviewed_by = admin_user
    change_request.reviewed_at = timezone.now()
    change_request.save()

    notify_customer(
        change_request.requested_by,
        "MILESTONE_CHANGE_DECLINED",
        "Milestone change declined",
        reason or "Your requested change was declined.",
        deep_link="payments",
    )
    AuditLog.record(admin_user, "milestone_change_request.decline", target=change_request, ip_address=None)
    return change_request


def counter_change_request(change_request, admin_user, *, counter_schedule, note=""):
    if change_request.status != MilestoneChangeRequest.Status.PENDING:
        raise PaymentError("This request has already been decided.", "already_reviewed")

    change_request.status = MilestoneChangeRequest.Status.COUNTERED
    counter_schedule = _jsonable_schedule(counter_schedule)
    change_request.counter_schedule = {"schedule": counter_schedule, "note": note}
    change_request.admin_response = note
    change_request.reviewed_by = admin_user
    change_request.reviewed_at = timezone.now()
    change_request.save()

    notify_customer(
        change_request.requested_by,
        "MILESTONE_CHANGE_COUNTERED",
        "Revised schedule proposed",
        note or "Admin proposed a revised payment schedule for your review.",
        deep_link="payments",
    )
    AuditLog.record(
        admin_user, "milestone_change_request.counter", target=change_request,
        details={"counter_schedule": counter_schedule}, ip_address=None,
    )
    return change_request
