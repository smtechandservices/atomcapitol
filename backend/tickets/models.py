from django.db import models

from core.models import TimeStampedModel


class Ticket(TimeStampedModel):
    """5.8-5.10 Support Tickets + 7.14 admin queue."""

    class Category(models.TextChoices):
        PAYMENT = "PAYMENT", "Payment"
        DOCUMENTS = "DOCUMENTS", "Documents"
        CONSTRUCTION = "CONSTRUCTION", "Construction"
        GENERAL = "GENERAL", "General"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"

    customer = models.ForeignKey("accounts.Customer", on_delete=models.CASCADE, related_name="tickets")
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.GENERAL)
    subject = models.CharField(max_length=200)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    assigned_to = models.ForeignKey(
        "accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_tickets"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"#{self.id} {self.subject}"


class TicketMessage(TimeStampedModel):
    class SenderType(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Customer"
        ADMIN = "ADMIN", "Admin"

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)
    sender_customer = models.ForeignKey("accounts.Customer", null=True, blank=True, on_delete=models.SET_NULL)
    sender_admin = models.ForeignKey("accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL)
    message = models.TextField(blank=True)
    attachment = models.FileField(upload_to="tickets/attachments/", null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
