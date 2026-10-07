from datetime import timedelta

from django.db.models import Case, Count, F, Q, When
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsCustomerUser, role_required
from projects.serializers import CustomerPlotDetailSerializer

from . import services
from .models import KYCSubmission, StepStatus
from .serializers import (
    KYCDecisionSerializer,
    KYCQueueDetailSerializer,
    KYCQueueListSerializer,
    KYCStatusSerializer,
    KYCStep2Serializer,
    KYCStep3Serializer,
)


# ---------------------------------------------------------------------------
# CustomerApp — onboarding
# ---------------------------------------------------------------------------
class KYCPlotCheckView(APIView):
    """4.4 Plot Details Check (Step 2a)."""

    permission_classes = [IsCustomerUser]

    def get(self, request):
        plot = request.user.assigned_plot
        if plot is None:
            raise NotFound("No plot assigned to this account yet.")
        return Response({"plot": CustomerPlotDetailSerializer(plot).data})


class KYCStep2View(APIView):
    """4.5 First Payment Receipt Upload (Step 2b), plus plot confirmation."""

    permission_classes = [IsCustomerUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = KYCStep2Serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        submission = services.submit_step2(
            request.user,
            plot_confirmed=data["plot_confirmed"],
            plot_mismatch_note=data.get("plot_mismatch_note", ""),
            receipt_file=data["receipt_file"],
            receipt_amount=data["receipt_amount"],
            receipt_payment_date=data["receipt_payment_date"],
        )
        return Response(KYCStatusSerializer(submission).data, status=status.HTTP_201_CREATED)


class KYCStep3View(APIView):
    """4.6 Video KYC (Step 3) — in-app live recording only."""

    permission_classes = [IsCustomerUser]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        submission = services.get_or_create_submission(request.user)
        if not submission.prompt_lines:
            submission.prompt_lines = services.generate_prompt_lines()
            submission.save(update_fields=["prompt_lines"])
        return Response({"prompt_lines": submission.prompt_lines})

    def post(self, request):
        serializer = KYCStep3Serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = services.submit_step3(request.user, video_file=serializer.validated_data["video_file"])
        return Response(KYCStatusSerializer(submission).data, status=status.HTTP_201_CREATED)


class KYCStatusView(generics.RetrieveAPIView):
    """4.7 Submission Confirmation / 4.8 Pending / 4.9 Rejected — all read from here."""

    serializer_class = KYCStatusSerializer
    permission_classes = [IsCustomerUser]

    def get_object(self):
        return services.get_or_create_submission(self.request.user)


# ---------------------------------------------------------------------------
# Admin — 7.8 KYC Review Queue
# ---------------------------------------------------------------------------
# A submission needs review when either step is PENDING. Filtering on the customer's overall
# kyc_status missed resubmissions: one step REJECTED + the other PENDING rolls up to REJECTED.
PENDING_Q = Q(step2_status=StepStatus.PENDING) | Q(step3_status=StepStatus.PENDING)
STALE_AFTER = timedelta(days=2)


def queue_queryset():
    """Submissions annotated with `waiting_since`: when the oldest still-pending step came in."""
    return KYCSubmission.objects.select_related("customer", "customer__assigned_plot__project").annotate(
        waiting_since=Case(
            When(step2_status=StepStatus.PENDING, then=F("step2_submitted_at")),
            When(step3_status=StepStatus.PENDING, then=F("step3_submitted_at")),
            default=None,
        )
    )


class KYCQueueListView(generics.ListAPIView):
    """?view=queue (default) | approved | rejected | all.
    Queue-only filters: ?needs=step2|step3|both, ?flagged=true, ?stale=true (waiting > 2 days)."""

    serializer_class = KYCQueueListSerializer
    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ["customer__email", "customer__name", "customer__assigned_plot__plot_number"]
    ordering_fields = ["waiting_since", "reviewed_at", "step2_submitted_at", "step3_submitted_at"]

    def get_queryset(self):
        params = self.request.query_params
        qs = queue_queryset()
        view = params.get("view", "queue")

        if view == "approved":
            return qs.filter(customer__kyc_status="APPROVED").order_by(F("reviewed_at").desc(nulls_last=True))
        if view == "rejected":
            rejected = Q(step2_status=StepStatus.REJECTED) | Q(step3_status=StepStatus.REJECTED)
            return qs.filter(rejected).exclude(PENDING_Q).order_by(F("reviewed_at").desc(nulls_last=True))
        if view == "all":
            started = Q(step2_status__isnull=False) | Q(step3_status__isnull=False)
            return qs.filter(started).order_by(F("waiting_since").asc(nulls_last=True), F("reviewed_at").desc(nulls_last=True))

        qs = qs.filter(PENDING_Q)
        needs = params.get("needs")
        if needs == "step2":
            qs = qs.filter(step2_status=StepStatus.PENDING).exclude(step3_status=StepStatus.PENDING)
        elif needs == "step3":
            qs = qs.filter(step3_status=StepStatus.PENDING).exclude(step2_status=StepStatus.PENDING)
        elif needs == "both":
            qs = qs.filter(step2_status=StepStatus.PENDING, step3_status=StepStatus.PENDING)
        if params.get("flagged") == "true":
            qs = qs.filter(plot_confirmed=False, step2_status__isnull=False)
        if params.get("stale") == "true":
            qs = qs.filter(waiting_since__lt=timezone.now() - STALE_AFTER)
        return qs.order_by("waiting_since", "id")


class KYCQueueStatsView(APIView):
    """Headline counts for the review queue in one request."""

    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]

    def get(self, request):
        pending = queue_queryset().filter(PENDING_Q)
        p2, p3 = Q(step2_status=StepStatus.PENDING), Q(step3_status=StepStatus.PENDING)
        stats = pending.aggregate(
            total=Count("id"),
            step2=Count("id", filter=p2 & ~p3),
            step3=Count("id", filter=p3 & ~p2),
            both=Count("id", filter=p2 & p3),
            flagged=Count("id", filter=Q(plot_confirmed=False, step2_status__isnull=False)),
            stale=Count("id", filter=Q(waiting_since__lt=timezone.now() - STALE_AFTER)),
        )
        stats["approved"] = KYCSubmission.objects.filter(customer__kyc_status="APPROVED").count()
        stats["rejected"] = (
            KYCSubmission.objects.filter(Q(step2_status=StepStatus.REJECTED) | Q(step3_status=StepStatus.REJECTED))
            .exclude(PENDING_Q)
            .count()
        )
        return Response(stats)


