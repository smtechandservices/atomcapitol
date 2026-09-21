from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_payment_proof_file


class Milestone(TimeStampedModel):
    """Per-plot instalment. Generated from the plot's commercial position at assignment,
    then editable by admin (7.9). Shared by primary + co-applicants on the same plot.
    """

    class Status(models.TextChoices):
        UPCOMING = "UPCOMING", "Upcoming"
        DUE = "DUE", "Due"
        OVERDUE = "OVERDUE", "Overdue"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        PAID = "PAID", "Paid"
        REJECTED = "REJECTED", "Rejected"

    plot = models.ForeignKey("projects.Plot", on_delete=models.CASCADE, related_name="milestones")
    sequence = models.PositiveIntegerField()
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPCOMING)

    paid_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(max_length=50, blank=True)
    transaction_reference = models.CharField(max_length=100, blank=True)
    admin_remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["plot", "sequence"]
        unique_together = [("plot", "sequence")]

    def __str__(self):
        return f"{self.plot} - Milestone {self.sequence} ({self.name})"


class PaymentProof(TimeStampedModel):
    """5.5 Milestone Payment & Proof Upload — submitted against the FULL milestone amount."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE, related_name="proofs")
    submitted_by = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="payment_proofs")
    file = models.FileField(upload_to="payments/proofs/", validators=[validate_payment_proof_file])
    claimed_amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_date = models.DateField()
    payment_mode = models.CharField(max_length=50, blank=True)
    transaction_reference = models.CharField(max_length=100, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey("accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Proof #{self.id} for {self.milestone}"


class MilestoneChangeRequest(TimeStampedModel):
    """5.6 Request Milestone Change — the existing plan holds until admin approves (7.11)."""

    class ChangeType(models.TextChoices):
        PAY_MORE = "PAY_MORE", "Pay more now"
        PAY_LESS = "PAY_LESS", "Pay less"
        CHANGE_DATE = "CHANGE_DATE", "Change due date"
        CHANGE_INSTALMENTS = "CHANGE_INSTALMENTS", "Change instalment count"
        RESPLIT = "RESPLIT", "Re-split remaining balance"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        DECLINED = "DECLINED", "Declined"
        COUNTERED = "COUNTERED", "Countered"

    plot = models.ForeignKey("projects.Plot", on_delete=models.CASCADE, related_name="change_requests")
    requested_by = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="change_requests")
    change_type = models.CharField(max_length=30, choices=ChangeType.choices)
    proposed_details = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True)
    attachment = models.FileField(upload_to="payments/change_requests/", null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    admin_response = models.TextField(blank=True)
    counter_schedule = models.JSONField(default=dict, blank=True)
    reviewed_by = models.ForeignKey("accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ChangeRequest #{self.id} for {self.plot}"
