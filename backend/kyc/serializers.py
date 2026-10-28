from decimal import Decimal

from rest_framework import serializers

from core.validators import validate_identity_file, validate_image_file, validate_receipt_file
from projects.models import Project
from projects.serializers import CustomerPlotDetailSerializer

from .models import KYCDecisionLog, KYCSubmission


# ---------------------------------------------------------------------------
# CustomerApp — onboarding (4.4-4.9)
# ---------------------------------------------------------------------------
class KYCPlotCheckSerializer(serializers.Serializer):
    """4.4 Plot Details Check (Step 2a) — shown before the receipt upload."""

    plot = CustomerPlotDetailSerializer()


def _missing_files(attrs, submission, fields):
    """`fields` are required unless already on record (a resubmission, or sent with an earlier step)."""
    return {
        field: "This file is required."
        for field in fields
        if not attrs.get(field) and not (submission and getattr(submission, field))
    }


def _missing_identity_files(attrs, submission):
    """Aadhaar front + PAN are required unless already on record (a resubmission, or uploaded in Step 1)."""
    return _missing_files(attrs, submission, ("aadhaar_front", "pan_card"))


def _identity_file(**kwargs):
    return serializers.FileField(required=False, validators=[validate_identity_file], **kwargs)


def _photo_file():
    return serializers.FileField(required=False, validators=[validate_image_file])


class KYCStep1Serializer(serializers.Serializer):
    """Step 1, the first KYC screen, for every buyer: the plot and booking payment, who they are with their
    documents, an optional co-applicant, the sales person they dealt with, and the T&C. Buyers who already have a
    plot skip the project / phase / plot number. Files left out keep the ones on record."""

    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.filter(is_published=True), required=False)
    phase = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    claimed_plot_number = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    receipt_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    receipt_file = serializers.FileField(required=False, validators=[validate_receipt_file])

    name = serializers.CharField(max_length=200)
    phone = serializers.CharField(max_length=20)
    aadhaar_front = _identity_file()
    aadhaar_back = _identity_file()
    pan_card = _identity_file()
    photo = _photo_file()
    cancelled_cheque = _identity_file()

    co_applicant_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    co_applicant_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    co_applicant_email = serializers.EmailField(required=False, allow_blank=True, default="")
    co_applicant_aadhaar_front = _identity_file()
    co_applicant_aadhaar_back = _identity_file()
    co_applicant_pan_card = _identity_file()
    co_applicant_photo = _photo_file()

    sales_person_name = serializers.CharField(max_length=200)
    sales_person_phone = serializers.CharField(max_length=20)
    accept_terms = serializers.BooleanField()

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError("Please accept the terms and conditions.")
        return value

    def validate(self, attrs):
        submission = self.context.get("submission")
        errors = {}
        if not self.context.get("has_plot"):
            project = attrs.get("project")
            if project is None:
                errors["project"] = "Choose your project."
            elif project.phases and attrs["phase"] not in project.phases:
                errors["phase"] = "Choose your phase."
            if not attrs["claimed_plot_number"].strip():
                errors["claimed_plot_number"] = "Enter your plot number."
        errors.update(_missing_files(attrs, submission, ("receipt_file", "aadhaar_front", "pan_card", "photo", "cancelled_cheque")))
        if attrs["co_applicant_name"].strip():
            errors.update(_missing_files(attrs, submission, ("co_applicant_aadhaar_front", "co_applicant_pan_card", "co_applicant_photo")))
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class KYCStep2Serializer(serializers.Serializer):
    """Plot confirmation. The receipt, amount and ID files usually came with Step 1; sent here they replace those."""

    plot_confirmed = serializers.BooleanField()
    plot_mismatch_note = serializers.CharField(required=False, allow_blank=True, default="")
    receipt_file = serializers.FileField(required=False, validators=[validate_receipt_file])
    receipt_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    receipt_payment_date = serializers.DateField(required=False)
    aadhaar_front = _identity_file()
    aadhaar_back = _identity_file()
    pan_card = _identity_file()

    def validate(self, attrs):
        submission = self.context.get("submission")
        missing = _missing_files(attrs, submission, ("receipt_file", "aadhaar_front", "pan_card"))
        if "receipt_amount" not in attrs and not (submission and submission.receipt_amount):
            missing["receipt_amount"] = "This field is required."
        if missing:
            raise serializers.ValidationError(missing)
        return attrs


class KYCStep3Serializer(serializers.Serializer):
    video_file = serializers.FileField()


# Files the buyer uploaded for KYC. Once KYC is approved they're no longer shown back to the buyer.
KYC_DOCUMENT_FIELDS = (
    "receipt_file",
    "aadhaar_front",
    "aadhaar_back",
    "pan_card",
    "photo",
    "cancelled_cheque",
    "co_applicant_aadhaar_front",
    "co_applicant_aadhaar_back",
    "co_applicant_pan_card",
    "co_applicant_photo",
)


