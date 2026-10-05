from django.core.management.base import BaseCommand

from payments.services import refresh_plot_milestone_statuses
from projects.models import Plot


class Command(BaseCommand):
    help = "Promotes the next unpaid milestone to DUE and flags past-due ones as OVERDUE for every plot. Run nightly via cron."

    def handle(self, *args, **options):
        count = 0
        for plot in Plot.objects.filter(milestones__isnull=False).distinct():
            refresh_plot_milestone_statuses(plot)
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Refreshed milestone statuses for {count} plot(s)."))
