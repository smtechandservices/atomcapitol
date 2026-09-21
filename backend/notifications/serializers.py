from rest_framework import serializers

from core.serializers import apply_html_form_boolean_defaults

from .models import Banner, Notification, NotificationCampaign


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "notif_type", "title", "body", "deep_link", "is_read", "created_at"]
        read_only_fields = fields


class BannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = ["id", "title", "image", "link_target", "display_order", "start_date", "end_date", "is_active"]

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_active": True})
        return super().create(validated_data)


class NotificationCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationCampaign
        fields = [
            "id",
            "title",
            "body",
            "target_type",
            "target_project",
            "target_customers",
            "channel",
            "scheduled_at",
            "sent_at",
            "status",
            "recipient_count",
            "created_at",
        ]
        read_only_fields = ["id", "sent_at", "status", "recipient_count", "created_at"]
