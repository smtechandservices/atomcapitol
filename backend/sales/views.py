from django.db import transaction
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from accounts.models import Customer
from core.models import AuditLog
from core.permissions import role_required

from .models import SalesPerson
from .serializers import SalesPersonSerializer


class SalesPersonViewSet(viewsets.ModelViewSet):
    """7.17 Sales Team: manage sales people + assign one to each customer (bulk reassign)."""

    serializer_class = SalesPersonSerializer
    permission_classes = [role_required("SUPER_ADMIN")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["name", "linked_customers", "created_at"]

    def get_queryset(self):
        return SalesPerson.objects.annotate(linked_customers=Count("customers")).order_by("name")

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "sales_person.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "sales_person.update", target=instance, ip_address=self.request.client_ip)

    @action(detail=True, methods=["post"], url_path="assign-customers")
    def assign_customers(self, request, pk=None):
        """Bulk-reassign this sales person to a list of customer ids."""
        sales_person = self.get_object()
        customer_ids = request.data.get("customer_ids", [])
        if not isinstance(customer_ids, list) or not customer_ids:
            return Response({"detail": "customer_ids must be a non-empty list.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            updated = Customer.objects.filter(id__in=customer_ids).update(assigned_sales_person=sales_person)
        AuditLog.record(
            request.user,
            "sales_person.bulk_assign",
            target=sales_person,
            details={"customer_ids": customer_ids, "updated": updated},
            ip_address=request.client_ip,
        )
        return Response({"detail": f"Assigned to {updated} customer(s).", "updated": updated})

    @action(detail=True, methods=["post"], url_path="unassign-customers")
    def unassign_customers(self, request, pk=None):
        """Remove this sales person from the given customers (only those currently linked to them)."""
        sales_person = self.get_object()
        customer_ids = request.data.get("customer_ids", [])
        if not isinstance(customer_ids, list) or not customer_ids:
            return Response({"detail": "customer_ids must be a non-empty list.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        updated = Customer.objects.filter(id__in=customer_ids, assigned_sales_person=sales_person).update(assigned_sales_person=None)
        AuditLog.record(
            request.user,
            "sales_person.bulk_unassign",
            target=sales_person,
            details={"customer_ids": customer_ids, "updated": updated},
            ip_address=request.client_ip,
        )
        return Response({"detail": f"Removed from {updated} customer(s).", "updated": updated})

    @action(detail=True, methods=["post"], url_path="move-customers")
    def move_customers(self, request, pk=None):
        """Hand every customer of this sales person over to another one (e.g. when someone leaves)."""
        sales_person = self.get_object()
        target = SalesPerson.objects.filter(pk=request.data.get("to_sales_person")).exclude(pk=sales_person.pk).first()
        if not target:
            return Response({"detail": "Choose a different sales person to move the customers to.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        updated = Customer.objects.filter(assigned_sales_person=sales_person).update(assigned_sales_person=target)
        AuditLog.record(
            request.user,
            "sales_person.move_customers",
            target=sales_person,
            details={"to": target.id, "moved": updated},
            ip_address=request.client_ip,
        )
        return Response({"detail": f"Moved {updated} customer(s) to {target.name}.", "updated": updated})

    def perform_destroy(self, instance):
        # Customer.assigned_sales_person is SET_NULL, so linked customers simply lose their contact.
        AuditLog.record(
            self.request.user,
            "sales_person.delete",
            target=instance,
            details={"name": instance.name, "unlinked_customers": instance.customers.count()},
            ip_address=self.request.client_ip,
        )
        instance.delete()
