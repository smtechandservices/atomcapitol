from rest_framework import serializers

from projects.serializers import CustomerPlotDetailSerializer

from .models import KYCDecisionLog, KYCSubmission


# ---------------------------------------------------------------------------
# CustomerApp — onboarding (4.4-4.9)
# ---------------------------------------------------------------------------
class KYCPlotCheckSerializer(serializers.Serializer):
    """4.4 Plot Details Check (Step 2a) — shown before the receipt upload."""

    plot = CustomerPlotDetailSerializer()


class KYCStep2Serializer(serializers.Serializer):
    plot_confirmed = serializers.BooleanField()
    plot_mismatch_note = serializers.CharField(required=False, allow_blank=True, default="")
    receipt_file = serializers.FileField()
    receipt_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    receipt_payment_date = serializers.DateField()


class KYCStep3Serializer(serializers.Serializer):
    video_file = serializers.FileField()


class KYCStatusSerializer(serializers.ModelSerializer):
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)

    class Meta:
        model = KYCSubmission
        fields = [
            "kyc_status",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_amount",
            "receipt_payment_date",
            "step2_status",
            "step2_rejection_reason",
            "step2_submitted_at",
            "prompt_lines",
            "step3_status",
            "step3_rejection_reason",
            "step3_submitted_at",
        ]


# ---------------------------------------------------------------------------
# Admin — 7.8 KYC Review Queue
# ---------------------------------------------------------------------------
class KYCQueueListSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot_number = serializers.CharField(source="customer.assigned_plot.plot_number", default=None, read_only=True)

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "customer_email",
            "customer_name",
            "kyc_status",
            "plot_number",
            "step2_status",
            "step3_status",
            "step2_submitted_at",
            "step3_submitted_at",
        ]


class KYCDecisionLogSerializer(serializers.ModelSerializer):
    decided_by_email = serializers.CharField(source="decided_by.email", default=None, read_only=True)

    class Meta:
        model = KYCDecisionLog
        fields = ["id", "step", "decision", "reason", "decided_by_email", "created_at"]


class KYCQueueDetailSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    plot = serializers.SerializerMethodField()
    decisions = KYCDecisionLogSerializer(many=True, read_only=True)

    class Meta:
        model = KYCSubmission
        fields = [
            "id",
            "customer_email",
            "customer_name",
            "plot",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_file",
            "receipt_amount",
            "receipt_payment_date",
            "step2_status",
            "step2_rejection_reason",
            "step2_submitted_at",
            "video_file",
            "prompt_lines",
            "step3_status",
            "step3_rejection_reason",
            "step3_submitted_at",
            "decisions",
        ]

    def get_plot(self, obj):
        plot = obj.customer.assigned_plot
        if not plot:
            return None
        return CustomerPlotDetailSerializer(plot).data


class KYCDecisionSerializer(serializers.Serializer):
    step2_decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"], required=False)
    step2_reason = serializers.CharField(required=False, allow_blank=True, default="")
    step3_decision = serializers.ChoiceField(choices=["APPROVED", "REJECTED"], required=False)
    step3_reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if "step2_decision" not in attrs and "step3_decision" not in attrs:
            raise serializers.ValidationError("Provide at least one of step2_decision / step3_decision.")
        return attrs
