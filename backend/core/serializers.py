from rest_framework import serializers

from .models import AuditLog, SiteSettings


def apply_html_form_boolean_defaults(serializer, validated_data, defaults):
    """Multipart/form-encoded submissions make DRF treat an *absent* BooleanField as
    False (it mirrors HTML checkbox semantics: an unchecked box sends nothing), which
    silently overrides a model's `default=True` the moment a client omits that field —
    regardless of what `default=` is passed to the serializer field itself. JSON bodies
    are unaffected since `html.is_html_input()` only triggers for QueryDict-like data.

    Call from a serializer's create() with {field_name: intended_default} for every
    BooleanField that should default to non-False on creation via a form-parsed endpoint.
    """
    for field_name, default_value in defaults.items():
        if field_name not in serializer.initial_data:
            validated_data[field_name] = default_value
    return validated_data


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = [
            "company_name",
            "support_phone",
            "support_email",
            "bank_account_name",
            "bank_account_number",
            "bank_ifsc",
            "bank_name",
            "upi_id",
            "receipt_template_note",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]


class PublicSiteSettingsSerializer(serializers.ModelSerializer):
    """Trimmed view exposed to CustomerApp: payment instructions + support contact only."""

    class Meta:
        model = SiteSettings
        fields = [
            "company_name",
            "support_phone",
            "support_email",
            "bank_account_name",
            "bank_account_number",
            "bank_ifsc",
            "bank_name",
            "upi_id",
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "target_label",
            "details",
            "ip_address",
            "created_at",
        ]

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.email if obj.actor else "System"

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None

    def get_target_label(self, obj):
        # Resolved in bulk per page by AuditLogListView (see target_labels); None when the record is gone.
        return self.context.get("target_labels", {}).get((obj.target_type, obj.target_id))
