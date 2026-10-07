from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Customer
from core.models import AuditLog
from core.permissions import IsCustomerUser, IsKYCApproved, role_required

from . import services
from .models import Banner, Notification, NotificationCampaign
from .serializers import BannerSerializer, NotificationCampaignSerializer, NotificationSerializer


# ---------------------------------------------------------------------------
# CustomerApp — 5.11 Notifications, dashboard Banners
# ---------------------------------------------------------------------------
class CustomerNotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsCustomerUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_read", "notif_type"]

    def get_queryset(self):
        return Notification.objects.filter(customer=self.request.user)


class CustomerNotificationMarkReadView(APIView):
    permission_classes = [IsCustomerUser]

    def post(self, request, pk=None):
        notification = Notification.objects.filter(pk=pk, customer=request.user).first()
        if not notification:
            raise NotFound("Notification not found.")
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)


class CustomerNotificationMarkAllReadView(APIView):
    permission_classes = [IsCustomerUser]

    def post(self, request):
        Notification.objects.filter(customer=request.user, is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked as read."})


class CustomerBannerListView(generics.ListAPIView):
    serializer_class = BannerSerializer
    permission_classes = [IsKYCApproved]

    def get_queryset(self):
        qs = Banner.objects.filter(is_active=True)
        return [b for b in qs if b.is_currently_active()]


# ---------------------------------------------------------------------------
# Admin — 7.15 Banners
# ---------------------------------------------------------------------------
class BannerViewSet(viewsets.ModelViewSet):
    queryset = Banner.objects.all()
    serializer_class = BannerSerializer
    permission_classes = [role_required("SUPER_ADMIN")]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def perform_create(self, serializer):
        instance = serializer.save()
        services.notify_new_banner(instance)
        AuditLog.record(self.request.user, "banner.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "banner.update", target=instance, ip_address=self.request.client_ip)


# ---------------------------------------------------------------------------
# Admin — 7.16 Notifications & Email (compose/send + delivery log)
# ---------------------------------------------------------------------------
class NotificationCampaignViewSet(viewsets.ModelViewSet):
    queryset = NotificationCampaign.objects.all()
    serializer_class = NotificationCampaignSerializer
    permission_classes = [role_required("SUPER_ADMIN", "SUPPORT")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status", "target_type", "channel"]
    search_fields = ["title"]

    def get_queryset(self):
        return NotificationCampaign.objects.select_related("target_project", "created_by").prefetch_related("target_customers")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        AuditLog.record(self.request.user, "campaign.create", target=instance, ip_address=self.request.client_ip)

    # Sent campaigns are history: no edits, no deletes.
    def perform_update(self, serializer):
        if serializer.instance.status == NotificationCampaign.CampaignStatus.SENT:
            raise ValidationError({"detail": "This campaign has already been sent and can't be edited."})
        instance = serializer.save()
        AuditLog.record(self.request.user, "campaign.update", target=instance, ip_address=self.request.client_ip)

    def perform_destroy(self, instance):
        if instance.status == NotificationCampaign.CampaignStatus.SENT:
            raise ValidationError({"detail": "Sent campaigns are kept for the record and can't be deleted."})
        AuditLog.record(self.request.user, "campaign.delete", target=instance, ip_address=self.request.client_ip)
        instance.delete()

    @action(detail=False, methods=["get"], url_path="preview-recipients")
    def preview_recipients(self, request):
        """How many customers a draft would reach: ?target_type=ALL|PROJECT|SELECTED&target_project=&target_customers=1,2"""
        params = request.query_params
        draft = NotificationCampaign(target_type=params.get("target_type", NotificationCampaign.TargetType.ALL))
        if draft.target_type == NotificationCampaign.TargetType.PROJECT:
            draft.target_project_id = params.get("target_project") or None
            count = services.resolve_recipients(draft).count() if draft.target_project_id else 0
        elif draft.target_type == NotificationCampaign.TargetType.SELECTED:
            ids = [int(i) for i in params.get("target_customers", "").split(",") if i.strip().isdigit()]
            count = Customer.objects.filter(id__in=ids, is_active=True).count()
        else:
            count = services.resolve_recipients(draft).count()
        return Response({"count": count})

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = NotificationCampaign.objects.all()
        sent = qs.filter(status=NotificationCampaign.CampaignStatus.SENT)
        return Response(
            {
                "drafts": qs.filter(status=NotificationCampaign.CampaignStatus.DRAFT).count(),
                "sent": sent.count(),
                "delivered": sent.aggregate(t=Sum("recipient_count"))["t"] or 0,
                "reachable": Customer.objects.filter(is_active=True).count(),
                "last_sent_at": sent.order_by("-sent_at").values_list("sent_at", flat=True).first(),
            }
        )

    @action(detail=True, methods=["post"], url_path="send")
    def send_now(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status == NotificationCampaign.CampaignStatus.SENT:
            return Response({"detail": "Already sent.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        services.send_campaign(campaign)
        AuditLog.record(request.user, "campaign.send", target=campaign, ip_address=request.client_ip)
        return Response(self.get_serializer(campaign).data)

    @action(detail=False, methods=["get"], url_path="delivery-log")
    def delivery_log(self, request):
        sent = self.get_queryset().filter(status=NotificationCampaign.CampaignStatus.SENT).order_by("-sent_at")
        return Response(self.get_serializer(sent, many=True).data)
