from rest_framework import serializers

from core.serializers import apply_html_form_boolean_defaults

from .models import SalesPerson


class SalesPersonSerializer(serializers.ModelSerializer):
    customer_count = serializers.IntegerField(source="customers.count", read_only=True)

    class Meta:
        model = SalesPerson
        fields = ["id", "name", "photo", "phone", "email", "is_active", "customer_count", "created_at"]

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_active": True})
        return super().create(validated_data)
