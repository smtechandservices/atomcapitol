from django.conf import settings
from django.contrib.auth import authenticate
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import AuditLog, SiteSettings
from core.permissions import IsCustomerUser, IsKYCApproved, role_required

from . import services
from .authentication import issue_admin_tokens, issue_customer_tokens
from .models import AdminUser, Customer
from .serializers import (
    AdminLoginSerializer,
    AdminUserSerializer,
    CustomerAdminCreateSerializer,
    CustomerAdminDetailSerializer,
    CustomerEmailLoginSerializer,
    CustomerListSerializer,
    CustomerProfileSerializer,
    CustomerSettingsSerializer,
    OTPVerifySerializer,
    RequestCorrectionSerializer,
    ResendOTPSerializer,
    SalesContactSerializer,
)


# ---------------------------------------------------------------------------
# CustomerApp auth — flowchart step 1 (email + plot check) & OTP
# ---------------------------------------------------------------------------
class CustomerLoginView(APIView):
    """4.2 Login (Email): validate + check registered & plot-assigned, then send OTP."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = CustomerEmailLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        customer = services.get_login_eligible_customer(email)
        if customer is None:
            settings_obj = SiteSettings.load()
            return Response(
                {
                    "detail": "This email is not registered and assigned to a plot. Please contact support.",
                    "errors": {},
                    "support_phone": settings_obj.support_phone,
                    "support_email": settings_obj.support_email,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            services.start_login(customer)
        except services.OTPSendError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response(
            {"detail": "OTP sent to your registered email.", "email": customer.email},
            status=status.HTTP_200_OK,
        )


class CustomerResendOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = services.get_login_eligible_customer(serializer.validated_data["email"])
        if customer is None:
            return Response({"detail": "Not found.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)
        try:
            services.start_login(customer)
        except services.OTPSendError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        return Response({"detail": "OTP resent."}, status=status.HTTP_200_OK)


class CustomerVerifyOTPView(APIView):
    """4.3 OTP Verification: on success, issue session and route by KYC status."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]

        customer = services.get_login_eligible_customer(email)
        if customer is None:
            return Response({"detail": "Not found.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)

        try:
            services.verify_otp(customer, code)
        except services.OTPVerifyError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)

        tokens = issue_customer_tokens(customer)
        return Response(
            {
                **tokens,
                "kyc_status": customer.kyc_status,
                "next_route": services.next_route_for_status(customer.kyc_status),
                "customer": CustomerProfileSerializer(customer, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """Blacklists the given refresh token. Works for both customer and admin tokens."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "refresh token is required.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response({"detail": "Invalid or already-invalidated token.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# CustomerApp — Profile, Settings, Sales contact (5.12, 5.13)
# ---------------------------------------------------------------------------
class CustomerProfileView(generics.RetrieveAPIView):
    serializer_class = CustomerProfileSerializer
    permission_classes = [IsKYCApproved]

    def get_object(self):
        return self.request.user


class CustomerSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = CustomerSettingsSerializer
    permission_classes = [IsCustomerUser]

    def get_object(self):
        return self.request.user


class CustomerSalesContactView(APIView):
    permission_classes = [IsKYCApproved]

    def get(self, request):
        sales_person = request.user.assigned_sales_person
        if not sales_person:
            return Response({"detail": "No sales contact assigned yet.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)
        return Response(SalesContactSerializer(sales_person, context={"request": request}).data)


class RequestCorrectionView(APIView):
    """5.12 'Request correction' — raises a ticket instead of letting the customer edit the field."""

    permission_classes = [IsKYCApproved]

    def post(self, request):
        serializer = RequestCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from tickets.services import create_ticket  # local import: avoid app load-order coupling

        data = serializer.validated_data
        description = (
            f"Profile correction requested for field '{data['field']}'.\n"
            f"Current value: {data.get('current_value', '')}\n"
            f"Requested value: {data['requested_value']}\n"
            f"Note: {data.get('note', '')}"
        )
        ticket = create_ticket(
            customer=request.user,
            category="GENERAL",
            subject=f"Profile correction: {data['field']}",
            description=description,
        )
        return Response({"detail": "Correction request submitted.", "ticket_id": ticket.id}, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Admin Portal auth (7.1)
# ---------------------------------------------------------------------------
class AdminLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            return Response({"detail": "Invalid credentials.", "errors": {}}, status=status.HTTP_401_UNAUTHORIZED)

        tokens = issue_admin_tokens(user)
        AuditLog.record(user, "admin.login", target=user, ip_address=getattr(request, "client_ip", None))
        return Response(
            {
                **tokens,
                "admin": {
                    "id": user.id,
                    "email": user.email,
                    "name": user.get_full_name(),
                    "role": user.role,
                },
            }
        )


# ---------------------------------------------------------------------------
# Admin Portal — 7.18 Admin Users & Roles (super admin only)
# ---------------------------------------------------------------------------
class AdminUserViewSet(viewsets.ModelViewSet):
    queryset = AdminUser.objects.all().order_by("-date_joined")
    serializer_class = AdminUserSerializer
    permission_classes = [role_required("SUPER_ADMIN")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = ["email", "first_name", "last_name"]

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "admin_user.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "admin_user.update", target=instance, ip_address=self.request.client_ip)

    def perform_destroy(self, instance):
        AuditLog.record(self.request.user, "admin_user.delete", target=instance, ip_address=self.request.client_ip)
        instance.delete()


# ---------------------------------------------------------------------------
# Admin Portal — 7.5/7.6/7.7 Customers
# ---------------------------------------------------------------------------
class CustomerAdminViewSet(viewsets.ModelViewSet):
    """List/search/export (7.5), Add/Invite (7.6), Detail + edit (7.7)."""

    queryset = Customer.objects.select_related("assigned_plot__project", "assigned_sales_person").all()
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS", "SUPPORT")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["kyc_status", "is_active", "assigned_plot__project", "assigned_sales_person"]
    search_fields = ["name", "email", "phone", "assigned_plot__plot_number"]
    ordering_fields = ["created_at", "name", "kyc_status"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return CustomerListSerializer
        if self.action == "create":
            return CustomerAdminCreateSerializer
        return CustomerAdminDetailSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "customer.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "customer.update", target=instance, ip_address=self.request.client_ip)
