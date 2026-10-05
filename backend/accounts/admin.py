from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AdminUser, Customer, OTP


@admin.register(AdminUser)
class AdminUserAdmin(UserAdmin):
    model = AdminUser
    list_display = ("email", "role", "is_active", "is_staff", "date_joined")
    list_filter = ("role", "is_active")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone")}),
        ("Role & permissions", {"fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "role", "password1", "password2")}),
    )
    readonly_fields = ("date_joined",)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "kyc_status", "assigned_plot", "is_active", "created_at")
    list_filter = ("kyc_status", "is_active")
    search_fields = ("email", "name", "phone")


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ("customer", "code", "is_used", "attempts", "expires_at", "created_at")
    readonly_fields = [f.name for f in OTP._meta.fields]
