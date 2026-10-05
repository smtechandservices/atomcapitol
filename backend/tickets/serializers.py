from rest_framework import serializers

from .models import Ticket, TicketMessage


class TicketMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = ["id", "sender_type", "sender_name", "message", "attachment", "created_at"]

    def get_sender_name(self, obj):
        if obj.sender_type == TicketMessage.SenderType.CUSTOMER:
            return obj.sender_customer.get_full_name() if obj.sender_customer else "Customer"
        return obj.sender_admin.get_full_name() if obj.sender_admin else "Support"


class TicketListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ["id", "category", "subject", "status", "created_at", "updated_at"]


class TicketDetailSerializer(serializers.ModelSerializer):
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "category", "subject", "description", "status", "messages", "created_at", "updated_at"]


class TicketCreateSerializer(serializers.ModelSerializer):
    attachment = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Ticket
        fields = ["id", "category", "subject", "description", "attachment"]
        read_only_fields = ["id"]


class TicketReplySerializer(serializers.Serializer):
    message = serializers.CharField()
    attachment = serializers.FileField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Admin — 7.14 Tickets
# ---------------------------------------------------------------------------
class AdminTicketListSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    assigned_to_email = serializers.CharField(source="assigned_to.email", default=None, read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "customer_email", "category", "subject", "status", "assigned_to_email", "created_at", "updated_at"]


class AdminTicketDetailSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "customer", "customer_email", "category", "subject", "description",
            "status", "assigned_to", "messages", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "customer", "customer_email", "category", "subject", "description", "messages", "created_at", "updated_at"]


class AdminTicketAssignSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField(allow_null=True)


class AdminTicketStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Ticket.Status.choices)
