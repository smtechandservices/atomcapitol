from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.db.models import Max, Sum
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


def outside_app_not_scheduled(plot):
    """The part of amount_paid_outside_app that isn't already a paid instalment. The booking money paid before the
    app is what the buyer uploads as their KYC receipt, so once that's recorded as instalment 1 it mustn't count twice.
    """
    booking = plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE, status=Milestone.Status.PAID).aggregate(t=Sum("amount"))["t"]
    return max((plot.amount_paid_outside_app or 0) - (booking or 0), Decimal(0))


def outside_app_collected(plot):
    """Money paid outside the app counts as collected only once the KYC receipt for it is approved as instalment 1
    (and then only the part instalment 1 doesn't cover). Until then it's just what the admin was told at assignment.
    """
    if not plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE, status=Milestone.Status.PAID).exists():
        return Decimal(0)
    return outside_app_not_scheduled(plot)


def plot_paid_total(plot):
    """Everything the buyer has paid: paid instalments plus money paid outside the app (see outside_app_collected)."""
    paid = plot.milestones.filter(status=Milestone.Status.PAID).aggregate(t=Sum("amount"))["t"] or Decimal(0)
    return paid + outside_app_collected(plot)


def after_payment_recorded(plot):
    """Follow-ups once money is recorded against a plot: the allotment letter at 50% paid."""
    from documents.services import issue_allotment_letter_if_due

    issue_allotment_letter_if_due(plot)


def resplit_after_price_change(plot):
    """The plot's total value changed: spread the new balance over the unpaid instalments so the plan adds up."""
    if plot.total_value and plot.milestones.exclude(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]).exists():
        _resplit_unpaid(plot)
        refresh_plot_milestone_statuses(plot)
    after_payment_recorded(plot)


def pending_booking_payment(plot):
    """Instalment 1 (the booking payment) before KYC Step 2 approval creates it: the receipt amount the primary buyer
    submitted, else the amount paid outside the app. None once instalment 1 exists, or with nothing to go on.
    """
    if plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE).exists():
        return None
    from kyc.models import KYCSubmission

    submission = (
        KYCSubmission.objects.filter(customer__assigned_plot=plot, customer__plot_role="PRIMARY")
        .exclude(receipt_amount=None)
        .first()
    )
    if submission and submission.step2_status:
        return {"amount": submission.receipt_amount, "source": "receipt", "step2_status": submission.step2_status}
    if plot.amount_paid_outside_app:
        return {"amount": plot.amount_paid_outside_app, "source": "outside_app", "step2_status": None}
    return None


SCHEDULE_STEPS = {"MONTHLY": relativedelta(months=1), "WEEKLY": relativedelta(weeks=1)}


def schedule_rows(remaining, instalment_count, start_date=None, frequency="MONTHLY", due_dates=None, amounts=None):
    """Instalments 2..instalment_count as {sequence, name, amount, due_date}: `remaining` split evenly, one per
    month (or week) from `start_date` (default one step from today). `due_dates` and `amounts`, one per instalment,
    replace the computed dates and the even split; `amounts` must add up to `remaining`.
    Shared by generate_milestone_schedule and the KYC Step 2 preview.
    """
    n = instalment_count
    step = SCHEDULE_STEPS[frequency]
    start = start_date or (date.today() + step)
    dates = due_dates or [start + step * k for k in range(n - 1)]
    if amounts:
        planned = sum(Decimal(a) for a in amounts)
        if abs(planned - remaining) >= 1:
            raise PaymentError(
                f"The instalments add up to ₹{planned:,.2f} but ₹{remaining:,.2f} is left to pay.", "schedule_total_mismatch"
            )
    return [
        {"sequence": i, "name": f"Instalment {i} of {n}", "amount": amount, "due_date": due}
        for i, amount, due in zip(range(2, n + 1), amounts or _split(remaining, n - 1), dates)
    ]


