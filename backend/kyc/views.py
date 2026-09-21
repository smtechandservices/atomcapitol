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
from .models import KYCSubmission
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
class KYCQueueListView(generics.ListAPIView):
    serializer_class = KYCQueueListSerializer
    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ["customer__email", "customer__name"]
    ordering_fields = ["step2_submitted_at", "step3_submitted_at"]
    ordering = ["step2_submitted_at"]

    def get_queryset(self):
        return KYCSubmission.objects.select_related("customer", "customer__assigned_plot").filter(
            customer__kyc_status="SUBMITTED"
        )


class KYCQueueDetailView(generics.RetrieveAPIView):
    queryset = KYCSubmission.objects.select_related("customer", "customer__assigned_plot__project").prefetch_related("decisions")
    serializer_class = KYCQueueDetailSerializer
    permission_classes = [role_required("KYC_REVIEWER", "SUPER_ADMIN")]


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
        return Response(KYCQueueDetailSerializer(submission).data)
