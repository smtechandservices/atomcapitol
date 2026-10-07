from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Customer
from core.models import AuditLog
from core.permissions import IsKYCApproved, role_required

from . import services
from .models import Plot, Project, ProjectImage
from .serializers import (
    CustomerPlotDetailSerializer,
    PlotAssignmentHistorySerializer,
    PlotAssignSerializer,
    PlotSerializer,
    PlotTransferSerializer,
    PlotUnassignSerializer,
    ProjectImageSerializer,
    ProjectSerializer,
)


# ---------------------------------------------------------------------------
# Admin — 7.3 Projects
# ---------------------------------------------------------------------------
class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.prefetch_related("images").all()
    serializer_class = ProjectSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["development_status", "is_published"]
    search_fields = ["name", "location"]

    def get_permissions(self):
        if self.action in ("destroy", "delete_check"):
            return [role_required("SUPER_ADMIN")()]
        return super().get_permissions()

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "project.create", target=instance, ip_address=self.request.client_ip)

    @action(detail=True, methods=["get"], url_path="delete-check")
    def delete_check(self, request, pk=None):
        return Response(services.project_delete_summary(self.get_object()))

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        summary = services.project_delete_summary(project)
        if not summary["can_delete"]:
            return Response(
                {"detail": f"{summary['blocked_count']} plot(s) still have buyers or payment history — this project can't be deleted.", "errors": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        AuditLog.record(
            request.user, "project.delete", target=project,
            details={"name": project.name, **summary["will_delete"]}, ip_address=request.client_ip,
        )
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "project.update", target=instance, ip_address=self.request.client_ip)

    @action(detail=True, methods=["post"], url_path="images")
    def add_image(self, request, pk=None):
        project = self.get_object()
        serializer = ProjectImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project=project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path="images/(?P<image_id>[^/.]+)")
    def delete_image(self, request, pk=None, image_id=None):
        ProjectImage.objects.filter(project_id=pk, id=image_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        project = self.get_object()
        project.is_published = True
        project.save(update_fields=["is_published"])
        return Response(self.get_serializer(project).data)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, pk=None):
        project = self.get_object()
        project.is_published = False
        project.save(update_fields=["is_published"])
        return Response(self.get_serializer(project).data)


