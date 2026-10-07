from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("sales.urls")),
    path("api/", include("projects.urls")),
    path("api/", include("kyc.urls")),
    path("api/", include("payments.urls")),
    path("api/", include("documents.urls")),
    path("api/", include("tickets.urls")),
    path("api/", include("notifications.urls")),
    # API schema / docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    # Dev-only media serving. Exempt from X-Frame-Options: DENY so the admin portal (another origin)
    # can preview receipts/PDFs inline. In production files come from S3, which sends no such header.
    urlpatterns += [
        re_path(
            rf"^{settings.MEDIA_URL.lstrip('/')}(?P<path>.*)$",
            xframe_options_exempt(serve),
            {"document_root": settings.MEDIA_ROOT},
        )
    ]
