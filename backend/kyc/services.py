import random
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import Customer
from notifications.services import notify_customer

from .models import KYCDecisionLog, KYCSubmission, StepStatus

PROMPT_LINE_BANK = [
    "My name is stated on my registered plot booking.",
    "I confirm this video was recorded live for Atom Capitol KYC.",
    "Today's date is {date} and I am verifying my identity.",
    "I am the rightful buyer of the plot booked with Atom Capitol.",
    "This recording is solely for the purpose of KYC verification.",
    "I authorize Atom Capitol to review my submitted documents.",
]


def generate_prompt_lines(count=3):
    lines = random.sample(PROMPT_LINE_BANK, k=min(count, len(PROMPT_LINE_BANK)))
    return [line.format(date=timezone.now().strftime("%d %b %Y")) for line in lines]


def get_or_create_submission(customer):
    submission, _ = KYCSubmission.objects.get_or_create(customer=customer)
    return submission


IDENTITY_FIELDS = ("aadhaar_front", "aadhaar_back", "pan_card")
# Every file Step 1 takes. Each one left out keeps the one on record.
STEP1_FILE_FIELDS = (
    "receipt_file",
    *IDENTITY_FIELDS,
    "photo",
    "cancelled_cheque",
    "co_applicant_aadhaar_front",
    "co_applicant_aadhaar_back",
    "co_applicant_pan_card",
    "co_applicant_photo",
)
CO_APPLICANT_TEXT_FIELDS = ("co_applicant_name", "co_applicant_phone", "co_applicant_email")


def step1_open(customer, submission):
    """Step 1 can be (re)sent until the plot confirmation (Step 2) is in review or approved: a buyer without a plot
    edits it while they wait, and one whose Step 2 was sent back fixes their documents here."""
    if customer.assigned_plot_id is None:
        return True
    return submission is None or submission.step2_status in (None, StepStatus.REJECTED)


def _phone_digits(phone):
    return "".join(ch for ch in phone if ch.isdigit())[-10:]


def _link_sales_person(customer, phone):
    """Links the sales person the buyer named when their phone matches someone on the sales team."""
    from sales.models import SalesPerson

    digits = _phone_digits(phone)
    if customer.assigned_sales_person_id or len(digits) < 10:
        return
    match = next((p for p in SalesPerson.objects.filter(is_active=True) if _phone_digits(p.phone) == digits), None)
    if match:
        customer.assigned_sales_person = match
        customer.save(update_fields=["assigned_sales_person", "updated_at"])


@transaction.atomic
def submit_step1(customer, *, name, phone, receipt_amount, sales_person_name, sales_person_phone, project=None, phase="",
                 claimed_plot_number="", co_applicant_name="", co_applicant_phone="", co_applicant_email="", accept_terms=True, **files):
    """The first KYC screen. A buyer without a plot also says which one they bought (project, phase, plot number);
    admin matches it to a listed plot and assigns it, which unlocks Step 2. Re-submittable while step1_open();
    files left as None keep what's on record, and all of them count for Step 2 too.
    """
    customer.name = name
    customer.phone = phone
    customer.save(update_fields=["name", "phone", "updated_at"])

    submission = get_or_create_submission(customer)
    if customer.assigned_plot_id is None:
        submission.selected_project = project
        submission.claimed_project = project.name
        submission.claimed_phase = phase
        submission.claimed_plot_number = claimed_plot_number.strip()
    submission.receipt_amount = receipt_amount
    submission.sales_person_name = sales_person_name
    submission.sales_person_phone = sales_person_phone
    for field, value in zip(CO_APPLICANT_TEXT_FIELDS, (co_applicant_name, co_applicant_phone, co_applicant_email)):
        setattr(submission, field, value.strip())
    if not co_applicant_name.strip():
        # No co-applicant (any more): drop their files too, so they aren't reviewed.
        for field in STEP1_FILE_FIELDS:
            if field.startswith("co_applicant_"):
                setattr(submission, field, "")
    for field in STEP1_FILE_FIELDS:
        if files.get(field) is not None:
            setattr(submission, field, files[field])
    submission.terms_accepted_at = timezone.now()
    submission.step1_submitted_at = timezone.now()
    submission.save()
    _link_sales_person(customer, sales_person_phone)
    return submission


