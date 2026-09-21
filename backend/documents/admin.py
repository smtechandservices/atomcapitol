from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "doc_type", "status", "customer", "project", "created_at")
    list_filter = ("doc_type", "status")
    search_fields = ("name", "customer__email")
