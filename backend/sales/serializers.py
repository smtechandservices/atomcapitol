from rest_framework import serializers

from core.serializers import apply_html_form_boolean_defaults

from .models import SalesPerson


class SalesPersonSerializer(serializers.ModelSerializer):
    customer_count = serializers.SerializerMethodField()

    class Meta:
        model = SalesPerson
        fields = ["id", "name", "photo", "phone", "email", "is_active", "customer_count", "created_at"]

    def get_customer_count(self, obj):
        # annotated by SalesPersonViewSet.get_queryset(); fall back for create/update responses
        count = getattr(obj, "linked_customers", None)
        return count if count is not None else obj.customers.count()

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_active": True})
        return super().create(validated_data)