# ---------------------------------------------------------------------------
# Admin — 7.4 Plot Inventory
# ---------------------------------------------------------------------------
class PlotViewSet(viewsets.ModelViewSet):
    queryset = Plot.objects.select_related("project").prefetch_related("customers").all()
    serializer_class = PlotSerializer
    permission_classes = [role_required("SUPER_ADMIN", "ACCOUNTS")]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["project", "status"]
    search_fields = ["plot_number", "block_sector"]

    def get_permissions(self):
        # Accounts manage inventory (create, import, assign) but editing/deleting a plot is super admin only.
        if self.action in ("update", "partial_update", "destroy", "delete_check"):
            return [role_required("SUPER_ADMIN")()]
        return super().get_permissions()

    @action(detail=True, methods=["get"], url_path="delete-check")
    def delete_check(self, request, pk=None):
        reasons = services.plot_delete_blockers(self.get_object())
        return Response({"can_delete": not reasons, "reasons": reasons})

    def destroy(self, request, *args, **kwargs):
        plot = self.get_object()
        reasons = services.plot_delete_blockers(plot)
        if reasons:
            return Response({"detail": f"Plot {plot.plot_number} can't be deleted: {'; '.join(reasons)}.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.record(
            request.user, "plot.delete", target=plot,
            details={"plot_number": plot.plot_number, "project": plot.project.name, "milestones": plot.milestones.count()},
            ip_address=request.client_ip,
        )
        plot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.record(self.request.user, "plot.create", target=instance, ip_address=self.request.client_ip)

    def perform_update(self, serializer):
        before = {f: str(getattr(serializer.instance, f)) for f in serializer.validated_data}
        instance = serializer.save()
        AuditLog.record(
            self.request.user,
            "plot.update",
            target=instance,
            details={f: {"from": before[f], "to": str(getattr(instance, f))} for f in before if before[f] != str(getattr(instance, f))},
            ip_address=self.request.client_ip,
        )

    @action(detail=False, methods=["post"], url_path="bulk-import", parser_classes=[MultiPartParser])
    def bulk_import(self, request):
        project_id = request.data.get("project")
        file_obj = request.data.get("file")
        if not project_id or not file_obj:
            return Response({"detail": "project and file are required.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects.filter(id=project_id).first()
        if not project:
            return Response({"detail": "Project not found.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)
        created, errors = services.bulk_import_plots_csv(project, file_obj)
        AuditLog.record(
            request.user, "plot.bulk_import", target=project,
            details={"created": created, "errors": errors}, ip_address=request.client_ip,
        )
        return Response({"created": created, "errors": errors})

    @action(detail=False, methods=["post"], url_path="bulk-assign", parser_classes=[MultiPartParser])
    def bulk_assign(self, request):
        file_obj = request.data.get("file")
        if not file_obj:
            return Response({"detail": "file is required.", "errors": {}}, status=status.HTTP_400_BAD_REQUEST)
        assigned, errors = services.bulk_assign_csv(file_obj, performed_by=request.user)
        return Response({"assigned": assigned, "errors": errors})

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        plot = self.get_object()
        serializer = PlotAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            customer = services.assign_plot(
                plot,
                data["email"],
                role=data.get("role", "PRIMARY"),
                name=data.get("name", ""),
                phone=data.get("phone", ""),
                commercial_position=serializer.get_commercial_position(),
                performed_by=request.user,
            )
        except services.AssignmentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.record(request.user, "plot.assign", target=plot, details={"email": data["email"]}, ip_address=request.client_ip)
        plot = self.get_queryset().get(pk=plot.pk)  # drop the stale pre-assignment `customers` prefetch cache
        return Response(PlotSerializer(plot).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unassign")
    def unassign(self, request, pk=None):
        plot = self.get_object()
        serializer = PlotUnassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = Customer.objects.filter(id=serializer.validated_data["customer_id"], assigned_plot=plot).first()
        if not customer:
            return Response({"detail": "Customer not found on this plot.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)
        services.unassign_plot(plot, customer, reason=serializer.validated_data["reason"], performed_by=request.user)
        AuditLog.record(request.user, "plot.unassign", target=plot, details={"email": customer.email}, ip_address=request.client_ip)
        return Response({"detail": "Unassigned. That email no longer has app access."})

    @action(detail=True, methods=["post"], url_path="transfer")
    def transfer(self, request, pk=None):
        plot = self.get_object()
        serializer = PlotTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer = Customer.objects.filter(id=data["customer_id"], assigned_plot=plot).first()
        if not customer:
            return Response({"detail": "Customer not found on this plot.", "errors": {}}, status=status.HTTP_404_NOT_FOUND)
        try:
            new_customer = services.transfer_plot(
                plot, customer, data["new_email"], reason=data["reason"], performed_by=request.user
            )
        except services.AssignmentError as exc:
            return Response({"detail": exc.message, "errors": {"code": exc.code}}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.record(
            request.user, "plot.transfer", target=plot,
            details={"from": customer.email, "to": data["new_email"]}, ip_address=request.client_ip,
        )
        plot = self.get_queryset().get(pk=plot.pk)  # drop the stale pre-transfer `customers` prefetch cache
        return Response(PlotSerializer(plot).data)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        plot = self.get_object()
        return Response(PlotAssignmentHistorySerializer(plot.assignment_history.all(), many=True).data)


# ---------------------------------------------------------------------------
# CustomerApp — 5.2 Township & Plot Details (post-approval)
# ---------------------------------------------------------------------------
class CustomerPlotView(generics.RetrieveAPIView):
    serializer_class = CustomerPlotDetailSerializer
    permission_classes = [IsKYCApproved]

    def get_object(self):
        plot = self.request.user.assigned_plot
        if plot is None:
            from rest_framework.exceptions import NotFound

            raise NotFound("No plot assigned.")
        return plot