def queue_position(submission):
    """Next pending submission (oldest first, skipping this one) and how many are pending in total."""
    pending = queue_queryset().filter(PENDING_Q)
    next_item = pending.exclude(pk=submission.pk).order_by("waiting_since", "id").values_list("id", flat=True).first()
    return {"next_id": next_item, "pending_count": pending.count()}


class KYCQueueDetailView(generics.RetrieveAPIView):
    queryset = KYCSubmission.objects.select_related("customer", "customer__assigned_plot__project").prefetch_related(
        "decisions__decided_by"
    )
    serializer_class = KYCQueueDetailSerializer
    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]

    def retrieve(self, request, *args, **kwargs):
        submission = self.get_object()
        return Response({**self.get_serializer(submission).data, "queue": queue_position(submission)})


class KYCDecideView(APIView):
    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]

    def post(self, request, pk=None):
        try:
            submission = KYCSubmission.objects.select_related("customer").get(pk=pk)
        except KYCSubmission.DoesNotExist:
            raise NotFound("Submission not found.")

        serializer = KYCDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "step2_decision" in data:
            services.decide_step(
                submission, step="STEP2", decision=data["step2_decision"], reason=data.get("step2_reason", ""), admin_user=request.user
            )
        if "step3_decision" in data:
            services.decide_step(
                submission, step="STEP3", decision=data["step3_decision"], reason=data.get("step3_reason", ""), admin_user=request.user
            )
        submission.refresh_from_db()
        return Response({**KYCQueueDetailSerializer(submission).data, "queue": queue_position(submission)})
