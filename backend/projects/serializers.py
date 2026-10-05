from rest_framework import serializers

from .models import Plot, PlotAssignmentHistory, Project, ProjectImage


# ---------------------------------------------------------------------------
# Admin — 7.3 Projects
# ---------------------------------------------------------------------------
class ProjectImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectImage
        fields = ["id", "image", "image_type", "caption", "order"]


class ProjectSerializer(serializers.ModelSerializer):
    images = ProjectImageSerializer(many=True, read_only=True)
    plot_count = serializers.IntegerField(source="plots.count", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "location",
            "latitude",
            "longitude",
            "description",
            "amenities",
            "brochure",
            "development_status",
            "is_published",
            "images",
            "plot_count",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Admin — 7.4 Plot Inventory
# ---------------------------------------------------------------------------
class PlotAssignmentHistorySerializer(serializers.ModelSerializer):
    performed_by_email = serializers.CharField(source="performed_by.email", default=None, read_only=True)

    class Meta:
        model = PlotAssignmentHistory
        fields = ["id", "action", "from_email", "to_email", "reason", "performed_by_email", "created_at"]


class PlotBuyerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    name = serializers.CharField()
    plot_role = serializers.CharField()
    kyc_status = serializers.CharField()


class PlotSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    remaining_balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    buyers = serializers.SerializerMethodField()

    class Meta:
        model = Plot
        fields = [
            "id",
            "project",
            "project_name",
            "plot_number",
            "size",
            "block_sector",
            "price",
            "status",
            "booking_date",
            "total_value",
            "amount_paid_outside_app",
            "instalment_count",
            "remaining_balance",
            "buyers",
            "created_at",
        ]

    def get_buyers(self, obj):
        return PlotBuyerSerializer(obj.customers.all(), many=True).data


class PlotAssignSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["PRIMARY", "CO_APPLICANT"], default="PRIMARY")
    name = serializers.CharField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    amount_paid_outside_app = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    instalment_count = serializers.IntegerField(required=False, min_value=1)

    def get_commercial_position(self):
        data = self.validated_data
        if "total_value" not in data:
            return None
        return {
            "total_value": data["total_value"],
            "amount_paid_outside_app": data.get("amount_paid_outside_app", 0),
            "instalment_count": data.get("instalment_count"),
        }


class PlotUnassignSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PlotTransferSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    new_email = serializers.EmailField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# CustomerApp — 5.2 Township & Plot Details
# ---------------------------------------------------------------------------
class CustomerPlotDetailSerializer(serializers.ModelSerializer):
    project = ProjectSerializer(read_only=True)

    class Meta:
        model = Plot
        fields = [
            "id",
            "project",
            "plot_number",
            "size",
            "block_sector",
            "status",
            "booking_date",
            "total_value",
        ]
