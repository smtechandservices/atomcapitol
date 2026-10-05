from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.serializers import apply_html_form_boolean_defaults

from .models import AdminUser, Customer


# ---------------------------------------------------------------------------
# CustomerApp — auth (2. Onboarding, 4.2-4.3)
# ---------------------------------------------------------------------------
class CustomerEmailLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=10)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class SalesContactSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    photo = serializers.SerializerMethodField()
    phone = serializers.CharField()
    email = serializers.EmailField()

    def get_photo(self, obj):
        request = self.context.get("request")
        if obj.photo and hasattr(obj.photo, "url"):
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        return None


class CustomerPlotSummarySerializer(serializers.Serializer):
    """Minimal plot info embedded in profile/dashboard payloads."""

    id = serializers.IntegerField()
    project_name = serializers.CharField(source="project.name")
    plot_number = serializers.CharField()
    size = serializers.CharField()
    block_sector = serializers.CharField()
    status = serializers.CharField()


class CustomerProfileSerializer(serializers.ModelSerializer):
    """5.12 Profile — read only for the customer; corrections go through a ticket."""

    plot = serializers.SerializerMethodField()
    sales_person = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id",
            "email",
            "name",
            "phone",
            "address",
            "kyc_status",
            "plot",
            "plot_role",
            "sales_person",
            "notify_email",
            "notify_push",
            "language",
            "created_at",
        ]
        read_only_fields = fields

    def get_plot(self, obj):
        if not obj.assigned_plot:
            return None
        return CustomerPlotSummarySerializer(obj.assigned_plot).data

    def get_sales_person(self, obj):
        if not obj.assigned_sales_person:
            return None
        return SalesContactSerializer(obj.assigned_sales_person, context=self.context).data


class CustomerSettingsSerializer(serializers.ModelSerializer):
    """5.13 Settings & Help — notification preferences + language."""

    class Meta:
        model = Customer
        fields = ["notify_email", "notify_push", "language"]


class RequestCorrectionSerializer(serializers.Serializer):
    """5.12 'Request correction' raises a ticket for admin instead of editing the field directly."""

    field = serializers.CharField(max_length=100)
    current_value = serializers.CharField(max_length=500, required=False, allow_blank=True)
    requested_value = serializers.CharField(max_length=500)
    note = serializers.CharField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# Admin Portal — auth (7.1)
# ---------------------------------------------------------------------------
class AdminLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class AdminForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class AdminResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


# ---------------------------------------------------------------------------
# Admin Portal — 7.18 Admin Users & Roles
# ---------------------------------------------------------------------------
class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, validators=[validate_password])

    class Meta:
        model = AdminUser
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "is_active",
            "date_joined",
            "password",
        ]
        read_only_fields = ["id", "date_joined"]

    def create(self, validated_data):
        validated_data = apply_html_form_boolean_defaults(self, validated_data, {"is_active": True})
        password = validated_data.pop("password", None)
        user = AdminUser(**validated_data)
        user.set_password(password or AdminUser.objects.make_random_password())
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


# ---------------------------------------------------------------------------
# Admin Portal — 7.5/7.6/7.7 Customers
# ---------------------------------------------------------------------------
class CustomerListSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="assigned_plot.project.name", default=None, read_only=True)
    plot_number = serializers.CharField(source="assigned_plot.plot_number", default=None, read_only=True)
    sales_person_name = serializers.CharField(source="assigned_sales_person.name", default=None, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "project_name",
            "plot_number",
            "plot_role",
            "kyc_status",
            "is_active",
            "sales_person_name",
            "created_at",
        ]


class CustomerAdminCreateSerializer(serializers.ModelSerializer):
    """7.6 Add / Invite Customer — registering the email is what makes it valid for app login."""

    class Meta:
        model = Customer
        fields = ["id", "email", "name", "phone", "address"]

    def validate_email(self, value):
        if Customer.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A customer with this email already exists.")
        return value.lower()


class CustomerAdminDetailSerializer(serializers.ModelSerializer):
    plot = serializers.SerializerMethodField()
    sales_person_id = serializers.IntegerField(source="assigned_sales_person_id", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "email",
            "name",
            "phone",
            "address",
            "kyc_status",
            "is_active",
            "plot",
            "plot_role",
            "assigned_sales_person",
            "sales_person_id",
            "created_at",
            "updated_at",
            "last_login_at",
        ]
        read_only_fields = ["id", "email", "kyc_status", "plot", "plot_role", "created_at", "updated_at", "last_login_at"]

    def get_plot(self, obj):
        if not obj.assigned_plot:
            return None
        return CustomerPlotSummarySerializer(obj.assigned_plot).data
