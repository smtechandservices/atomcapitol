from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("admin/documents", views.AdminDocumentViewSet, basename="admin-document")

urlpatterns = [
    path("customer/documents/", views.CustomerDocumentListView.as_view(), name="customer-documents"),
    path("customer/documents/<int:pk>/", views.CustomerDocumentDetailView.as_view(), name="customer-document-detail"),
] + router.urls
