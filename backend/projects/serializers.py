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

    def validate_phases(self, value):
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError("Phases must be a list of names.")
        names = [v.strip() for v in value if v.strip()]
        if len({n.lower() for n in names}) != len(names):
            raise serializers.ValidationError("Each phase name must be different.")
        return names

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
            "phases",
            "legal_fee",
            "registry_charges",
            "development_charges",
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
            "phase",
            "rate_per_sq_yd",
            "plc_percent",
            "plc_type",
            "price",
            "price_is_manual",
            "status",
            "booking_date",
            "total_value",
            "amount_paid_outside_app",
            "instalment_count",
            "remaining_balance",
            "buyers",
            "created_at",
        ]
        validators = []  # uniqueness checked in validate() with a readable message; the DB constraint still holds
        # price is derived in Plot.save() from size x rate_per_sq_yd x (1 + plc_percent/100) unless sent by hand
        read_only_fields = ["price_is_manual"]
        extra_kwargs = {
            "price": {"required": False, "min_value": 0},
            "total_value": {"min_value": 0},
            "rate_per_sq_yd": {"min_value": 0},
            "plc_percent": {"min_value": 0, "max_value": 100},
            "instalment_count": {"min_value": 2},
        }

    def validate(self, attrs):
        # Friendlier than DRF's "fields project, plot_number must make a unique set" (Meta.validators is cleared).
        project = attrs.get("project", getattr(self.instance, "project", None))
        number = attrs.get("plot_number", getattr(self.instance, "plot_number", None))
        if project and number:
            clash = Plot.objects.filter(project=project, plot_number__iexact=number)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"plot_number": f"Plot {number} already exists in {project.name}."})
        self._validate_pricing(attrs)
        # A list price sent by hand sticks; changing size / rate / PLC without one goes back to the derived price.
        if "price" in attrs:
            attrs["price_is_manual"] = True
        elif {"size", "rate_per_sq_yd", "plc_percent"} & attrs.keys():
            attrs["price_is_manual"] = False
        return attrs

    def _validate_pricing(self, attrs):
        # Partial edits that don't touch pricing (status, number…) skip this, so legacy plots without a rate stay editable.
        if self.partial and "size" not in attrs and "rate_per_sq_yd" not in attrs:
            return
        if "price" in attrs and attrs.get("rate_per_sq_yd", getattr(self.instance, "rate_per_sq_yd", None)) is None:
            return  # a hand-set price needs no rate
        size = attrs.get("size", getattr(self.instance, "size", None))
        rate = attrs.get("rate_per_sq_yd", getattr(self.instance, "rate_per_sq_yd", None))
        if rate is None:
            raise serializers.ValidationError({"rate_per_sq_yd": "Price per sq. yd is required."})
        if Plot.parse_area(size) is None:
            raise serializers.ValidationError({"size": "Enter the plot size in sq. yd as a positive number."})

    def validate_project(self, value):
        # A plot's project is fixed once created (its schedule, receipts and buyers hang off it).
        # To "move" an empty plot, delete it and add it to the other project.
        if self.instance is not None and value != self.instance.project:
            raise serializers.ValidationError("A plot can't be moved to another project. Delete it and add it to the other project instead.")
        return value

    def validate_status(self, value):
        # A plot with buyers on it can't be put back on sale — unassign or transfer them first.
        if value == Plot.Status.AVAILABLE and self.instance is not None and self.instance.customers.exists():
            raise serializers.ValidationError("This plot still has buyers assigned. Unassign them before marking it available.")
        return value

    def get_buyers(self, obj):
        return PlotBuyerSerializer(obj.customers.all(), many=True).data


class PlotAssignSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["PRIMARY", "CO_APPLICANT"], default="PRIMARY")
    name = serializers.CharField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    amount_paid_outside_app = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    # Includes instalment 1, which is the booking payment receipt submitted during KYC.
    instalment_count = serializers.IntegerField(required=False, min_value=2)

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
            "phase",
            "status",
            "booking_date",
            "total_value",
        ]


class CustomerProjectSerializer(serializers.ModelSerializer):
    """Published projects for the app: the home screen showcase and the KYC Step 1 project / phase dropdowns."""

    images = ProjectImageSerializer(many=True, read_only=True)

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
            "phases",
            "legal_fee",
            "registry_charges",
            "development_charges",
            "brochure",
            "development_status",
            "images",
        ]
