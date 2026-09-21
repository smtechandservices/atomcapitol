from rest_framework.routers import DefaultRouter

from .views import SalesPersonViewSet

router = DefaultRouter()
router.register("admin/sales-team", SalesPersonViewSet, basename="sales-team")

urlpatterns = router.urls
