from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_image_file


class Notification(TimeStampedModel):
    """5.11 Notifications — per-customer inbox."""

    class NotifType(models.TextChoices):
        KYC_APPROVED = "KYC_APPROVED", "KYC approved"
        KYC_REJECTED = "KYC_REJECTED", "KYC rejected"
        PAYMENT_PROOF_SUBMITTED = "PAYMENT_PROOF_SUBMITTED", "Payment proof submitted"
        PAYMENT_APPROVED = "PAYMENT_APPROVED", "Payment approved"
        PAYMENT_REJECTED = "PAYMENT_REJECTED", "Payment rejected"
        RECEIPT_ISSUED = "RECEIPT_ISSUED", "Receipt issued"
        DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED", "Document uploaded"
        PAYMENT_DUE_REMINDER = "PAYMENT_DUE_REMINDER", "Payment due reminder"
        TICKET_REPLY = "TICKET_REPLY", "Ticket reply"
        MILESTONE_CHANGE_APPROVED = "MILESTONE_CHANGE_APPROVED", "Milestone change approved"
        MILESTONE_CHANGE_DECLINED = "MILESTONE_CHANGE_DECLINED", "Milestone change declined"
        MILESTONE_CHANGE_COUNTERED = "MILESTONE_CHANGE_COUNTERED", "Milestone change countered"
        ANNOUNCEMENT = "ANNOUNCEMENT", "Announcement"
        BANNER = "BANNER", "New banner"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="notifications")
    notif_type = models.CharField(max_length=40, choices=NotifType.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    deep_link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]


class Banner(TimeStampedModel):
    """7.15 Banners — dashboard carousel content."""

    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to="banners/", validators=[validate_image_file])
    link_target = models.CharField(max_length=200, blank=True, help_text="Deep link / screen name / URL")
    display_order = models.PositiveIntegerField(default=0)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "-created_at"]

    def __str__(self):
        return self.title

    def is_currently_active(self):
        from django.utils import timezone

        today = timezone.now().date()
        if not self.is_active:
            return False
        if self.start_date and today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False
        return True


class NotificationCampaign(TimeStampedModel):
    """7.16 Notifications & Email — compose (draft) and send to all, a project, or a selected list."""

    class TargetType(models.TextChoices):
        ALL = "ALL", "All customers"
        PROJECT = "PROJECT", "A project"
        SELECTED = "SELECTED", "Selected customers"

    class Channel(models.TextChoices):
        PUSH = "PUSH", "Push"
        EMAIL = "EMAIL", "Email"
        BOTH = "BOTH", "Push + Email"

    class CampaignStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"

    title = models.CharField(max_length=200)
    body = models.TextField()
    target_type = models.CharField(max_length=20, choices=TargetType.choices, default=TargetType.ALL)
    target_project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.SET_NULL)
    target_customers = models.ManyToManyField("accounts.Customer", blank=True, related_name="campaigns")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.BOTH)
    sent_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=CampaignStatus.choices, default=CampaignStatus.DRAFT)
    created_by = models.ForeignKey("accounts.AdminUser", null=True, on_delete=models.SET_NULL)
    recipient_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
