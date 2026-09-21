from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, SiteSettings
from .permissions import HasAdminRole, IsAdminPortalUser, IsCustomerUser, role_required
from .serializers import AuditLogSerializer, PublicSiteSettingsSerializer, SiteSettingsSerializer


class HealthCheckView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"status": "ok"})


class PublicSiteSettingsView(generics.RetrieveAPIView):
    """CustomerApp: bank/UPI payment details + support contact (also usable pre-login)."""

    serializer_class = PublicSiteSettingsSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get_object(self):
        return SiteSettings.load()


class AdminSiteSettingsView(generics.RetrieveUpdateAPIView):
    """7.19 Settings: company details, bank/UPI details, receipt template, support contact."""

    serializer_class = SiteSettingsSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def get_object(self):
        return SiteSettings.load()


class AuditLogListView(generics.ListAPIView):
    """7.19 Audit Log: who changed what and when."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminPortalUser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["action", "target_type", "actor"]
    search_fields = ["action", "target_type", "target_id"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    queryset = AuditLog.objects.select_related("actor").all()