def reset_submission(customer):
    """Wipes a submission back to nothing submitted (files stay in storage; the decision log is kept for audit)."""
    KYCSubmission.objects.filter(customer=customer).update(
        claimed_project="",
        claimed_plot_number="",
        step1_submitted_at=None,
        selected_project=None,
        claimed_phase="",
        photo="",
        cancelled_cheque="",
        co_applicant_name="",
        co_applicant_phone="",
        co_applicant_email="",
        co_applicant_aadhaar_front="",
        co_applicant_aadhaar_back="",
        co_applicant_pan_card="",
        co_applicant_photo="",
        sales_person_name="",
        sales_person_phone="",
        terms_accepted_at=None,
        plot_confirmed=False,
        plot_mismatch_note="",
        receipt_file="",
        receipt_amount=None,
        receipt_payment_date=None,
        aadhaar_front="",
        aadhaar_back="",
        pan_card="",
        step2_status=None,
        step2_rejection_reason="",
        step2_submitted_at=None,
        video_file="",
        prompt_lines=[],
        step3_status=None,
        step3_rejection_reason="",
        step3_submitted_at=None,
        reviewed_by=None,
        reviewed_at=None,
    )


def submit_step2(
    customer,
    *,
    plot_confirmed,
    plot_mismatch_note,
    receipt_file=None,
    receipt_amount=None,
    receipt_payment_date=None,
    aadhaar_front=None,
    aadhaar_back=None,
    pan_card=None,
):
    """The receipt, amount and ID files left as None keep whatever is on record (sent with Step 1, or a
    resubmission after a rejection)."""
    submission = get_or_create_submission(customer)
    submission.plot_confirmed = plot_confirmed
    submission.plot_mismatch_note = plot_mismatch_note
    if receipt_file is not None:
        submission.receipt_file = receipt_file
    for field, file in zip(IDENTITY_FIELDS, (aadhaar_front, aadhaar_back, pan_card)):
        if file is not None:
            setattr(submission, field, file)
    if receipt_amount is not None:
        submission.receipt_amount = receipt_amount
    if receipt_payment_date is not None:
        submission.receipt_payment_date = receipt_payment_date
    submission.step2_status = StepStatus.PENDING
    submission.step2_rejection_reason = ""
    submission.step2_submitted_at = timezone.now()
    submission.save()
    _recompute_customer_status(customer, submission)
    return submission


def submit_step3(customer, *, video_file):
    submission = get_or_create_submission(customer)
    if not submission.prompt_lines:
        submission.prompt_lines = generate_prompt_lines()
    submission.video_file = video_file
    submission.step3_status = StepStatus.PENDING
    submission.step3_rejection_reason = ""
    submission.step3_submitted_at = timezone.now()
    submission.save()
    _recompute_customer_status(customer, submission)
    return submission


def skip_step3(customer):
    """Video KYC is optional: withdraws a video that's waiting for review or was sent back."""
    submission = get_or_create_submission(customer)
    submission.video_file = ""
    submission.step3_status = None
    submission.step3_rejection_reason = ""
    submission.step3_submitted_at = None
    submission.save()
    _recompute_customer_status(customer, submission)
    return submission


def _recompute_customer_status(customer, submission):
    # Video KYC is optional: an approved Step 2 is enough unless a video is sent (then it's reviewed too).
    if submission.step2_status == StepStatus.REJECTED or submission.step3_status == StepStatus.REJECTED:
        new_status = Customer.KYCStatus.REJECTED
    elif submission.step2_status == StepStatus.APPROVED and submission.step3_status in (None, StepStatus.APPROVED):
        new_status = Customer.KYCStatus.APPROVED
    elif submission.step2_status or submission.step3_status:
        new_status = Customer.KYCStatus.SUBMITTED
    else:
        new_status = Customer.KYCStatus.NOT_STARTED
    if customer.kyc_status != new_status:
        customer.kyc_status = new_status
        customer.save(update_fields=["kyc_status"])
    return new_status


