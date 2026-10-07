from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, permissions
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, SiteSettings
from .permissions import HasAdminRole, IsCustomerUser, role_required
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
    # Bank/UPI details decide where customers send money — super admins only.
    permission_classes = [role_required("SUPER_ADMIN")]

    def get_object(self):
        return SiteSettings.load()


def _target_labels(entries):
    """Human-readable names for the targets on one page, fetched with one query per target type."""
    from accounts.models import AdminUser, Customer
    from documents.models import Document
    from kyc.models import KYCSubmission
    from notifications.models import Banner, NotificationCampaign
    from payments.models import MilestoneChangeRequest, PaymentProof
    from projects.models import Plot, Project
    from sales.models import SalesPerson
    from tickets.models import Ticket

    def who(customer):
        return customer.name or customer.email

    registry = {
        "Customer": (Customer.objects.all(), who),
        "AdminUser": (AdminUser.objects.all(), lambda u: u.get_full_name()),
        "Project": (Project.objects.all(), lambda p: p.name),
        "Plot": (Plot.objects.select_related("project"), lambda p: f"{p.plot_number} · {p.project.name}"),
        "PaymentProof": (
            PaymentProof.objects.select_related("submitted_by", "milestone__plot"),
            lambda p: f"{who(p.submitted_by)} · {p.milestone.plot.plot_number} · {p.milestone.name}",
        ),
        "MilestoneChangeRequest": (
            MilestoneChangeRequest.objects.select_related("requested_by", "plot"),
            lambda r: f"{who(r.requested_by)} · {r.plot.plot_number}",
        ),
        "KYCSubmission": (KYCSubmission.objects.select_related("customer"), lambda k: who(k.customer)),
        "Document": (Document.objects.all(), lambda d: d.name),
        "Banner": (Banner.objects.all(), lambda b: b.title),
        "NotificationCampaign": (NotificationCampaign.objects.all(), lambda c: c.title),
        "SalesPerson": (SalesPerson.objects.all(), lambda s: s.name),
        "Ticket": (Ticket.objects.select_related("customer"), lambda t: f"#{t.id} {t.subject}"),
    }
    wanted = {}
    for e in entries:
        if e.target_type in registry and e.target_id.isdigit():
            wanted.setdefault(e.target_type, set()).add(int(e.target_id))
    labels = {}
    for target_type, ids in wanted.items():
        qs, label = registry[target_type]
        for obj in qs.filter(pk__in=ids):
            labels[(target_type, str(obj.pk))] = label(obj)
    return labels


class AuditLogListView(generics.ListAPIView):
    """7.19 Audit Log: who changed what and when. Super admins only.
    Filters: action, action__startswith (category), target_type, actor, created_at__date__gte/lte."""

    serializer_class = AuditLogSerializer
    permission_classes = [role_required("SUPER_ADMIN")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "action": ["exact", "startswith"],
        "target_type": ["exact"],
        "actor": ["exact"],
        "created_at": ["date__gte", "date__lte"],
    }
    search_fields = ["action", "target_type", "target_id", "actor__email", "actor__first_name", "actor__last_name"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    queryset = AuditLog.objects.select_related("actor").all()

    # ?category= groups related action prefixes for the page's filter pills.
    CATEGORIES = {
        "payments": ["payment_proof.", "milestone_change_request.", "milestone."],
        "customers": ["customer.", "plot.", "kyc."],
        "projects": ["project."],
        "documents": ["document."],
        "content": ["banner.", "campaign."],
        "team": ["admin.", "admin_user.", "sales_person."],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        prefixes = self.CATEGORIES.get(self.request.query_params.get("category", ""))
        if prefixes:
            q = Q()
            for prefix in prefixes:
                q |= Q(action__startswith=prefix)
            qs = qs.filter(q)
        return qs

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        context = {**self.get_serializer_context(), "target_labels": _target_labels(page)}
        return self.get_paginated_response(self.serializer_class(page, many=True, context=context).data)


class AuditLogFacetsView(APIView):
    """Options for the Audit Log filters: every action seen (with counts) and every admin who acted."""

    permission_classes = [role_required("SUPER_ADMIN")]

    def get(self, request):
        from accounts.models import AdminUser

        actions = AuditLog.objects.order_by().values("action").annotate(count=Count("id")).order_by("action")
        actor_ids = AuditLog.objects.order_by().exclude(actor=None).values_list("actor", flat=True).distinct()
        actors = AdminUser.objects.filter(pk__in=actor_ids).order_by("first_name", "email")
        return Response(
            {
                "actions": list(actions),
                "actors": [{"id": a.id, "name": a.get_full_name(), "email": a.email} for a in actors],
            }
        )
