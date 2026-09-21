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
from .models import Ticket
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
class AdminTicketListView(generics.ListAPIView):
    serializer_class = AdminTicketListSerializer
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status", "category", "assigned_to"]
    search_fields = ["subject", "customer__email"]
    ordering_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]
    queryset = Ticket.objects.select_related("customer", "assigned_to")


class AdminTicketDetailView(generics.RetrieveAPIView):
    serializer_class = AdminTicketDetailSerializer
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]
    queryset = Ticket.objects.select_related("customer", "assigned_to")


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
