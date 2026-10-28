from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_identity_file, validate_image_file, validate_receipt_file, validate_video_file


class StepStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class KYCSubmission(TimeStampedModel):
    """One active submission per customer. Rejected steps are edited in place and
    resubmitted — unlimited attempts (Decisions confirmed, SRS p.11).
    """

    customer = models.OneToOneField("accounts.Customer", on_delete=models.CASCADE, related_name="kyc_submission")

    # Step 1 — only for customers without a plot (self-registered): the plot they say they bought, as typed,
    # plus the Aadhaar / PAN files below. Admin matches it to a listed plot and assigns it, which unlocks Step 2.
    claimed_project = models.CharField(max_length=200, blank=True)
    claimed_plot_number = models.CharField(max_length=50, blank=True)
    step1_submitted_at = models.DateTimeField(null=True, blank=True)
    # Picked from the project / phase dropdowns; claimed_project keeps the project's name as text.
    selected_project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    claimed_phase = models.CharField(max_length=100, blank=True)

    # Also from Step 1 (the first KYC screen), for every buyer — with a plot or not.
    photo = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_image_file])
    cancelled_cheque = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    co_applicant_name = models.CharField(max_length=200, blank=True)
    co_applicant_phone = models.CharField(max_length=20, blank=True)
    co_applicant_email = models.EmailField(blank=True)
    co_applicant_aadhaar_front = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    co_applicant_aadhaar_back = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    co_applicant_pan_card = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    co_applicant_photo = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_image_file])
    # The sales person the buyer dealt with, as they typed it (matched to the sales team when the phone matches).
    sales_person_name = models.CharField(max_length=200, blank=True)
    sales_person_phone = models.CharField(max_length=20, blank=True)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)

    # Step 2 — plot confirmation + first payment receipt (the receipt and amount may come with Step 1)
    plot_confirmed = models.BooleanField(default=False)
    plot_mismatch_note = models.TextField(blank=True)
    receipt_file = models.FileField(upload_to="kyc/receipts/", null=True, blank=True, validators=[validate_receipt_file])
    receipt_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    receipt_payment_date = models.DateField(null=True, blank=True)
    # Identity documents, uploaded with the receipt (or earlier, in Step 1) and reviewed as part of Step 2.
    # aadhaar_back is optional: an e-Aadhaar PDF carries both sides in one file.
    aadhaar_front = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    aadhaar_back = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    pan_card = models.FileField(upload_to="kyc/identity/", null=True, blank=True, validators=[validate_identity_file])
    step2_status = models.CharField(max_length=20, choices=StepStatus.choices, null=True, blank=True)
    step2_rejection_reason = models.TextField(blank=True)
    step2_submitted_at = models.DateTimeField(null=True, blank=True)

    # Step 3 — video KYC (liveness)
    video_file = models.FileField(upload_to="kyc/videos/", null=True, blank=True, validators=[validate_video_file])
    prompt_lines = models.JSONField(default=list, blank=True)
    step3_status = models.CharField(max_length=20, choices=StepStatus.choices, null=True, blank=True)
    step3_rejection_reason = models.TextField(blank=True)
    step3_submitted_at = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.ForeignKey("accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"KYC for {self.customer.email}"

    @property
    def is_fully_submitted(self):
        return self.step2_status is not None and self.step3_status is not None

    @property
    def wait_time_display(self):
        from django.utils import timezone

        ref = self.step3_submitted_at or self.step2_submitted_at
        if not ref:
            return None
        return timezone.now() - ref


class KYCDecisionLog(TimeStampedModel):
    """Every admin decision across resubmissions, kept for audit history."""

    submission = models.ForeignKey(KYCSubmission, on_delete=models.CASCADE, related_name="decisions")
    step = models.CharField(max_length=10, choices=[("STEP2", "Step 2"), ("STEP3", "Step 3")])
    decision = models.CharField(max_length=20, choices=[("APPROVED", "Approved"), ("REJECTED", "Rejected")])
    reason = models.TextField(blank=True)
    decided_by = models.ForeignKey("accounts.AdminUser", null=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]
