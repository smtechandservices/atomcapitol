import random

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


def submit_step2(customer, *, plot_confirmed, plot_mismatch_note, receipt_file, receipt_amount, receipt_payment_date):
    submission = get_or_create_submission(customer)
    submission.plot_confirmed = plot_confirmed
    submission.plot_mismatch_note = plot_mismatch_note
    if receipt_file is not None:
        submission.receipt_file = receipt_file
    submission.receipt_amount = receipt_amount
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


def _recompute_customer_status(customer, submission):
    if submission.step2_status == StepStatus.REJECTED or submission.step3_status == StepStatus.REJECTED:
        new_status = Customer.KYCStatus.REJECTED
    elif submission.step2_status == StepStatus.APPROVED and submission.step3_status == StepStatus.APPROVED:
        new_status = Customer.KYCStatus.APPROVED
    elif submission.step2_status or submission.step3_status:
        new_status = Customer.KYCStatus.SUBMITTED
    else:
        new_status = Customer.KYCStatus.NOT_STARTED
    if customer.kyc_status != new_status:
        customer.kyc_status = new_status
        customer.save(update_fields=["kyc_status"])
    return new_status


def decide_step(submission, *, step, decision, reason, admin_user):
    """step in {'STEP2','STEP3'}; decision in {'APPROVED','REJECTED'}."""
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
