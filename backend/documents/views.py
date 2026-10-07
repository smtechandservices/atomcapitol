import os

from django.db.models import Count, Q
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

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
    queryset = Document.objects.select_related("customer__assigned_plot", "project", "milestone", "uploaded_by").all()
    serializer_class = AdminDocumentSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["doc_type", "status", "customer", "project", "is_visible_to_customer"]
    search_fields = ["name", "customer__email", "customer__name", "customer__assigned_plot__plot_number"]

    def perform_create(self, serializer):
        instance = serializer.save(uploaded_by=self.request.user)
        AuditLog.record(self.request.user, "document.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "document.update", target=instance, ip_address=self.request.client_ip)

    def perform_destroy(self, instance):
        AuditLog.record(self.request.user, "document.delete", target=instance, ip_address=self.request.client_ip)
        instance.delete()

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Counts for the Documents page header, optionally scoped to ?project=<id>."""
        qs = Document.objects.all()
        if project := request.query_params.get("project"):
            qs = qs.filter(project_id=project)
        by_type = {t: 0 for t in Document.DocType.values}
        by_type.update({r["doc_type"]: r["n"] for r in qs.values("doc_type").annotate(n=Count("id"))})
        return Response(
            {
                "total": qs.count(),
                "by_type": by_type,
                "in_progress": qs.filter(status=Document.DocStatus.IN_PROGRESS).count(),
                "missing_file": qs.filter(Q(file="") | Q(file__isnull=True)).count(),
                "hidden": qs.filter(is_visible_to_customer=False).count(),
            }
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Stream the file as an attachment. The browser ignores <a download> for cross-origin media
        (local /media on another port, or S3), so the portal downloads through this authenticated endpoint."""
        document = self.get_object()
        if not document.file:
            raise NotFound("This document has no file.")
        return FileResponse(document.file.open("rb"), as_attachment=True, filename=os.path.basename(document.file.name))
