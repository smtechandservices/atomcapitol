from django.contrib import admin

from .models import Milestone, MilestoneChangeRequest, PaymentProof


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display = ("plot", "sequence", "name", "amount", "due_date", "status")
    list_filter = ("status",)
    search_fields = ("plot__plot_number", "name")


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    list_display = ("milestone", "submitted_by", "claimed_amount", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("submitted_by__email",)


@admin.register(MilestoneChangeRequest)
class MilestoneChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("plot", "requested_by", "change_type", "status", "created_at")
    list_filter = ("status", "change_type")
