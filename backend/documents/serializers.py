from rest_framework import serializers

from core.serializers import apply_html_form_boolean_defaults

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = [
            "id",
            "name",
            "doc_type",
            "status",
            "file",
            "milestone",
            "project",
            "created_at",
        ]
        read_only_fields = fields


class AdminDocumentSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", default=None, read_only=True)
    customer_name = serializers.CharField(source="customer.name", default=None, read_only=True)
    plot_number = serializers.CharField(source="customer.assigned_plot.plot_number", default=None, read_only=True)
    project_name = serializers.SerializerMethodField()
    milestone_name = serializers.CharField(source="milestone.name", default=None, read_only=True)
    uploaded_by_email = serializers.CharField(source="uploaded_by.email", default=None, read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "customer",
            "customer_email",
            "customer_name",
            "plot_number",
            "project",
            "project_name",
            "milestone",
            "milestone_name",
            "name",
            "doc_type",
            "status",
            "file",
            "is_visible_to_customer",
            "uploaded_by",
            "uploaded_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "updated_at"]

    def get_project_name(self, obj):
        # Fall back to the customer's plot for customer documents filed without a project.
        if obj.project_id:
            return obj.project.name
        plot = obj.customer.assigned_plot if obj.customer_id else None
        return plot.project.name if plot else None

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_visible_to_customer": True})
        # A customer's document belongs to the project of their plot (so project filters/stats include it).
        customer = validated_data.get("customer")
        if customer and not validated_data.get("project") and customer.assigned_plot_id:
            validated_data["project"] = customer.assigned_plot.project
        return super().create(validated_data)
