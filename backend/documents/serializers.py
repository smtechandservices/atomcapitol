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
    project_name = serializers.CharField(source="project.name", default=None, read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "customer",
            "customer_email",
            "project",
            "project_name",
            "milestone",
            "name",
            "doc_type",
            "status",
            "file",
            "is_visible_to_customer",
            "uploaded_by",
            "created_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at"]

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_visible_to_customer": True})
        return super().create(validated_data)
