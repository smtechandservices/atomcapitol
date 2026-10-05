from django.db import models

from core.models import TimeStampedModel


class SalesPerson(TimeStampedModel):
    """7.17 Sales Team — display-only contact info shown in the customer's app.
    No portal login, no notifications, no ticket access.
    """

    name = models.CharField(max_length=200)
    photo = models.ImageField(upload_to="sales/photos/", null=True, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
