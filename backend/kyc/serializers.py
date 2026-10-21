from decimal import Decimal

from rest_framework import serializers

from core.validators import validate_identity_file
from projects.serializers import CustomerPlotDetailSerializer

from .models import KYCDecisionLog, KYCSubmission


# ---------------------------------------------------------------------------
# CustomerApp — onboarding (4.4-4.9)
# ---------------------------------------------------------------------------
class KYCPlotCheckSerializer(serializers.Serializer):
    """4.4 Plot Details Check (Step 2a) — shown before the receipt upload."""

    plot = CustomerPlotDetailSerializer()


def _missing_identity_files(attrs, submission):
    """Aadhaar front + PAN are required unless already on record (a resubmission, or uploaded in Step 1)."""
    return {
        field: "This file is required."
        for field in ("aadhaar_front", "pan_card")
        if not attrs.get(field) and not (submission and getattr(submission, field))
    }


class KYCStep1Serializer(serializers.Serializer):
    """Step 1 for customers without a plot: who they are, the plot they bought (as typed), and their ID."""

    name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=20)
    claimed_project = serializers.CharField(max_length=200)
    claimed_plot_number = serializers.CharField(max_length=50)
    aadhaar_front = serializers.FileField(required=False, validators=[validate_identity_file])
    aadhaar_back = serializers.FileField(required=False, validators=[validate_identity_file])
    pan_card = serializers.FileField(required=False, validators=[validate_identity_file])

    def validate(self, attrs):
        missing = _missing_identity_files(attrs, self.context.get("submission"))
        if missing:
            raise serializers.ValidationError(missing)
        return attrs


class KYCStep2Serializer(serializers.Serializer):
    plot_confirmed = serializers.BooleanField()
    plot_mismatch_note = serializers.CharField(required=False, allow_blank=True, default="")
    receipt_file = serializers.FileField()
    receipt_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    receipt_payment_date = serializers.DateField()
    aadhaar_front = serializers.FileField(required=False, validators=[validate_identity_file])
    aadhaar_back = serializers.FileField(required=False, validators=[validate_identity_file])
    pan_card = serializers.FileField(required=False, validators=[validate_identity_file])

    def validate(self, attrs):
        missing = _missing_identity_files(attrs, self.context.get("submission"))
        if missing:
            raise serializers.ValidationError(missing)
        return attrs


class KYCStep3Serializer(serializers.Serializer):
    video_file = serializers.FileField()


class KYCStatusSerializer(serializers.ModelSerializer):
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot_assigned = serializers.SerializerMethodField()
    next_route = serializers.SerializerMethodField()

    class Meta:
        model = KYCSubmission
        fields = [
            "kyc_status",
            "plot_assigned",
            "next_route",
            "claimed_project",
            "claimed_plot_number",
            "step1_submitted_at",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_amount",
            "receipt_payment_date",
            "aadhaar_front",
            "aadhaar_back",
            "pan_card",
            "step2_status",
            "step2_rejection_reason",
            "step2_submitted_at",
            "prompt_lines",
            "step3_status",
            "step3_rejection_reason",
            "step3_submitted_at",
        ]

    def get_plot_assigned(self, obj):
        return obj.customer.assigned_plot_id is not None

    def get_next_route(self, obj):
        from accounts.services import next_route_for

        return next_route_for(obj.customer)


# ---------------------------------------------------------------------------
# Admin — 7.8 KYC Review Queue
# ---------------------------------------------------------------------------
class KYCQueueListSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot_number = serializers.CharField(source="customer.assigned_plot.plot_number", default=None, read_only=True)
    project_name = serializers.CharField(source="customer.assigned_plot.project.name", default=None, read_only=True)
    # annotated by views.queue_queryset()
    waiting_since = serializers.DateTimeField(read_only=True, default=None)

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "customer_id",
            "customer_email",
            "customer_name",
            "kyc_status",
            "plot_number",
            "project_name",
            "plot_confirmed",
            "step2_status",
            "step3_status",
            "step2_submitted_at",
            "step3_submitted_at",
            "waiting_since",
            "reviewed_at",
        ]


class KYCDecisionLogSerializer(serializers.ModelSerializer):
    decided_by_email = serializers.CharField(source="decided_by.email", default=None, read_only=True)
    decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = KYCDecisionLog
        fields = ["id", "step", "decision", "reason", "decided_by_email", "decided_by_name", "created_at"]

    def get_decided_by_name(self, obj):
        user = obj.decided_by
        if not user:
            return None
        return f"{user.first_name} {user.last_name}".strip() or None


class KYCQueueDetailSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot = serializers.SerializerMethodField()
    first_payment_receipt = serializers.SerializerMethodField()
    decisions = KYCDecisionLogSerializer(many=True, read_only=True)

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "customer_id",
            "customer_email",
            "customer_name",
            "customer_phone",
            "kyc_status",
            "plot",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_file",
            "receipt_amount",
            "receipt_payment_date",
            "aadhaar_front",
            "aadhaar_back",
            "pan_card",
            "step2_status",
            "step2_rejection_reason",
            "step2_submitted_at",
            "video_file",
            "prompt_lines",
            "step3_status",
            "step3_rejection_reason",
            "step3_submitted_at",
            "first_payment_receipt",
            "decisions",
        ]

    def get_first_payment_receipt(self, obj):
        """Receipt PDF issued for instalment 1 when Step 2 was approved with "generate receipt"."""
        from documents.models import Document

        doc = (
            Document.objects.filter(
                customer=obj.customer,
                doc_type=Document.DocType.PAYMENT_RECEIPT,
                milestone__sequence=1,
                milestone__plot=obj.customer.assigned_plot_id,
            )
            .exclude(file="")
            .order_by("-created_at")
            .first()
        )
        if not doc:
            return None
        return {"id": doc.id, "name": doc.name, "url": doc.file.url, "created_at": doc.created_at}

    def get_plot(self, obj):
        plot = obj.customer.assigned_plot
        if not plot:
            return None
        return CustomerPlotDetailSerializer(plot).data


class ReceiptEntrySerializer(serializers.Serializer):
    payment_by = serializers.CharField(max_length=50)
    payment_date = serializers.DateField()
    bank = serializers.CharField(max_length=100)
    reference = serializers.CharField(max_length=100)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))


class KYCDecisionSerializer(serializers.Serializer):
    step2_decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"], required=False)
    # "Approve & generate receipt": the payments behind the first receipt, as verified by the admin.
    receipt_entries = ReceiptEntrySerializer(many=True, required=False)
    step2_reason = serializers.CharField(required=False, allow_blank=True, default="")
    step3_decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"], required=False)
    step3_reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if "step2_decision" not in attrs and "step3_decision" not in attrs:
            raise serializers.ValidationError("Provide at least one of step2_decision / step3_decision.")
        if "receipt_entries" in attrs:
            if attrs.get("step2_decision") != "APPROVED":
                raise serializers.ValidationError({"receipt_entries": "Only allowed when approving Step 2."})
            if not attrs["receipt_entries"]:
                raise serializers.ValidationError({"receipt_entries": "Add at least one payment."})
        return attrs
