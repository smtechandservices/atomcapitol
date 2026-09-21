from django.contrib import admin

from .models import Ticket, TicketMessage


class TicketMessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "customer", "category", "status", "assigned_to", "created_at")
    list_filter = ("status", "category")
    search_fields = ("subject", "customer__email")
    inlines = [TicketMessageInline]
