from rest_framework import serializers

from .models import Milestone, MilestoneChangeRequest, PaymentProof


# ---------------------------------------------------------------------------
# CustomerApp — 5.3/5.4 Payments & Milestones
# ---------------------------------------------------------------------------
class PaymentProofMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentProof
        fields = ["id", "file", "claimed_amount", "payment_date", "status", "rejection_reason", "created_at"]


class MilestoneListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ["id", "sequence", "name", "amount", "due_date", "status", "paid_date"]


class MilestoneDetailSerializer(serializers.ModelSerializer):
    latest_proof = serializers.SerializerMethodField()
    receipt = serializers.SerializerMethodField()

    class Meta:
        model = Milestone
        fields = [
            "id",
            "sequence",
            "name",
            "description",
            "amount",
            "due_date",
            "status",
            "paid_date",
            "payment_mode",
            "transaction_reference",
            "admin_remarks",
            "latest_proof",
            "receipt",
        ]

    def get_latest_proof(self, obj):
        proof = obj.proofs.order_by("-created_at").first()
        return PaymentProofMiniSerializer(proof).data if proof else None

    def get_receipt(self, obj):
        doc = obj.documents.first() if hasattr(obj, "documents") else None
        if not doc:
            return None
        from documents.serializers import DocumentSerializer

        return DocumentSerializer(doc, context=self.context).data


class PaymentsSummarySerializer(serializers.Serializer):
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    paid_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    remaining_instalments = serializers.IntegerField()
    next_due_date = serializers.DateField(allow_null=True)
    next_due_amount = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    milestones = MilestoneListSerializer(many=True)


class PayMilestoneSerializer(serializers.Serializer):
    file = serializers.FileField()
    claimed_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    payment_date = serializers.DateField()
    payment_mode = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    transaction_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")


class ScheduleItemSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    due_date = serializers.DateField()


class MilestoneChangeRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MilestoneChangeRequest
        fields = ["id", "change_type", "proposed_details", "reason", "attachment", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]


class MilestoneChangeRequestSerializer(serializers.ModelSerializer):
    requested_by_email = serializers.CharField(source="requested_by.email", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.name", read_only=True)
    plot_number = serializers.CharField(source="plot.plot_number", read_only=True)
    project_name = serializers.CharField(source="plot.project.name", read_only=True)
    reviewed_by_email = serializers.CharField(source="reviewed_by.email", default=None, read_only=True)

    class Meta:
        model = MilestoneChangeRequest
        fields = [
            "id",
            "plot",
            "plot_number",
            "project_name",
            "requested_by",
            "requested_by_email",
            "requested_by_name",
            "change_type",
            "proposed_details",
            "reason",
            "attachment",
            "status",
            "admin_response",
            "counter_schedule",
            "reviewed_by_email",
            "reviewed_at",
            "created_at",
        ]


class ChangeRequestApproveSerializer(serializers.Serializer):
    schedule = ScheduleItemSerializer(many=True, required=False)


class ChangeRequestDeclineSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ChangeRequestCounterSerializer(serializers.Serializer):
    schedule = ScheduleItemSerializer(many=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# Admin — 7.9/7.10 Milestones + Payment Verification Queue
# ---------------------------------------------------------------------------
class AdminMilestoneSerializer(serializers.ModelSerializer):
    plot_number = serializers.CharField(source="plot.plot_number", read_only=True)
    project_name = serializers.CharField(source="plot.project.name", read_only=True)
    buyer = serializers.SerializerMethodField()
    receipt = serializers.SerializerMethodField()

    class Meta:
        model = Milestone
        fields = [
            "id",
            "plot",
            "plot_number",
            "project_name",
            "buyer",
            "receipt",
            "sequence",
            "name",
            "description",
            "amount",
            "due_date",
            "status",
            "paid_date",
            "payment_mode",
            "transaction_reference",
            "admin_remarks",
        ]
        read_only_fields = ["id"]

    def get_buyer(self, obj):
        # plot.customers is prefetched by the viewset; avoid .filter() so the prefetch is used.
        primary = next((c for c in obj.plot.customers.all() if c.plot_role == "PRIMARY"), None)
        if not primary:
            return None
        return {"id": primary.id, "name": primary.name, "email": primary.email}

    def get_receipt(self, obj):
        """Latest platform-generated receipt. `receipts` is prefetched by AdminMilestoneViewSet; fall back to a query
        for create/update responses."""
        receipts = getattr(obj, "receipts", None)
        if receipts is None:
            receipts = list(obj.documents.filter(doc_type="PAYMENT_RECEIPT").order_by("-created_at")[:1])
        doc = receipts[0] if receipts else None
        if not doc or not doc.file:
            return None
        return {"id": doc.id, "name": doc.name, "url": doc.file.url, "created_at": doc.created_at}


class PaymentVerificationQueueSerializer(serializers.ModelSerializer):
    customer_email = serializers.CharField(source="submitted_by.email", read_only=True)
    customer_name = serializers.CharField(source="submitted_by.name", read_only=True)
    project_name = serializers.CharField(source="milestone.plot.project.name", read_only=True)
    plot_number = serializers.CharField(source="milestone.plot.plot_number", read_only=True)
    milestone_name = serializers.CharField(source="milestone.name", read_only=True)
    expected_amount = serializers.DecimalField(source="milestone.amount", max_digits=14, decimal_places=2, read_only=True)
    customer_id = serializers.IntegerField(source="submitted_by.id", read_only=True)
    plot_id = serializers.IntegerField(source="milestone.plot_id", read_only=True)
    milestone_sequence = serializers.IntegerField(source="milestone.sequence", read_only=True)
    milestone_due_date = serializers.DateField(source="milestone.due_date", read_only=True)
    reviewed_by_email = serializers.CharField(source="reviewed_by.email", default=None, read_only=True)
    # annotated by PaymentVerificationQueueView; absent (default) on approve/reject responses
    milestone_count = serializers.IntegerField(read_only=True, default=None)
    duplicate_reference = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = PaymentProof
        fields = [
            "id",
            "milestone",
            "milestone_name",
            "milestone_sequence",
            "milestone_count",
            "milestone_due_date",
            "expected_amount",
            "customer_id",
            "customer_email",
            "customer_name",
            "project_name",
            "plot_id",
            "plot_number",
            "file",
            "claimed_amount",
            "payment_date",
            "payment_mode",
            "transaction_reference",
            "status",
            "rejection_reason",
            "reviewed_by_email",
            "reviewed_at",
            "duplicate_reference",
            "created_at",
        ]


class ApprovePaymentProofSerializer(serializers.Serializer):
    corrected_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    corrected_date = serializers.DateField(required=False)


class RejectPaymentProofSerializer(serializers.Serializer):
    reason = serializers.CharField()


class PaymentOverviewFilterSerializer(serializers.Serializer):
    project = serializers.IntegerField(required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)


class PaymentOverviewSerializer(serializers.Serializer):
    due = serializers.DecimalField(max_digits=14, decimal_places=2)
    overdue = serializers.DecimalField(max_digits=14, decimal_places=2)
    received = serializers.DecimalField(max_digits=14, decimal_places=2)
    under_review = serializers.DecimalField(max_digits=14, decimal_places=2)
    milestone_count = serializers.IntegerField()
