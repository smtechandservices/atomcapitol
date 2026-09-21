from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsKYCApproved, role_required
from projects.models import Plot

from . import services
from .models import Milestone, MilestoneChangeRequest, PaymentProof
from .serializers import (
    AdminMilestoneSerializer,
    ApprovePaymentProofSerializer,
    ChangeRequestApproveSerializer,
    ChangeRequestCounterSerializer,
    ChangeRequestDeclineSerializer,
    MilestoneChangeRequestCreateSerializer,
    MilestoneChangeRequestSerializer,
    MilestoneDetailSerializer,
    MilestoneListSerializer,
    PayMilestoneSerializer,
    PaymentOverviewSerializer,
    PaymentsSummarySerializer,
    PaymentVerificationQueueSerializer,
    RejectPaymentProofSerializer,
)


# ---------------------------------------------------------------------------
# CustomerApp — 5.3/5.4/5.5 Payments & Milestones
# ---------------------------------------------------------------------------
class CustomerPaymentsView(APIView):
    permission_classes = [IsKYCApproved]

    def get(self, request):
        plot = request.user.assigned_plot
        if plot is None:
            raise NotFound("No plot assigned.")
        services.refresh_plot_milestone_statuses(plot)

        milestones = plot.milestones.all()
        status_filter = request.query_params.get("status")
        if status_filter:
            milestones = milestones.filter(status=status_filter.upper())

        paid_total = plot.milestones.filter(status=Milestone.Status.PAID).aggregate(t=Sum("amount"))["t"] or 0
        remaining_qs = plot.milestones.exclude(status=Milestone.Status.PAID)
        next_due = plot.milestones.filter(status__in=[Milestone.Status.DUE, Milestone.Status.OVERDUE]).order_by("due_date").first()

        data = {
            "total_value": plot.total_value,
            "paid_total": paid_total,
            "balance": (plot.total_value - paid_total) if plot.total_value is not None else None,
            "remaining_instalments": remaining_qs.count(),
            "next_due_date": next_due.due_date if next_due else None,
            "next_due_amount": next_due.amount if next_due else None,
            "milestones": milestones,
        }
        return Response(PaymentsSummarySerializer(data).data)


class CustomerMilestoneDetailView(generics.RetrieveAPIView):
    serializer_class = MilestoneDetailSerializer
    permission_classes = [IsKYCApproved]

    def get_queryset(self):
        return Milestone.objects.filter(plot=self.request.user.assigned_plot)


class CustomerPayMilestoneView(APIView):
    permission_classes = [IsKYCApproved]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk=None):
        milestone = Milestone.objects.filter(pk=pk, plot=request.user.assigned_plot).first()
        if not milestone:
            raise NotFound("Milestone not found.")
        serializer = PayMilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            proof = services.submit_payment_proof(
                milestone,
                request.user,
                file=data["file"],
                claimed_amount=data["claimed_amount"],
                payment_date=data["payment_date"],
                payment_mode=data.get("payment_mode", ""),
                transaction_reference=data.get("transaction_reference", ""),
            )
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(MilestoneDetailSerializer(proof.milestone).data, status=status.HTTP_201_CREATED)


class CustomerChangeRequestListCreateView(generics.ListCreateAPIView):
    """5.6 Request Milestone Change."""

    permission_classes = [IsKYCApproved]

    def get_serializer_class(self):
        return MilestoneChangeRequestSerializer if self.request.method == "GET" else MilestoneChangeRequestCreateSerializer

    def get_queryset(self):
        return MilestoneChangeRequest.objects.filter(requested_by=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        plot = self.request.user.assigned_plot
        if plot is None:
            raise NotFound("No plot assigned.")
        serializer.save(plot=plot, requested_by=self.request.user)


# ---------------------------------------------------------------------------
# Admin — 7.9 Payments & Milestones (per-plot schedule editing)
# ---------------------------------------------------------------------------
class AdminMilestoneViewSet(viewsets.ModelViewSet):
    queryset = Milestone.objects.select_related("plot").all()
    serializer_class = AdminMilestoneSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["plot", "status"]
    ordering = ["plot", "sequence"]


class GenerateMilestoneScheduleView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, plot_id=None):
        plot = Plot.objects.filter(pk=plot_id).first()
        if not plot:
            raise NotFound("Plot not found.")
        if plot.milestones.exists():
            return Response(
                {"detail": "Milestones already exist for this plot. Edit them individually instead.", "errors": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            milestones = services.generate_milestone_schedule(plot)
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AdminMilestoneSerializer(milestones, many=True).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Admin — 7.10 Payment Verification Queue
# ---------------------------------------------------------------------------
class PaymentVerificationQueueView(generics.ListAPIView):
    serializer_class = PaymentVerificationQueueSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["milestone__plot__project"]
    search_fields = ["submitted_by__email", "submitted_by__name"]
    ordering = ["created_at"]
    queryset = PaymentProof.objects.select_related("submitted_by", "milestone__plot__project").filter(
        status=PaymentProof.Status.PENDING
    )


class ApprovePaymentProofView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, pk=None):
        proof = PaymentProof.objects.filter(pk=pk).first()
        if not proof:
            raise NotFound("Proof not found.")
        serializer = ApprovePaymentProofSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.approve_payment_proof(
                proof,
                request.user,
                corrected_amount=serializer.validated_data.get("corrected_amount"),
                corrected_date=serializer.validated_data.get("corrected_date"),
            )
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentVerificationQueueSerializer(proof).data)


