from django.db import migrations


def backfill(apps, schema_editor):
    """Customer documents uploaded without a project get the project of the customer's plot."""
    Document = apps.get_model("documents", "Document")
    for doc in Document.objects.filter(project__isnull=True, customer__assigned_plot__isnull=False).select_related(
        "customer__assigned_plot"
    ):
        doc.project_id = doc.customer.assigned_plot.project_id
        doc.save(update_fields=["project"])


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0001_initial"),
        ("accounts", "0002_initial"),
        ("projects", "0001_initial"),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
