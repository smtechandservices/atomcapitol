from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_document_file


class Document(TimeStampedModel):
    """5.7 Documents (Payment Receipts + Registry & Legal) and 7.13 admin management."""

    class DocType(models.TextChoices):
        PAYMENT_RECEIPT = "PAYMENT_RECEIPT", "Payment Receipt"
        REGISTRY = "REGISTRY", "Registry Document"
        LEGAL = "LEGAL", "Legal Document"
        OTHER = "OTHER", "Other"

    class DocStatus(models.TextChoices):
        ISSUED = "ISSUED", "Issued"
        IN_PROGRESS = "IN_PROGRESS", "In progress"

    customer = models.ForeignKey(
        "accounts.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="documents"
    )
    project = models.ForeignKey(
        "projects.Project", null=True, blank=True, on_delete=models.CASCADE, related_name="documents"
    )
    milestone = models.ForeignKey(
        "payments.Milestone", null=True, blank=True, on_delete=models.SET_NULL, related_name="documents"
    )

    name = models.CharField(max_length=200)
    doc_type = models.CharField(max_length=30, choices=DocType.choices)
    status = models.CharField(max_length=20, choices=DocStatus.choices, default=DocStatus.IN_PROGRESS)
    file = models.FileField(upload_to="documents/", null=True, blank=True, validators=[validate_document_file])
    is_visible_to_customer = models.BooleanField(default=True)

    uploaded_by = models.ForeignKey("accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
