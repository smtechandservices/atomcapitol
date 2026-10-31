import os
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.http import FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Customer
from core.models import AuditLog
from core.permissions import IsKYCApproved, role_required
from payments.models import Milestone
from payments.services import KYC_INSTALMENT_SEQUENCE, paid_total_from, plot_paid_total
from projects.models import Plot

from .models import Document
from .serializers import AdminDocumentSerializer, DocumentSerializer
from .services import ALLOTMENT_THRESHOLD, issue_allotment_letter


# ---------------------------------------------------------------------------
# CustomerApp — 5.7 Documents
# ---------------------------------------------------------------------------
def customer_documents(customer):
    """The buyer's own documents, plus those shared with everyone in their plot's project (no customer set)."""
    mine = Q(customer=customer)
    plot = customer.assigned_plot
    if plot is not None:
        mine |= Q(customer__isnull=True, project_id=plot.project_id)
    return Document.objects.filter(mine, is_visible_to_customer=True)


class CustomerDocumentListView(generics.ListAPIView):
    queryset = Document.objects.none()
    serializer_class = DocumentSerializer
    permission_classes = [IsKYCApproved]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["doc_type", "status"]

    def get_queryset(self):
        return customer_documents(self.request.user).order_by("-created_at")


class CustomerDocumentDetailView(generics.RetrieveAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsKYCApproved]

    def get_queryset(self):
        return customer_documents(self.request.user)


# ---------------------------------------------------------------------------
# Admin — 7.13 Documents
# ---------------------------------------------------------------------------
class AdminDocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related("customer__assigned_plot__project", "project", "milestone", "uploaded_by").all()
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


# ---------------------------------------------------------------------------
# Admin — Allotment letters
# ---------------------------------------------------------------------------
# Plot letter status: every buyer has a visible letter / paid enough but someone lacks one / not yet due.
ALLOTMENT_STATUS_ORDER = {"READY": 0, "ISSUED": 1, "NOT_DUE": 2}


def _allotment_plots(*, project=None, search=""):
    paid = Q(milestones__status=Milestone.Status.PAID)
    # Plots are picked by subquery so the buyer join can't multiply the milestone sums.
    qs = (
        Plot.objects.filter(pk__in=Customer.objects.filter(is_active=True, assigned_plot__isnull=False).values("assigned_plot"))
        .select_related("project")
        # -plot_role puts PRIMARY before CO_APPLICANT.
        .prefetch_related(Prefetch("customers", queryset=Customer.objects.filter(is_active=True).order_by("-plot_role", "id")))
        .annotate(
            paid_instalments=Sum("milestones__amount", filter=paid),
            booking_paid=Sum("milestones__amount", filter=paid & Q(milestones__sequence=KYC_INSTALMENT_SEQUENCE)),
            instalments_paid=Count("milestones", filter=paid),
            instalments_total=Count("milestones"),
        )
    )
    if project:
        qs = qs.filter(project_id=project)
    if search := search.strip():
        matches = Plot.objects.filter(
            Q(plot_number__icontains=search)
            | Q(project__name__icontains=search)
            | Q(customers__name__icontains=search)
            | Q(customers__email__icontains=search)
        ).values("pk")
        qs = qs.filter(pk__in=matches)
    return qs


