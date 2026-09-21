import random
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class AdminUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Admin users must have an email address.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", AdminUser.Role.SUPER_ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class AdminUser(AbstractBaseUser, PermissionsMixin):
    """Admin Portal staff account (7.1, 7.18). Logs in with email + password."""

    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        KYC_REVIEWER = "KYC_REVIEWER", "KYC Reviewer"
        ACCOUNTS = "ACCOUNTS", "Accounts"
        SUPPORT = "SUPPORT", "Support"

    actor_type = "admin"

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SUPPORT)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = AdminUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "Admin User"

    def __str__(self):
        return f"{self.email} ({self.role})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    def has_role(self, *roles):
        return self.role in roles or self.role == self.Role.SUPER_ADMIN


class Customer(TimeStampedModel):
    """A plot buyer. Nobody self-registers: a record only exists once admin creates/assigns one (7.4, 7.6)."""

    class KYCStatus(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not started"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    class PlotRole(models.TextChoices):
        PRIMARY = "PRIMARY", "Primary"
        CO_APPLICANT = "CO_APPLICANT", "Co-applicant"

    actor_type = "customer"

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

    assigned_plot = models.ForeignKey(
        "projects.Plot", null=True, blank=True, on_delete=models.SET_NULL, related_name="customers"
    )
    plot_role = models.CharField(max_length=20, choices=PlotRole.choices, null=True, blank=True)

    assigned_sales_person = models.ForeignKey(
        "sales.SalesPerson", null=True, blank=True, on_delete=models.SET_NULL, related_name="customers"
    )

    kyc_status = models.CharField(max_length=20, choices=KYCStatus.choices, default=KYCStatus.NOT_STARTED)

    is_active = models.BooleanField(
        default=True, help_text="Set False when a plot is unassigned/transferred away from this email."
    )

    notify_email = models.BooleanField(default=True)
    notify_push = models.BooleanField(default=True)
    language = models.CharField(max_length=10, default="en")

    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["email"]), models.Index(fields=["kyc_status"])]

    def __str__(self):
        return self.email

    # -- shim so DRF permission checks (request.user.is_authenticated) work for this non-auth model --
    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_full_name(self):
        return self.name or self.email


class OTP(TimeStampedModel):
    """One-time password issued for CustomerApp email login (Step 1)."""

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="otps")
    code = models.CharField(max_length=10)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate_for(cls, customer):
        code = "".join(random.choices(string.digits, k=settings.OTP_LENGTH))
        return cls.objects.create(
            customer=customer,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES),
        )

    def is_valid(self):
        return not self.is_used and self.attempts < settings.OTP_MAX_ATTEMPTS and timezone.now() <= self.expires_at

    def is_expired(self):
        return timezone.now() > self.expires_at
