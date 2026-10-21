from decimal import Decimal

from django.db import migrations
from django.db.models import Sum

SETTLED = ["PAID", "UNDER_REVIEW"]


def resplit(apps, schema_editor):
    """Schedules generated before outside_app_not_scheduled deducted the booking payment twice: once as
    amount_paid_outside_app and again as the KYC instalment 1 recording the same money. Re-split their unpaid
    instalments so the plan adds up to total_value again (same rule as services._resplit_unpaid).
    """
    Plot = apps.get_model("projects", "Plot")
    Milestone = apps.get_model("payments", "Milestone")

    plots = Plot.objects.filter(
        total_value__isnull=False, amount_paid_outside_app__gt=0, milestones__sequence=1, milestones__status="PAID"
    ).distinct()
    for plot in plots:
        milestones = Milestone.objects.filter(plot=plot)
        unpaid = list(milestones.exclude(status__in=SETTLED).order_by("sequence"))
        if not unpaid:
            continue
        booking = milestones.get(sequence=1).amount
        outside = max(plot.amount_paid_outside_app - booking, Decimal(0))
        settled_total = milestones.filter(status__in=SETTLED).aggregate(t=Sum("amount"))["t"] or 0
        remaining = max(plot.total_value - outside - settled_total, Decimal(0))
        base = round(remaining / len(unpaid), 2)
        amounts = [base] * (len(unpaid) - 1) + [remaining - base * (len(unpaid) - 1)]
        for m, amount in zip(unpaid, amounts):
            if m.amount != amount:
                m.amount = amount
                m.save(update_fields=["amount"])


class Migration(migrations.Migration):
    dependencies = [
        ("payments", "0001_initial"),
        ("projects", "0002_plot_rate_plc"),
    ]

    operations = [migrations.RunPython(resplit, migrations.RunPython.noop)]
