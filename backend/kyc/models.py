from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_receipt_file, validate_video_file


class StepStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class KYCSubmission(TimeStampedModel):
    """One active submission per customer. Rejected steps are edited in place and
    resubmitted — unlimited attempts (Decisions confirmed, SRS p.11).
    """

    customer = models.OneToOneField("accounts.Customer", on_delete=models.CASCADE, related_name="kyc_submission")

    # Step 2 — plot confirmation + first payment receipt
    plot_confirmed = models.BooleanField(default=False)
    plot_mismatch_note = models.TextField(blank=True)
    receipt_file = models.FileField(upload_to="kyc/receipts/", null=True, blank=True, validators=[validate_receipt_file])
    receipt_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    receipt_payment_date = models.DateField(null=True, blank=True)
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
