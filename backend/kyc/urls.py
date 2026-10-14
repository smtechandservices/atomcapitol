from django.urls import path

from . import views

urlpatterns = [
    # CustomerApp onboarding
    path("customer/kyc/plot-check/", views.KYCPlotCheckView.as_view(), name="kyc-plot-check"),
    path("customer/kyc/step2/", views.KYCStep2View.as_view(), name="kyc-step2"),
    path("customer/kyc/step3/", views.KYCStep3View.as_view(), name="kyc-step3"),
    path("customer/kyc/status/", views.KYCStatusView.as_view(), name="kyc-status"),
    # Admin review queue
    path("admin/kyc-queue/", views.KYCQueueListView.as_view(), name="admin-kyc-queue"),
    path("admin/kyc-queue/stats/", views.KYCQueueStatsView.as_view(), name="admin-kyc-queue-stats"),
    path("admin/kyc-queue/<int:pk>/", views.KYCQueueDetailView.as_view(), name="admin-kyc-queue-detail"),
    path("admin/kyc-queue/<int:pk>/decide/", views.KYCDecideView.as_view(), name="admin-kyc-decide"),
]
