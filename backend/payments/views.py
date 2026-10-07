from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Exists, F, Min, OuterRef, Prefetch, Q, Subquery, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsKYCApproved, role_required
from documents.models import Document
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
    queryset = Milestone.objects.select_related("plot__project").prefetch_related(
        "plot__customers",
        Prefetch(
            "documents",
            queryset=Document.objects.filter(doc_type=Document.DocType.PAYMENT_RECEIPT).order_by("-created_at"),
            to_attr="receipts",
        ),
    )
    serializer_class = AdminMilestoneSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # status__in=OVERDUE,DUE powers the "needs attention" view
    filterset_fields = {"plot": ["exact"], "plot__project": ["exact"], "status": ["exact", "in"], "due_date": ["gte", "lte"]}
    search_fields = ["plot__plot_number", "name", "plot__customers__email", "plot__customers__name"]
    ordering_fields = ["due_date", "amount", "sequence"]
    ordering = ["plot", "sequence"]

    def filter_queryset(self, queryset):
        # Searching across plot__customers joins one row per buyer; collapse duplicates.
        qs = super().filter_queryset(queryset)
        return qs.distinct() if self.request.query_params.get("search") else qs

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Count + amount per status (optionally ?plot__project=<id>)."""
        qs = Milestone.objects.all()
        if project := request.query_params.get("plot__project"):
            qs = qs.filter(plot__project_id=project)
        rows = qs.values("status").annotate(count=Count("id"), amount=Sum("amount"))
        # SQLite returns SUM as float — normalise to a 2dp decimal string like PaymentOverviewView does.
        data = {s: {"count": 0, "amount": "0.00"} for s in Milestone.Status.values}
        for r in rows:
            data[r["status"]] = {"count": r["count"], "amount": str(Decimal(str(r["amount"] or 0)).quantize(Decimal("0.01")))}
        return Response(data)


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
STALE_PROOF_AFTER = timedelta(days=2)


def proof_queryset():
    """Proofs annotated with the plot's milestone count and whether the transaction ref was used on another proof."""
    plot_milestones = (
        Milestone.objects.filter(plot=OuterRef("milestone__plot")).values("plot").annotate(c=Count("id")).values("c")
    )
    # Blank refs never count as duplicates of each other.
    same_ref = (
        PaymentProof.objects.filter(transaction_reference=OuterRef("transaction_reference"))
        .exclude(pk=OuterRef("pk"))
        .exclude(transaction_reference="")
    )
    return PaymentProof.objects.select_related("submitted_by", "reviewed_by", "milestone__plot__project").annotate(
        milestone_count=Subquery(plot_milestones),
        duplicate_reference=Exists(same_ref),
    )


class PaymentVerificationQueueView(generics.ListAPIView):
    """?status=PENDING (default) | APPROVED | REJECTED | all. Pending is oldest first, history newest-reviewed first."""

    serializer_class = PaymentVerificationQueueSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["milestone__plot__project"]
    search_fields = ["submitted_by__email", "submitted_by__name", "milestone__plot__plot_number", "transaction_reference"]
    ordering_fields = ["created_at", "reviewed_at", "claimed_amount"]

    def get_queryset(self):
        qs = proof_queryset()
        status_param = self.request.query_params.get("status", PaymentProof.Status.PENDING)
        if status_param in PaymentProof.Status.values:
            qs = qs.filter(status=status_param)
        if status_param == PaymentProof.Status.PENDING:
            if self.request.query_params.get("mismatch") == "true":
                qs = qs.exclude(claimed_amount=F("milestone__amount"))
            if self.request.query_params.get("stale") == "true":
                qs = qs.filter(created_at__lt=timezone.now() - STALE_PROOF_AFTER)
            return qs.order_by("created_at", "id")
        return qs.order_by(F("reviewed_at").desc(nulls_last=True), "-id")


