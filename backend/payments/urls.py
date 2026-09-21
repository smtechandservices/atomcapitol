from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("admin/milestones", views.AdminMilestoneViewSet, basename="admin-milestone")

urlpatterns = [
    # CustomerApp
    path("customer/payments/", views.CustomerPaymentsView.as_view(), name="customer-payments"),
    path("customer/payments/<int:pk>/", views.CustomerMilestoneDetailView.as_view(), name="customer-milestone-detail"),
    path("customer/payments/<int:pk>/pay/", views.CustomerPayMilestoneView.as_view(), name="customer-pay-milestone"),
    path("customer/payments/change-requests/", views.CustomerChangeRequestListCreateView.as_view(), name="customer-change-requests"),
    # Admin
    path("admin/plots/<int:plot_id>/generate-schedule/", views.GenerateMilestoneScheduleView.as_view(), name="admin-generate-schedule"),
    path("admin/payment-verification-queue/", views.PaymentVerificationQueueView.as_view(), name="admin-payment-queue"),
    path("admin/payment-verification-queue/<int:pk>/approve/", views.ApprovePaymentProofView.as_view(), name="admin-payment-approve"),
    path("admin/payment-verification-queue/<int:pk>/reject/", views.RejectPaymentProofView.as_view(), name="admin-payment-reject"),
    path("admin/milestone-change-requests/", views.AdminChangeRequestListView.as_view(), name="admin-change-requests"),
    path("admin/milestone-change-requests/<int:pk>/", views.AdminChangeRequestDetailView.as_view(), name="admin-change-request-detail"),
    path("admin/milestone-change-requests/<int:pk>/approve/", views.ApproveChangeRequestView.as_view(), name="admin-change-request-approve"),
    path("admin/milestone-change-requests/<int:pk>/decline/", views.DeclineChangeRequestView.as_view(), name="admin-change-request-decline"),
    path("admin/milestone-change-requests/<int:pk>/counter/", views.CounterChangeRequestView.as_view(), name="admin-change-request-counter"),
    path("admin/payment-overview/", views.PaymentOverviewView.as_view(), name="admin-payment-overview"),
] + router.urls
