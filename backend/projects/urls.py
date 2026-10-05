from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import CustomerPlotView, PlotViewSet, ProjectViewSet

router = DefaultRouter()
router.register("admin/projects", ProjectViewSet, basename="admin-project")
router.register("admin/plots", PlotViewSet, basename="admin-plot")

urlpatterns = [
    path("customer/plot/", CustomerPlotView.as_view(), name="customer-plot"),
] + router.urls
