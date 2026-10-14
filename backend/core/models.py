from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(models.Model):
    """Immutable record of who changed what and when across the admin portal."""

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
        ]

    def __str__(self):
        return f"{self.action} by {self.actor_id} @ {self.created_at:%Y-%m-%d %H:%M}"

    @classmethod
    def record(cls, actor, action, target=None, details=None, ip_address=None):
        target_type = target.__class__.__name__ if target is not None else ""
        target_id = str(getattr(target, "pk", "")) if target is not None else ""
        return cls.objects.create(
            actor=actor if getattr(actor, "pk", None) else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
            ip_address=ip_address,
        )


DEFAULT_RECEIPT_TERMS = """\
1. The Customer/Allottee shall make the required payment(s) within 30 (Thirty) days from the date of booking of the allotted plot/property.
2. The Customer acknowledges that the booking amount/token amount paid at the time of booking is non-refundable under all circumstances.
3. In the event the Customer voluntarily cancels the booking for any reason whatsoever, including but not limited to financial constraints, change of plans, personal reasons, dissatisfaction, inability to make payments, or any other reason, the Company shall not be liable to refund any amount received against the booked plot/property.
4. Failure to clear the outstanding amount within the stipulated period of 30 days shall constitute a payment default under the terms of allotment. In the event of such default, the Company shall be entitled to levy interest @ 1% (One Percent) per month on the outstanding balance amount from the expiry of the 30-day payment period until the date of actual realization of the dues.
5. The Company reserves the sole and absolute right to recover the outstanding principal amount along with accrued interest and any other applicable charges.
6. No Registry, Sale Deed, Conveyance Deed, Possession, NOC, Transfer, or any ownership-related document shall be issued or executed unless: (a) the entire sale consideration has been paid; and (b) all delayed payment interest and other outstanding charges have been fully cleared.
7. Continued non-payment may result in cancellation of the allotment in accordance with the Company's prevailing terms and conditions, without prejudice to any other legal rights available to the Company.
8. The Customer acknowledges and accepts that the Company's records regarding outstanding dues and interest calculations shall be final and binding.
9. After registry of plot this receipt will be null or void.
10. The company confirms that no scheme, ROI, buy-back offer, or related assurance was provided to the customer at the time of booking, nor was any such request made by the customer.
11. Registry charges & Legal Fees are additional and will be payable as per the prevailing government guidelines at the time of registration.
12. Subject to Ahmedabad / Bhavnagar Jurisdiction.
"""


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
    receipt_terms = models.TextField(blank=True, default=DEFAULT_RECEIPT_TERMS, help_text="Printed as the last page of payment receipts")
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
