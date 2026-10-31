from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import models

from core.models import TimeStampedModel
from core.validators import validate_document_file, validate_image_file


class Project(TimeStampedModel):
    """7.3 Projects — a township/project record."""

    class DevelopmentStatus(models.TextChoices):
        PLANNING = "PLANNING", "Planning"
        UNDER_CONSTRUCTION = "UNDER_CONSTRUCTION", "Under construction"
        READY = "READY", "Ready"
        COMPLETED = "COMPLETED", "Completed"

    name = models.CharField(max_length=200, unique=True)
    location = models.CharField(max_length=300, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    description = models.TextField(blank=True)
    amenities = models.JSONField(default=list, blank=True, help_text='e.g. ["Clubhouse", "24x7 security"]')
    brochure = models.FileField(upload_to="projects/brochures/", null=True, blank=True, validators=[validate_document_file])
    development_status = models.CharField(
        max_length=30, choices=DevelopmentStatus.choices, default=DevelopmentStatus.PLANNING
    )
    phases = models.JSONField(default=list, blank=True, help_text='Phase names buyers pick in KYC, e.g. ["Phase 1", "Phase 2"]')
    # Shown to buyers for their knowledge; collected outside the plot price. Free text, e.g. "₹25,000 + GST".
    legal_fee = models.CharField(max_length=200, blank=True)
    registry_charges = models.CharField(max_length=200, blank=True)
    development_charges = models.CharField(max_length=200, blank=True)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProjectImage(TimeStampedModel):
    """Layout/site images + gallery for 5.2 Township & Plot Details."""

    class ImageType(models.TextChoices):
        LAYOUT = "LAYOUT", "Layout / site plan"
        GALLERY = "GALLERY", "Gallery"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="projects/images/", validators=[validate_image_file])
    image_type = models.CharField(max_length=20, choices=ImageType.choices, default=ImageType.GALLERY)
    caption = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class Plot(TimeStampedModel):
    """7.4 Plot Inventory. Commercial position captured at assignment drives the milestone plan."""

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BOOKED = "BOOKED", "Booked"
        SOLD = "SOLD", "Sold"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="plots")
    plot_number = models.CharField(max_length=50)
    size = models.CharField(max_length=50, help_text="Area in sq. yd, e.g. 200")
    # Also the plot's block / sector: one field, shown to buyers and picked in KYC Step 1.
    phase = models.CharField(max_length=100, blank=True)
    rate_per_sq_yd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    plc_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, help_text="Preferential Location Charge, % of base price"
    )
    plc_type = models.CharField(max_length=100, blank=True, help_text="e.g. Corner, Park facing")
    price = models.DecimalField(
        max_digits=14, decimal_places=2, help_text="Total list price = size x rate x (1 + PLC%), unless set by hand"
    )
    # Admin typed the list price instead of letting size x rate x PLC derive it.
    price_is_manual = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    booking_date = models.DateField(null=True, blank=True)

    # Commercial position captured at assignment time — feeds milestone generation.
    total_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    amount_paid_outside_app = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    instalment_count = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["project__name", "plot_number"]
        unique_together = [("project", "plot_number")]

    def __str__(self):
        return f"{self.project.name} / {self.plot_number}"

    @staticmethod
    def parse_area(size):
        try:
            area = Decimal(str(size).strip())
        except InvalidOperation:
            return None
        return area if area.is_finite() and area > 0 else None

    @staticmethod
    def compute_price(area, rate, plc_percent):
        total = area * rate * (1 + (plc_percent or 0) / Decimal(100))
        return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def save(self, *args, **kwargs):
        # Plots priced per sq. yd derive their total; legacy plots and hand-set prices keep theirs.
        area = self.parse_area(self.size)
        if not self.price_is_manual and self.rate_per_sq_yd is not None and area is not None:
            self.price = self.compute_price(area, self.rate_per_sq_yd, self.plc_percent)
        super().save(*args, **kwargs)

    @property
    def remaining_balance(self):
        if self.total_value is None:
            return None
        return self.total_value - (self.amount_paid_outside_app or 0)


class PlotAssignmentHistory(TimeStampedModel):
    """Audit trail of assign/unassign/transfer actions on a plot (7.4)."""

    class Action(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        UNASSIGNED = "UNASSIGNED", "Unassigned"
        TRANSFERRED = "TRANSFERRED", "Transferred"

    plot = models.ForeignKey(Plot, on_delete=models.CASCADE, related_name="assignment_history")
    action = models.CharField(max_length=20, choices=Action.choices)
    from_email = models.EmailField(blank=True)
    to_email = models.EmailField(blank=True)
    reason = models.TextField(blank=True)
    performed_by = models.ForeignKey("accounts.AdminUser", null=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-created_at"]
