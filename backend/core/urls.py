from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.HealthCheckView.as_view(), name="health-check"),
    path("public/settings/", views.PublicSiteSettingsView.as_view(), name="public-settings"),
    path("admin/settings/", views.AdminSiteSettingsView.as_view(), name="admin-settings"),
    path("admin/audit-log/", views.AuditLogListView.as_view(), name="admin-audit-log"),
    path("admin/audit-log/facets/", views.AuditLogFacetsView.as_view(), name="admin-audit-log-facets"),
]