def _allotment_rows(plots):
    plots = list(plots)
    buyer_ids = [c.id for p in plots for c in p.customers.all()]
    letters = {}
    for doc in Document.objects.filter(doc_type=Document.DocType.ALLOTMENT_LETTER, customer_id__in=buyer_ids).order_by("created_at"):
        letters[(doc.customer_id, doc.project_id)] = doc  # newest wins

    rows = []
    for plot in plots:
        paid = paid_total_from(plot.paid_instalments, plot.booking_paid, plot.amount_paid_outside_app)
        total = plot.total_value
        due = bool(total) and paid >= total * ALLOTMENT_THRESHOLD
        buyers = []
        for c in plot.customers.all():
            doc = letters.get((c.id, plot.project_id))
            buyers.append(
                {
                    "id": c.id,
                    "name": c.name,
                    "email": c.email,
                    "plot_role": c.plot_role,
                    "letter": doc
                    and {
                        "id": doc.id,
                        "file": doc.file.url if doc.file else None,
                        "is_visible_to_customer": doc.is_visible_to_customer,
                        "issued_at": doc.updated_at,
                        "issued_by": doc.uploaded_by.email if doc.uploaded_by_id else None,
                    },
                }
            )
        shared = all(b["letter"] and b["letter"]["is_visible_to_customer"] for b in buyers)
        rows.append(
            {
                "plot": plot.id,
                "plot_number": plot.plot_number,
                "phase": plot.phase,
                "project": plot.project_id,
                "project_name": plot.project.name,
                "total_value": str(total) if total is not None else None,
                "paid": str(paid.quantize(Decimal("0.01"))),
                "paid_percent": round(float(paid / total * 100), 1) if total else None,
                "threshold_amount": str((total * ALLOTMENT_THRESHOLD).quantize(Decimal("0.01"))) if total else None,
                "instalments_paid": plot.instalments_paid,
                "instalments_total": plot.instalments_total,
                "letter_status": "ISSUED" if shared else "READY" if due else "NOT_DUE",
                "buyers": buyers,
            }
        )
    return rows


class AdminAllotmentListView(APIView):
    """Plots with buyers: how much is paid against the 50% allotment threshold and which buyers have their letter.
    ?project, ?search (plot, project, buyer), ?letter_status (READY / ISSUED / NOT_DUE). Ready-to-issue plots first."""

    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def get(self, request):
        # The status needs each plot's paid total, so it's filtered and sorted here rather than in SQL.
        params = request.query_params
        rows = _allotment_rows(_allotment_plots(project=params.get("project"), search=params.get("search", "")))
        stats = {s: sum(r["letter_status"] == s for r in rows) for s in ALLOTMENT_STATUS_ORDER}
        if letter_status := request.query_params.get("letter_status"):
            rows = [r for r in rows if r["letter_status"] == letter_status]
        rows.sort(key=lambda r: (ALLOTMENT_STATUS_ORDER[r["letter_status"]], -(r["paid_percent"] or 0), r["plot_number"]))

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        response = paginator.get_paginated_response(page)
        response.data["stats"] = stats
        return response


class AdminIssueAllotmentView(APIView):
    """Issues (or re-issues, with today's figures) the allotment letter to the plot's buyers by hand, whatever is
    paid. Body: {"customers": [ids]} to pick buyers; all of them when left out."""

    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

    def post(self, request, plot_id):
        plot = Plot.objects.select_related("project").filter(pk=plot_id).first()
        if plot is None:
            raise NotFound("Plot not found.")
        if not plot.total_value:
            return Response(
                {"detail": "Set the plot's selling price before issuing its allotment letter.", "errors": {"code": "no_total_value"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        buyers = plot.customers.filter(is_active=True)
        if ids := request.data.get("customers"):
            buyers = buyers.filter(pk__in=ids)
        buyers = list(buyers)
        if not buyers:
            return Response({"detail": "No buyer on this plot to issue it to.", "errors": {"code": "no_buyers"}}, status=status.HTTP_400_BAD_REQUEST)

        paid = plot_paid_total(plot)
        with transaction.atomic():
            documents = [issue_allotment_letter(plot, c, paid=paid, issued_by=request.user) for c in buyers]
            AuditLog.record(
                request.user,
                "allotment_letter.issue",
                target=plot,
                details={"customers": [c.id for c in buyers], "documents": [d.id for d in documents], "paid": str(paid)},
                ip_address=request.client_ip,
            )
        return Response(_allotment_rows(_allotment_plots().filter(pk=plot.pk))[0])