class RejectPaymentProofView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, pk=None):
        proof = PaymentProof.objects.filter(pk=pk).first()
        if not proof:
            raise NotFound("Proof not found.")
        serializer = RejectPaymentProofSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.reject_payment_proof(proof, request.user, reason=serializer.validated_data["reason"])
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentVerificationQueueSerializer(proof).data)


# ---------------------------------------------------------------------------
# Admin — 7.11 Milestone Change Requests
# ---------------------------------------------------------------------------
class AdminChangeRequestListView(generics.ListAPIView):
    serializer_class = MilestoneChangeRequestSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "plot"]
    ordering = ["-created_at"]
    queryset = MilestoneChangeRequest.objects.select_related("plot", "requested_by")


class AdminChangeRequestDetailView(generics.RetrieveAPIView):
    serializer_class = MilestoneChangeRequestSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    queryset = MilestoneChangeRequest.objects.select_related("plot", "requested_by")


class ApproveChangeRequestView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, pk=None):
        cr = MilestoneChangeRequest.objects.filter(pk=pk).first()
        if not cr:
            raise NotFound("Request not found.")
        serializer = ChangeRequestApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.approve_change_request(cr, request.user, schedule=serializer.validated_data.get("schedule"))
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(MilestoneChangeRequestSerializer(cr).data)


class DeclineChangeRequestView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, pk=None):
        cr = MilestoneChangeRequest.objects.filter(pk=pk).first()
        if not cr:
            raise NotFound("Request not found.")
        serializer = ChangeRequestDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.decline_change_request(cr, request.user, reason=serializer.validated_data["reason"])
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(MilestoneChangeRequestSerializer(cr).data)


class CounterChangeRequestView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, pk=None):
        cr = MilestoneChangeRequest.objects.filter(pk=pk).first()
        if not cr:
            raise NotFound("Request not found.")
        serializer = ChangeRequestCounterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            services.counter_change_request(
                cr, request.user,
                counter_schedule=[dict(item) for item in data["schedule"]],
                note=data.get("note", ""),
            )
        except services.PaymentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        return Response(MilestoneChangeRequestSerializer(cr).data)


# ---------------------------------------------------------------------------
# Admin — 7.12 Payment Overview
# ---------------------------------------------------------------------------
class PaymentOverviewView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def get(self, request):
        qs = Milestone.objects.all()
        project_id = request.query_params.get("project")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if project_id:
            qs = qs.filter(plot__project_id=project_id)
        if start_date:
            qs = qs.filter(due_date__gte=start_date)
        if end_date:
            qs = qs.filter(due_date__lte=end_date)

        def money_sum(queryset):
            # Sum() over SQLite returns a plain float regardless of the field's declared
            # type (SQLite's SUM has no arbitrary-precision decimal); normalize back to
            # Decimal with cent precision. Postgres/MySQL already return Decimal here.
            # PaymentOverviewSerializer's DecimalField then renders it as a proper
            # quoted decimal string in the JSON response — a bare Decimal in a raw dict
            # would still come out as a float, since DRF's JSONEncoder unconditionally
            # calls float() on Decimal outside of a serializer field.
            total = queryset.aggregate(t=Sum("amount"))["t"] or 0
            return Decimal(str(total)).quantize(Decimal("0.01"))

        due = money_sum(qs.filter(status=Milestone.Status.DUE))
        overdue = money_sum(qs.filter(status=Milestone.Status.OVERDUE))
        received_qs = qs.filter(status=Milestone.Status.PAID)
        if start_date:
            received_qs = received_qs.filter(paid_date__gte=start_date)
        if end_date:
            received_qs = received_qs.filter(paid_date__lte=end_date)
        received = money_sum(received_qs)
        under_review = money_sum(qs.filter(status=Milestone.Status.UNDER_REVIEW))

        data = {
            "due": due,
            "overdue": overdue,
            "received": received,
            "under_review": under_review,
            "milestone_count": qs.count(),
        }
        return Response(PaymentOverviewSerializer(data).data)
