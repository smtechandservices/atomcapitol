from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("admin/admin-users", views.AdminUserViewSet, basename="admin-user")
router.register("admin/customers", views.CustomerAdminViewSet, basename="admin-customer")

urlpatterns = [
    # CustomerApp auth
    path("customer/auth/login/", views.CustomerLoginView.as_view(), name="customer-login"),
    path("customer/auth/resend-otp/", views.CustomerResendOTPView.as_view(), name="customer-resend-otp"),
    path("customer/auth/verify-otp/", views.CustomerVerifyOTPView.as_view(), name="customer-verify-otp"),
    # Admin Portal auth
    path("admin/auth/login/", views.AdminLoginView.as_view(), name="admin-login"),
    # shared
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    # CustomerApp profile/settings
    path("customer/profile/", views.CustomerProfileView.as_view(), name="customer-profile"),
    path("customer/profile/request-correction/", views.RequestCorrectionView.as_view(), name="customer-request-correction"),
    path("customer/settings/", views.CustomerSettingsView.as_view(), name="customer-settings"),
    path("customer/sales-contact/", views.CustomerSalesContactView.as_view(), name="customer-sales-contact"),
] + router.urls
