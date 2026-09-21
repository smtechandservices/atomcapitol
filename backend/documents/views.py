from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from core.models import AuditLog
from core.permissions import IsKYCApproved, role_required

from .models import Document
from .serializers import AdminDocumentSerializer, DocumentSerializer


# ---------------------------------------------------------------------------
# CustomerApp — 5.7 Documents
# ---------------------------------------------------------------------------
class CustomerDocumentListView(generics.ListAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsKYCApproved]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["doc_type", "status"]

    def get_queryset(self):
        return Document.objects.filter(customer=self.request.user, is_visible_to_customer=True).order_by("-created_at")


class CustomerDocumentDetailView(generics.RetrieveAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsKYCApproved]

    def get_queryset(self):
        return Document.objects.filter(customer=self.request.user, is_visible_to_customer=True)


# ---------------------------------------------------------------------------
# Admin — 7.13 Documents
# ---------------------------------------------------------------------------
class AdminDocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related("customer", "project").all()
    serializer_class = AdminDocumentSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["doc_type", "status", "customer", "project"]
    search_fields = ["name", "customer__email"]

    def perform_create(self, serializer):
        instance = serializer.save(uploaded_by=self.request.user)
        AuditLog.record(self.request.user, "document.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "document.update", target=instance, ip_address=self.request.client_ip)

    def perform_destroy(self, instance):
        AuditLog.record(self.request.user, "document.delete", target=instance, ip_address=self.request.client_ip)
        instance.delete()
