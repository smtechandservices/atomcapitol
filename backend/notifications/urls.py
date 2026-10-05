from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("admin/banners", views.BannerViewSet, basename="admin-banner")
router.register("admin/notifications/campaigns", views.NotificationCampaignViewSet, basename="admin-campaign")

urlpatterns = [
    # CustomerApp
    path("customer/notifications/", views.CustomerNotificationListView.as_view(), name="customer-notifications"),
    path("customer/notifications/<int:pk>/read/", views.CustomerNotificationMarkReadView.as_view(), name="customer-notification-read"),
    path("customer/notifications/mark-all-read/", views.CustomerNotificationMarkAllReadView.as_view(), name="customer-notifications-mark-all-read"),
    path("customer/banners/", views.CustomerBannerListView.as_view(), name="customer-banners"),
] + router.urls