@transaction.atomic
def generate_milestone_schedule(plot, start_date=None, frequency="MONTHLY", due_dates=None, amounts=None):
    """Splits what's left after the booking instalment into instalments 2..instalment_count,
    monthly or weekly (see schedule_rows). If the buyer's KYC receipt is already approved, it's recorded as instalment 1 first.
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
    remaining = plot.total_value - outside_app_not_scheduled(plot) - (first.amount if first else 0)

    milestones = [
        Milestone(plot=plot, status=Milestone.Status.UPCOMING, **row)
        for row in schedule_rows(remaining, n, start_date, frequency, due_dates, amounts)
    ]
    Milestone.objects.bulk_create(milestones)
    refresh_plot_milestone_statuses(plot)
    return plot.milestones.all()


def ensure_schedule(plot, **schedule_options):
    """Generates instalments 2..instalment_count once the plot has payment terms AND its primary buyer's booking
    receipt (KYC Step 2) is approved, so instalment 2 falls due a month after approval instead of a month after the
    plot was assigned. Called on assignment and on Step 2 approval; a no-op until both hold, or once a schedule exists.
    `schedule_options` (frequency, due_dates, amounts) go to generate_milestone_schedule.
    """
    from kyc.models import KYCSubmission, StepStatus

    if plot is None or not (plot.total_value and plot.instalment_count and plot.instalment_count >= 2):
        return None
    if plot.milestones.filter(sequence__gte=2).exists():
        return None
    booking_approved = KYCSubmission.objects.filter(
        customer__assigned_plot=plot, customer__plot_role="PRIMARY", step2_status=StepStatus.APPROVED
    ).exists()
    if not booking_approved:
        return None
    return generate_milestone_schedule(plot, **schedule_options)


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
    payment_mode, bank, reference = KYC_PAYMENT_MODE, "", ""
    if receipt_entries:
        amount = sum(Decimal(e["amount"]) for e in receipt_entries)
        paid_on = max(e["payment_date"] for e in receipt_entries)
        payment_mode = ", ".join(dict.fromkeys(e["payment_by"] for e in receipt_entries))[:50]
        bank = ", ".join(dict.fromkeys(e["bank"] for e in receipt_entries if e.get("bank")))[:100]
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
        bank=bank,
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
    after_payment_recorded(plot)
    return milestone


def _resplit_unpaid(plot):
    settled = [Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW]
    unpaid = list(plot.milestones.exclude(status__in=settled).order_by("sequence"))
    if not unpaid:
        return
    settled_total = sum(m.amount for m in plot.milestones.filter(status__in=settled))
    remaining = plot.total_value - outside_app_not_scheduled(plot) - settled_total
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


def submit_payment_proof(milestone, customer, *, file, claimed_amount, payment_date, payment_mode):
    if milestone.status not in (Milestone.Status.DUE, Milestone.Status.OVERDUE):
        raise PaymentError("This milestone is not open for a new payment proof.", "not_payable")

    proof = PaymentProof.objects.create(
        milestone=milestone,
        submitted_by=customer,
        file=file,
        claimed_amount=claimed_amount,
        payment_date=payment_date,
        payment_mode=payment_mode,
    )
    milestone.status = Milestone.Status.UNDER_REVIEW
    milestone.save(update_fields=["status"])
    return proof


@transaction.atomic
def approve_payment_proof(proof, admin_user, *, bank, transaction_reference, payment_mode=None, schedule=None):
    """Marks the proof's milestone PAID for the claimed amount. The admin supplies the bank and transaction reference
    (checked against their statement) for the receipt; `payment_mode` overrides what the customer picked.

    When the claimed amount differs from the milestone, the milestone is re-valued to what was paid and the
    difference has to be re-planned: `schedule` replaces the plot's unpaid milestones (as with an approved
    change request) and must add up to the balance left after this payment.
    """
    if proof.status != PaymentProof.Status.PENDING:
        raise PaymentError("This proof has already been reviewed.", "already_reviewed")

    milestone = proof.milestone
    paid_amount = proof.claimed_amount
    if paid_amount != milestone.amount:
        unpaid = milestone.plot.milestones.exclude(status__in=[Milestone.Status.PAID, Milestone.Status.UNDER_REVIEW])
        remaining = (unpaid.aggregate(total=Sum("amount"))["total"] or Decimal("0")) + milestone.amount - paid_amount
        if remaining < 0:
            raise PaymentError(
                f"Claimed ₹{paid_amount:,.2f} is more than the whole outstanding balance. Reject the proof.",
                "overpaid_balance",
            )
        schedule = schedule or []
        if remaining > 0 and not schedule:
            raise PaymentError(
                "The claimed amount doesn't match the milestone — approving needs a revised schedule for the remaining balance.",
                "schedule_required",
            )
        planned = sum((Decimal(item["amount"]) for item in schedule), Decimal("0"))
        if abs(planned - remaining) >= 1:
            raise PaymentError(
                f"The revised schedule adds up to ₹{planned:,.2f} but ₹{remaining:,.2f} is left to pay.",
                "schedule_total_mismatch",
            )

    proof.status = PaymentProof.Status.APPROVED
    proof.transaction_reference = transaction_reference
    if payment_mode:
        proof.payment_mode = payment_mode
    proof.reviewed_by = admin_user
    proof.reviewed_at = timezone.now()
    proof.save()

    previous_amount = milestone.amount
    milestone.amount = paid_amount
    milestone.status = Milestone.Status.PAID
    milestone.paid_date = proof.payment_date
    milestone.payment_mode = proof.payment_mode
    milestone.bank = bank
    milestone.transaction_reference = transaction_reference
    milestone.save()

    if paid_amount != previous_amount:
        apply_schedule(milestone.plot, schedule)

    from documents.services import generate_receipt_document

    generate_receipt_document(milestone, proof, paid_amount)

    notify_customer(
        proof.submitted_by,
        "PAYMENT_APPROVED",
        "Payment verified",
        f"Your payment for '{milestone.name}' has been approved. Receipt is now in Documents.",
        deep_link=f"milestone:{milestone.id}",
    )
    details = None
    if paid_amount != previous_amount:
        details = {"milestone_amount": str(previous_amount), "paid_amount": str(paid_amount), "schedule": _jsonable_schedule(schedule)}
    AuditLog.record(admin_user, "payment_proof.approve", target=proof, details=details, ip_address=None)
    refresh_plot_milestone_statuses(milestone.plot)
    after_payment_recorded(milestone.plot)
    return proof


@transaction.atomic
def regenerate_milestone_receipt(milestone, admin_user):
    """Re-issues the receipt PDF for a PAID milestone from its current amount and payment details
    (e.g. after a correction, or a milestone marked paid without a platform receipt). Earlier receipts
    are hidden from the customer, not deleted, so the history stays in Documents for admins.
    """
    if milestone.status != Milestone.Status.PAID:
        raise PaymentError("Only paid milestones have a receipt.", "not_paid")

    proof = milestone.proofs.filter(status=PaymentProof.Status.APPROVED).order_by("-reviewed_at").first()
    customer = proof.submitted_by if proof else milestone.plot.customers.filter(plot_role="PRIMARY").first()
    if customer is None:
        raise PaymentError("This plot has no buyer to issue the receipt to.", "no_customer")

    entries = [
        {
            "payment_by": milestone.payment_mode or (proof.payment_mode if proof else ""),
            "payment_date": milestone.paid_date or (proof.payment_date if proof else date.today()),
            "bank": milestone.bank,
            "reference": milestone.transaction_reference or (proof.transaction_reference if proof else ""),
            "amount": milestone.amount,
        }
    ]
    previous = list(milestone.documents.filter(doc_type="PAYMENT_RECEIPT", is_visible_to_customer=True).values_list("id", flat=True))

    from documents.models import Document
    from documents.services import generate_receipt_document

    document = generate_receipt_document(milestone, proof, milestone.amount, entries=entries, customer=customer)
    Document.objects.filter(id__in=previous).update(is_visible_to_customer=False)

    AuditLog.record(
        admin_user, "milestone.regenerate_receipt", target=milestone,
        details={"document": document.id, "replaced": previous}, ip_address=None,
    )
    return document


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
    # Continue after the highest kept milestone, never at 1: kept ones needn't be numbered 1..n (instalment 1
    # only exists once the KYC receipt is recorded), and 1 stays reserved so record_kyc_instalment can still add it.
    next_sequence = max(kept.aggregate(top=Max("sequence"))["top"] or 0, KYC_INSTALMENT_SEQUENCE) + 1
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
