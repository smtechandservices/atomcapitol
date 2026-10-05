from django.contrib import admin

from .models import Banner, Notification, NotificationCampaign


@admin.register(Banner)
class BannerAdmin(admin.ModelAdmin):
    list_display = ("title", "display_order", "is_active", "start_date", "end_date")
    list_filter = ("is_active",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("customer", "notif_type", "title", "is_read", "created_at")
    list_filter = ("notif_type", "is_read")
    search_fields = ("customer__email", "title")
    readonly_fields = [f.name for f in Notification._meta.fields]


@admin.register(NotificationCampaign)
class NotificationCampaignAdmin(admin.ModelAdmin):
    list_display = ("title", "target_type", "channel", "status", "sent_at")
    list_filter = ("status", "target_type", "channel")
