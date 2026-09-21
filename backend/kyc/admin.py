from django.contrib import admin

from .models import KYCDecisionLog, KYCSubmission


class KYCDecisionLogInline(admin.TabularInline):
    model = KYCDecisionLog
    extra = 0
    readonly_fields = [f.name for f in KYCDecisionLog._meta.fields]
    can_delete = False


@admin.register(KYCSubmission)
class KYCSubmissionAdmin(admin.ModelAdmin):
    list_display = ("customer", "step2_status", "step3_status", "updated_at")
    list_filter = ("step2_status", "step3_status")
    search_fields = ("customer__email",)
    inlines = [KYCDecisionLogInline]
