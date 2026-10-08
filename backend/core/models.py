from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(models.Model):
    """Record of who changed what and when across the admin portal.
    Kept for settings.AUDIT_LOG_RETENTION_DAYS — older entries are pruned on every write (see record())."""

    actor = models.ForeignKey(
        "accounts.AdminUser", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_entries"
    )
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["action"]),
            models.Index(fields=["created_at"]),  # retention prune + newest-first listing
        ]

    def __str__(self):
        return f"{self.action} by {self.actor_id} @ {self.created_at:%Y-%m-%d %H:%M}"

    @classmethod
    def record(cls, actor, action, target=None, details=None, ip_address=None):
        target_type = target.__class__.__name__ if target is not None else ""
        target_id = str(getattr(target, "pk", "")) if target is not None else ""
        entry = cls.objects.create(
            actor=actor if getattr(actor, "pk", None) else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
            ip_address=ip_address,
        )
        cls.prune()
        return entry

    @classmethod
    def prune(cls):
        """Delete entries older than the retention window. Cheap: one indexed range delete."""
        from datetime import timedelta

        from django.conf import settings
        from django.utils import timezone

        days = getattr(settings, "AUDIT_LOG_RETENTION_DAYS", 7)
        return cls.objects.filter(created_at__lt=timezone.now() - timedelta(days=days)).delete()[0]


class SiteSettings(models.Model):
    """Singleton row of global settings shown to customers / used by the app."""

    company_name = models.CharField(max_length=200, default="Atom Capitol")
    support_phone = models.CharField(max_length=30, blank=True)
    support_email = models.EmailField(blank=True)
    bank_account_name = models.CharField(max_length=200, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_ifsc = models.CharField(max_length=20, blank=True)
    bank_name = models.CharField(max_length=200, blank=True)
    upi_id = models.CharField(max_length=100, blank=True)
    receipt_template_note = models.TextField(
        blank=True, help_text="Free text footer/terms printed on auto-generated receipts."
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Site Settings"
        verbose_name_plural = "Site Settings"

    def __str__(self):
        return "Site Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def delete(self, *args, **kwargs):
        pass
