from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Customer
from core.models import AuditLog
from core.permissions import role_required

from .models import SalesPerson
from .serializers import SalesPersonSerializer


class SalesPersonViewSet(viewsets.ModelViewSet):
    """7.17 Sales Team: manage sales people + assign one to each customer (bulk reassign)."""

    queryset = SalesPerson.objects.all()
    serializer_class = SalesPersonSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]

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
        return Response({"detail": f"Assigned to {updated} customer(s)."})