def needs_payment_terms(submission):
    """Approving the primary buyer's Step 2 generates the plot's schedule, so it needs payment terms unless one exists."""
    customer = submission.customer
    plot = customer.assigned_plot
    return bool(plot and customer.plot_role == "PRIMARY" and not plot.milestones.filter(sequence__gte=2).exists())


def booking_amount(submission, receipt_entries=None):
    """Instalment 1: the payments the admin verified on the receipt, else what the customer says they paid."""
    if receipt_entries:
        return sum(Decimal(e["amount"]) for e in receipt_entries)
    return submission.receipt_amount or Decimal(0)


def apply_payment_terms(submission, *, total_value, instalment_count, receipt_entries=None):
    """Sets the plot's terms at Step 2 approval. The booking receipt is everything paid outside the app, so it
    becomes amount_paid_outside_app and the rest of total_value is split over instalments 2..instalment_count.
    """
    from payments.services import KYC_INSTALMENT_SEQUENCE, PaymentError

    plot = submission.customer.assigned_plot
    existing = plot.milestones.filter(sequence=KYC_INSTALMENT_SEQUENCE).first()
    paid = existing.amount if existing else booking_amount(submission, receipt_entries)
    if total_value <= paid:
        raise PaymentError("Total value must be more than the booking payment (instalment 1).", "total_value_too_low")
    plot.total_value = total_value
    plot.instalment_count = instalment_count
    plot.amount_paid_outside_app = paid
    plot.save(update_fields=["total_value", "instalment_count", "amount_paid_outside_app", "updated_at"])


@transaction.atomic
def decide_step(submission, *, step, decision, reason, admin_user, receipt_entries=None, payment_terms=None, schedule_options=None):
    """step in {'STEP2','STEP3'}; decision in {'APPROVED','REJECTED'}.
    `receipt_entries` on a STEP2 approval also issues the first-payment receipt PDF.
    `payment_terms` ({total_value, instalment_count}) on the primary buyer's STEP2 approval set the plot's schedule,
    laid out by `schedule_options` ({frequency, due_dates}, see payments.services.schedule_rows)."""
    if step == "STEP2" and decision == "APPROVED":
        from payments.services import PaymentError

        if payment_terms:
            apply_payment_terms(submission, receipt_entries=receipt_entries, **payment_terms)
        plot = submission.customer.assigned_plot
        if needs_payment_terms(submission) and not (plot.total_value and plot.instalment_count):
            raise PaymentError("Set the total value and number of instalments to approve Step 2.", "payment_terms_required")

    field_status = "step2_status" if step == "STEP2" else "step3_status"
    field_reason = "step2_rejection_reason" if step == "STEP2" else "step3_rejection_reason"

    setattr(submission, field_status, decision)
    setattr(submission, field_reason, reason if decision == "REJECTED" else "")
    submission.reviewed_by = admin_user
    submission.reviewed_at = timezone.now()
    submission.save()

    KYCDecisionLog.objects.create(submission=submission, step=step, decision=decision, reason=reason, decided_by=admin_user)

    customer = submission.customer
    new_status = _recompute_customer_status(customer, submission)

    if step == "STEP2" and decision == "APPROVED":
        from payments.services import ensure_schedule, record_kyc_instalment

        record_kyc_instalment(submission, receipt_entries=receipt_entries)
        ensure_schedule(customer.assigned_plot, **(schedule_options or {}))

    if new_status == Customer.KYCStatus.APPROVED:
        notify_customer(customer, "KYC_APPROVED", "Your KYC is approved", "Your account is now fully unlocked.", deep_link="home")
    elif decision == "REJECTED":
        notify_customer(
            customer,
            "KYC_REJECTED",
            f"KYC {step.title()} rejected",
            reason or "Please review and resubmit.",
            deep_link="kyc_rejected",
        )
    return submission
