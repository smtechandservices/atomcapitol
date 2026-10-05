from django.urls import path

from . import views

urlpatterns = [
    # CustomerApp
    path("customer/tickets/", views.CustomerTicketListCreateView.as_view(), name="customer-tickets"),
    path("customer/tickets/<int:pk>/", views.CustomerTicketDetailView.as_view(), name="customer-ticket-detail"),
    path("customer/tickets/<int:pk>/reply/", views.CustomerTicketReplyView.as_view(), name="customer-ticket-reply"),
    # Admin
    path("admin/tickets/", views.AdminTicketListView.as_view(), name="admin-tickets"),
    path("admin/tickets/<int:pk>/", views.AdminTicketDetailView.as_view(), name="admin-ticket-detail"),
    path("admin/tickets/<int:pk>/reply/", views.AdminTicketReplyView.as_view(), name="admin-ticket-reply"),
    path("admin/tickets/<int:pk>/assign/", views.AdminTicketAssignView.as_view(), name="admin-ticket-assign"),
    path("admin/tickets/<int:pk>/status/", views.AdminTicketStatusView.as_view(), name="admin-ticket-status"),
]
