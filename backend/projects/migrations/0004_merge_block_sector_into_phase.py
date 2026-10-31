from django.db import migrations
from django.db.models import F


def block_sector_to_phase(apps, schema_editor):
    """Plots kept their phase in block_sector before the two fields were merged; a phase already set wins."""
    Plot = apps.get_model("projects", "Plot")
    Plot.objects.filter(phase="").exclude(block_sector="").update(phase=F("block_sector"))


def phase_to_block_sector(apps, schema_editor):
    Plot = apps.get_model("projects", "Plot")
    for plot in Plot.objects.exclude(phase=""):
        plot.block_sector = plot.phase[:50]
        plot.save(update_fields=["block_sector"])


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0003_plot_phase_plot_price_is_manual_and_more"),
    ]

    operations = [
        migrations.RunPython(block_sector_to_phase, phase_to_block_sector),
        migrations.RemoveField(model_name="plot", name="block_sector"),
    ]
