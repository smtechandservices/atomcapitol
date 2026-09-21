from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.services import notify_customer
from payments.models import Milestone

REMINDER_WINDOW_DAYS = 3


class Command(BaseCommand):
    help = (
        "Sends a payment-due reminder notification for milestones due within "
        f"{REMINDER_WINDOW_DAYS} days or already overdue. Run daily via cron."
    )

    def handle(self, *args, **options):
        today = timezone.now().date()
        window_end = today + timedelta(days=REMINDER_WINDOW_DAYS)
        milestones = Milestone.objects.filter(
            status__in=[Milestone.Status.DUE, Milestone.Status.OVERDUE], due_date__lte=window_end
        ).select_related("plot")

        sent = 0
        for milestone in milestones:
            for customer in milestone.plot.customers.filter(is_active=True):
                notify_customer(
                    customer,
                    "PAYMENT_DUE_REMINDER",
                    f"Payment due: {milestone.name}",
                    f"₹{milestone.amount} is due on {milestone.due_date} for {milestone.plot}.",
                    deep_link=f"milestone:{milestone.id}",
                )
                sent += 1
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} payment reminder notification(s)."))