class PaymentVerificationStatsView(APIView):
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def get(self, request):
        pending = PaymentProof.objects.filter(status=PaymentProof.Status.PENDING)
        if project := request.query_params.get("milestone__plot__project"):
            pending = pending.filter(milestone__plot__project_id=project)
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        approved_month = PaymentProof.objects.filter(status=PaymentProof.Status.APPROVED, reviewed_at__gte=month_start)

        def money(total):
            # SQLite returns SUM as float; normalise to a 2dp decimal string.
            return str(Decimal(str(total or 0)).quantize(Decimal("0.01")))

        agg = pending.aggregate(
            count=Count("id"),
            amount=Sum("claimed_amount"),
            stale=Count("id", filter=Q(created_at__lt=timezone.now() - STALE_PROOF_AFTER)),
            mismatch=Count("id", filter=~Q(claimed_amount=F("milestone__amount"))),
            short=Count("id", filter=Q(claimed_amount__lt=F("milestone__amount"))),
        )
        month = approved_month.aggregate(count=Count("id"), amount=Sum("claimed_amount"))
        return Response(
            {
                "pending": agg["count"],
                "pending_amount": money(agg["amount"]),
                "stale": agg["stale"],
                "mismatch": agg["mismatch"],
                "short": agg["short"],
                "approved_this_month": month["count"],
                "approved_this_month_amount": money(month["amount"]),
                "approved": PaymentProof.objects.filter(status=PaymentProof.Status.APPROVED).count(),
                "rejected": PaymentProof.objects.filter(status=PaymentProof.Status.REJECTED).count(),
            }
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
        return Response(PaymentVerificationQueueSerializer(proof_queryset().get(pk=proof.pk)).data)


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
        return Response(PaymentVerificationQueueSerializer(proof_queryset().get(pk=proof.pk)).data)


# ---------------------------------------------------------------------------
# Admin — 7.11 Milestone Change Requests
# ---------------------------------------------------------------------------
class AdminChangeRequestListView(generics.ListAPIView):
    serializer_class = MilestoneChangeRequestSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status", "plot", "plot__project", "change_type"]
    search_fields = ["requested_by__email", "requested_by__name", "plot__plot_number"]
    ordering_fields = ["created_at", "reviewed_at"]
    ordering = ["-created_at"]
    queryset = MilestoneChangeRequest.objects.select_related("plot__project", "requested_by", "reviewed_by")


class AdminChangeRequestDetailView(generics.RetrieveAPIView):
    serializer_class = MilestoneChangeRequestSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    queryset = MilestoneChangeRequest.objects.select_related("plot__project", "requested_by", "reviewed_by")


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


def _money(value):
    # SQLite returns SUM as float; normalise to a 2dp decimal string (see PaymentOverviewView).
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def _month_start(d, months_offset=0):
    y, m = divmod(d.month - 1 + months_offset, 12)
    return date(d.year + y, m + 1, 1)


class PaymentInsightsView(APIView):
    """Breakdowns for the Payment Overview page. ?project, ?start_date, ?end_date (default: 12 months back → 3 ahead).

    Period figures (expected / collected / monthly series) honour the date range; snapshot figures
    (overdue, due now, under review, ageing, top overdue) are as of today and only follow ?project.
    """

    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def get(self, request):
        today = timezone.localdate()
        try:
            start = date.fromisoformat(request.query_params["start_date"]) if request.query_params.get("start_date") else _month_start(today, -11)
            end = date.fromisoformat(request.query_params["end_date"]) if request.query_params.get("end_date") else _month_start(today, 4) - timedelta(days=1)
        except ValueError:
            return Response({"detail": "Dates must be YYYY-MM-DD.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)

        ms = Milestone.objects.all()
        if project := request.query_params.get("project"):
            ms = ms.filter(plot__project_id=project)
        paid = ms.filter(status=Milestone.Status.PAID)
        in_range = ms.filter(due_date__gte=start, due_date__lte=end)
        due_so_far = in_range.filter(due_date__lte=today)

        # --- period KPIs
        period = {
            "expected": _money(in_range.aggregate(t=Sum("amount"))["t"]),
            "collected": _money(paid.filter(paid_date__gte=start, paid_date__lte=end).aggregate(t=Sum("amount"))["t"]),
            # collection rate: of what fell due (up to today) in the period, how much is paid
            "due_to_date": _money(due_so_far.aggregate(t=Sum("amount"))["t"]),
            "paid_of_due_to_date": _money(due_so_far.filter(status=Milestone.Status.PAID).aggregate(t=Sum("amount"))["t"]),
        }

        # --- snapshot KPIs
        def bucket(qs):
            agg = qs.aggregate(amount=Sum("amount"), count=Count("id"), plots=Count("plot", distinct=True))
            return {"amount": _money(agg["amount"]), "count": agg["count"], "plots": agg["plots"]}

        overdue = ms.filter(status=Milestone.Status.OVERDUE)
        snapshot = {
            "overdue": bucket(overdue),
            "due": bucket(ms.filter(status=Milestone.Status.DUE)),
            "under_review": bucket(ms.filter(status=Milestone.Status.UNDER_REVIEW)),
            "next_30_days": bucket(
                ms.filter(status__in=[Milestone.Status.UPCOMING, Milestone.Status.DUE], due_date__gt=today, due_date__lte=today + timedelta(days=30))
            ),
        }

        # --- monthly scheduled vs collected
        scheduled_by_month = {
            r["m"]: r["t"] for r in in_range.annotate(m=TruncMonth("due_date")).values("m").annotate(t=Sum("amount")).values("m", "t")
        }
        collected_by_month = {
            r["m"]: r["t"]
            for r in paid.filter(paid_date__gte=start, paid_date__lte=end).annotate(m=TruncMonth("paid_date")).values("m").annotate(t=Sum("amount")).values("m", "t")
        }
        months, cursor = [], _month_start(start)
        while cursor <= end and len(months) < 60:
            months.append(
                {
                    "month": cursor.isoformat(),
                    "scheduled": _money(scheduled_by_month.get(cursor)),
                    "collected": _money(collected_by_month.get(cursor)),
                    "is_future": cursor > today,
                }
            )
            cursor = _month_start(cursor, 1)

        # --- overdue ageing (days past due date)
        ageing = []
        for label, lo, hi in [("1–30 days", 1, 30), ("31–60 days", 31, 60), ("61–90 days", 61, 90), ("91–180 days", 91, 180), ("180+ days", 181, None)]:
            qs = overdue.filter(due_date__lte=today - timedelta(days=lo))
            if hi is not None:
                qs = qs.filter(due_date__gte=today - timedelta(days=hi))
            ageing.append({"label": label, **bucket(qs)})

        # --- per project (all-time schedule position)
        projects = (
            ms.values("plot__project_id", "plot__project__name")
            .annotate(
                scheduled=Sum("amount"),
                collected=Sum("amount", filter=Q(status=Milestone.Status.PAID)),
                overdue=Sum("amount", filter=Q(status=Milestone.Status.OVERDUE)),
                under_review=Sum("amount", filter=Q(status=Milestone.Status.UNDER_REVIEW)),
                plots=Count("plot", distinct=True),
            )
            .order_by("-scheduled")
        )
        by_project = [
            {
                "id": p["plot__project_id"],
                "name": p["plot__project__name"],
                "plots": p["plots"],
                "scheduled": _money(p["scheduled"]),
                "collected": _money(p["collected"]),
                "overdue": _money(p["overdue"]),
                "under_review": _money(p["under_review"]),
            }
            for p in projects
        ]

        # --- largest overdue accounts (per plot)
        top = list(
            overdue.values("plot_id", "plot__plot_number", "plot__project__name")
            .annotate(amount=Sum("amount"), count=Count("id"), oldest=Min("due_date"))
            .order_by("-amount")[:8]
        )
        from accounts.models import Customer

        buyers = {
            c.assigned_plot_id: c
            for c in Customer.objects.filter(assigned_plot_id__in=[t["plot_id"] for t in top], plot_role=Customer.PlotRole.PRIMARY)
        }
        top_overdue = [
            {
                "plot_id": t["plot_id"],
                "plot_number": t["plot__plot_number"],
                "project_name": t["plot__project__name"],
                "amount": _money(t["amount"]),
                "count": t["count"],
                "oldest_due_date": t["oldest"].isoformat(),
                "days_overdue": (today - t["oldest"]).days,
                "buyer": {"id": b.id, "name": b.name, "email": b.email} if (b := buyers.get(t["plot_id"])) else None,
            }
            for t in top
        ]

        return Response(
            {
                "range": {"start": start.isoformat(), "end": end.isoformat(), "today": today.isoformat()},
                "period": period,
                "snapshot": snapshot,
                "monthly": months,
                "ageing": ageing,
                "by_project": by_project,
                "top_overdue": top_overdue,
            }
        )
