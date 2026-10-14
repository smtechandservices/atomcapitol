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
def _admin_name(user):
    if not user:
        return None
    return f"{user.first_name} {user.last_name}".strip() or user.email


class AdminTicketListSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    plot_number = serializers.CharField(source="customer.assigned_plot.plot_number", default=None, read_only=True)
    project_name = serializers.CharField(source="customer.assigned_plot.project.name", default=None, read_only=True)
    assigned_to_email = serializers.CharField(source="assigned_to.email", default=None, read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    # annotated by views.admin_ticket_queryset()
    last_message_at = serializers.DateTimeField(read_only=True, default=None)
    last_sender_type = serializers.CharField(read_only=True, default=None)
    last_message = serializers.CharField(read_only=True, default=None)
    message_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Ticket
        fields = [
            "id", "customer_id", "customer_email", "customer_name", "plot_number", "project_name",
            "category", "subject", "status", "assigned_to_email", "assigned_to_name",
            "last_message_at", "last_sender_type", "last_message", "message_count", "created_at", "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        return _admin_name(obj.assigned_to)


class AdminTicketDetailSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot_number = serializers.CharField(source="customer.assigned_plot.plot_number", default=None, read_only=True)
    project_name = serializers.CharField(source="customer.assigned_plot.project.name", default=None, read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "customer", "customer_email", "customer_name", "customer_phone", "kyc_status", "plot_number",
            "project_name", "category", "subject", "description", "status", "assigned_to", "assigned_to_name",
            "messages", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "customer", "customer_email", "category", "subject", "description", "messages", "created_at", "updated_at"]


    def get_assigned_to_name(self, obj):
        return _admin_name(obj.assigned_to)


class AdminTicketAssignSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField(allow_null=True)


class AdminTicketStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Ticket.Status.choices)