class KYCStatusSerializer(serializers.ModelSerializer):
    kyc_status = serializers.CharField(source="customer.kyc_status", read_only=True)
    plot_assigned = serializers.SerializerMethodField()
    next_route = serializers.SerializerMethodField()
    selected_project = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = KYCSubmission
        fields = [
            "kyc_status",
            "plot_assigned",
            "next_route",
            "claimed_project",
            "selected_project",
            "claimed_phase",
            "claimed_plot_number",
            "step1_submitted_at",
            "co_applicant_name",
            "co_applicant_phone",
            "co_applicant_email",
            "sales_person_name",
            "sales_person_phone",
            "terms_accepted_at",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_amount",
            "receipt_payment_date",
            *KYC_DOCUMENT_FIELDS,
            "step2_status",
            "step2_rejection_reason",
            "step2_submitted_at",
            "prompt_lines",
            "step3_status",
            "step3_rejection_reason",
            "step3_submitted_at",
        ]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if obj.customer.kyc_status == "APPROVED":
            data.update(dict.fromkeys(KYC_DOCUMENT_FIELDS))
        return data

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
    plot_role = serializers.CharField(source="customer.plot_role", default=None, read_only=True)
    plot_terms = serializers.SerializerMethodField()
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
            "plot_role",
            "plot_terms",
            "plot_confirmed",
            "plot_mismatch_note",
            "receipt_file",
            "receipt_amount",
            "receipt_payment_date",
            "aadhaar_front",
            "aadhaar_back",
            "pan_card",
            "photo",
            "cancelled_cheque",
            "claimed_project",
            "claimed_phase",
            "claimed_plot_number",
            "step1_submitted_at",
            "co_applicant_name",
            "co_applicant_phone",
            "co_applicant_email",
            "co_applicant_aadhaar_front",
            "co_applicant_aadhaar_back",
            "co_applicant_pan_card",
            "co_applicant_photo",
            "sales_person_name",
            "sales_person_phone",
            "terms_accepted_at",
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

    def get_plot_terms(self, obj):
        """The plot's payment terms, for checking the booking receipt and setting the schedule at Step 2 approval."""
        from .services import needs_payment_terms

        plot = obj.customer.assigned_plot
        if not plot:
            return None
        money = lambda v: None if v is None else str(v)  # noqa: E731 — strings, like DRF's DecimalFields
        return {
            "price": money(plot.price),
            "total_value": money(plot.total_value),
            "amount_paid_outside_app": money(plot.amount_paid_outside_app),
            "instalment_count": plot.instalment_count,
            "needs_terms": needs_payment_terms(obj),
        }


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
    # Primary buyer's Step 2 approval: the plot's terms, from which its milestone schedule is generated.
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False)
    instalment_count = serializers.IntegerField(min_value=2, required=False)
    frequency = serializers.ChoiceField(choices=["MONTHLY", "WEEKLY"], default="MONTHLY")
    # The reviewed due dates of instalments 2..instalment_count, in order; computed from `frequency` when left out.
    due_dates = serializers.ListField(child=serializers.DateField(), required=False)
    # The reviewed amounts of instalments 2..instalment_count, in order; an even split when left out.
    amounts = serializers.ListField(child=serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01")), required=False)
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
        if ("total_value" in attrs) != ("instalment_count" in attrs):
            raise serializers.ValidationError("Send total_value and instalment_count together.")
        if "total_value" in attrs and attrs.get("step2_decision") != "APPROVED":
            raise serializers.ValidationError({"total_value": "Only allowed when approving Step 2."})
        dates = attrs.get("due_dates")
        if dates is not None:
            if "instalment_count" not in attrs or len(dates) != attrs["instalment_count"] - 1:
                raise serializers.ValidationError({"due_dates": "Give one due date for each instalment after the first."})
            if any(a >= b for a, b in zip(dates, dates[1:])):
                raise serializers.ValidationError({"due_dates": "Each due date must be after the one before it."})
        amounts = attrs.get("amounts")
        if amounts is not None and ("instalment_count" not in attrs or len(amounts) != attrs["instalment_count"] - 1):
            raise serializers.ValidationError({"amounts": "Give one amount for each instalment after the first."})
        return attrs

    def get_payment_terms(self):
        data = self.validated_data
        if "total_value" not in data:
            return None
        return {"total_value": data["total_value"], "instalment_count": data["instalment_count"]}

    def get_schedule_options(self):
        data = self.validated_data
        return {"frequency": data["frequency"], "due_dates": data.get("due_dates"), "amounts": data.get("amounts")}


class SchedulePreviewSerializer(serializers.Serializer):
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    instalment_count = serializers.IntegerField(min_value=2)
    frequency = serializers.ChoiceField(choices=["MONTHLY", "WEEKLY"], default="MONTHLY")
    amounts = serializers.ListField(child=serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01")), required=False)
    receipt_entries = ReceiptEntrySerializer(many=True, required=False)
