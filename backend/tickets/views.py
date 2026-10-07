from django.db.models import Count, F, OuterRef, Q, Subquery
from django.db.models.functions import Substr
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminUser
from core.permissions import IsKYCApproved, role_required

from . import services
from .models import Ticket, TicketMessage
from .serializers import (
    AdminTicketAssignSerializer,
    AdminTicketDetailSerializer,
    AdminTicketListSerializer,
    AdminTicketStatusSerializer,
    TicketCreateSerializer,
    TicketDetailSerializer,
    TicketListSerializer,
    TicketReplySerializer,
)


# ---------------------------------------------------------------------------
# CustomerApp — 5.8/5.9/5.10 Support Tickets
# ---------------------------------------------------------------------------
class CustomerTicketListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsKYCApproved]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "category"]

    def get_serializer_class(self):
        return TicketListSerializer if self.request.method == "GET" else TicketCreateSerializer

    def get_queryset(self):
        return Ticket.objects.filter(customer=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ticket = services.create_ticket(
            request.user,
            category=data["category"],
            subject=data["subject"],
            description=data["description"],
            attachment=data.get("attachment"),
        )
        return Response(TicketDetailSerializer(ticket).data, status=status.HTTP_201_CREATED)


class CustomerTicketDetailView(generics.RetrieveAPIView):
    serializer_class = TicketDetailSerializer
    permission_classes = [IsKYCApproved]

    def get_queryset(self):
        return Ticket.objects.filter(customer=self.request.user)


class CustomerTicketReplyView(APIView):
    permission_classes = [IsKYCApproved]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request, pk=None):
        ticket = Ticket.objects.filter(pk=pk, customer=request.user).first()
        if not ticket:
            raise NotFound("Ticket not found.")
        serializer = TicketReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.add_customer_reply(
                ticket, request.user,
                message=serializer.validated_data["message"],
                attachment=serializer.validated_data.get("attachment"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc), "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(TicketDetailSerializer(ticket).data)


# ---------------------------------------------------------------------------
# Admin — 7.14 Tickets
# ---------------------------------------------------------------------------
ACTIVE_STATUSES = [Ticket.Status.OPEN, Ticket.Status.IN_PROGRESS]


def admin_ticket_queryset():
    """Tickets annotated with the latest message (time, sender, preview) and the message count.
    Replies don't touch Ticket.updated_at, so `last_message_at` is the real "last activity"."""
    latest = TicketMessage.objects.filter(ticket=OuterRef("pk")).order_by("-created_at")
    count = TicketMessage.objects.filter(ticket=OuterRef("pk")).values("ticket").annotate(c=Count("id")).values("c")
    return Ticket.objects.select_related("customer__assigned_plot__project", "assigned_to").annotate(
        last_message_at=Subquery(latest.values("created_at")[:1]),
        last_sender_type=Subquery(latest.values("sender_type")[:1]),
        last_message=Substr(Subquery(latest.values("message")[:1]), 1, 160),
        message_count=Subquery(count),
    )


def awaiting_reply_q():
    """Active tickets where the customer spoke last — the ball is in support's court."""
    return Q(status__in=ACTIVE_STATUSES, last_sender_type=TicketMessage.SenderType.CUSTOMER)


class AdminTicketListView(generics.ListAPIView):
    """Filters: status, status__in, category, assigned_to, assigned_to__isnull, ?awaiting=true."""

    serializer_class = AdminTicketListSerializer
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {"status": ["exact", "in"], "category": ["exact"], "assigned_to": ["exact", "isnull"]}
    search_fields = ["subject", "description", "customer__email", "customer__name", "customer__assigned_plot__plot_number"]
    ordering_fields = ["created_at", "updated_at", "last_message_at"]

    def get_queryset(self):
        qs = admin_ticket_queryset()
        if self.request.query_params.get("awaiting") == "true":
            qs = qs.filter(awaiting_reply_q())
        return qs.order_by(F("last_message_at").desc(nulls_last=True), "-id")


class AdminTicketStatsView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]

    def get(self, request):
        qs = admin_ticket_queryset()
        active = Q(status__in=ACTIVE_STATUSES)
        return Response(
            qs.aggregate(
                open=Count("id", filter=Q(status=Ticket.Status.OPEN)),
                in_progress=Count("id", filter=Q(status=Ticket.Status.IN_PROGRESS)),
                resolved=Count("id", filter=Q(status=Ticket.Status.RESOLVED)),
                closed=Count("id", filter=Q(status=Ticket.Status.CLOSED)),
                awaiting_reply=Count("id", filter=awaiting_reply_q()),
                unassigned_active=Count("id", filter=active & Q(assigned_to__isnull=True)),
                mine_active=Count("id", filter=active & Q(assigned_to=request.user)),
            )
        )


class AdminTicketAssigneesView(APIView):
    """Active admins who can work tickets — the admin-users endpoint is SUPER_ADMIN-only, so support agents need this."""

    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]

    def get(self, request):
        users = AdminUser.objects.filter(is_active=True, role__in=["SUPER_ADMIN", "SUPPORT"]).order_by("first_name", "email")
        return Response(
            [
                {"id": u.id, "email": u.email, "name": f"{u.first_name} {u.last_name}".strip() or u.email, "role": u.role}
                for u in users
            ]
        )


class AdminTicketDetailView(generics.RetrieveAPIView):
    serializer_class = AdminTicketDetailSerializer
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]
    queryset = Ticket.objects.select_related("customer__assigned_plot__project", "assigned_to").prefetch_related(
        "messages__sender_customer", "messages__sender_admin"
    )


class AdminTicketReplyView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]

    def post(self, request, pk=None):
        ticket = Ticket.objects.filter(pk=pk).first()
        if not ticket:
            raise NotFound("Ticket not found.")
        serializer = TicketReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.add_admin_reply(
            ticket, request.user,
            message=serializer.validated_data["message"],
            attachment=serializer.validated_data.get("attachment"),
        )
        return Response(AdminTicketDetailSerializer(ticket).data)


class AdminTicketAssignView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]

    def post(self, request, pk=None):
        ticket = Ticket.objects.filter(pk=pk).first()
        if not ticket:
            raise NotFound("Ticket not found.")
        serializer = AdminTicketAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee_id = serializer.validated_data["assigned_to"]
        ticket.assigned_to = AdminUser.objects.filter(pk=assignee_id).first() if assignee_id else None
        ticket.save(update_fields=["assigned_to"])
        return Response(AdminTicketDetailSerializer(ticket).data)


class AdminTicketStatusView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]

    def post(self, request, pk=None):
        ticket = Ticket.objects.filter(pk=pk).first()
        if not ticket:
            raise NotFound("Ticket not found.")
        serializer = AdminTicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket.status = serializer.validated_data["status"]
        ticket.save(update_fields=["status"])
        return Response(AdminTicketDetailSerializer(ticket).data)
