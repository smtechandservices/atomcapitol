import hmac

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import OTP, Customer


class OTPSendError(Exception):
    def __init__(self, message, code="otp_send_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def get_login_customer(email, *, create=False):
    """The customer signing in with `email`, or None if they may not. With `create`, an unknown email becomes a
    new self-registered customer (verified by the OTP, then onboarded through KYC Step 1).

    Revoked access only sticks while the customer still holds a plot (an admin switched them off). One whose plot
    was unassigned or transferred away may sign in again, and starts over as a new customer (restart_as_new_customer).
    """
    customer = Customer.objects.select_related("assigned_plot").filter(email__iexact=email).first()
    if customer is None:
        if not create:
            return None
        try:
            with transaction.atomic():
                customer = Customer.objects.create(email=email.strip().lower(), is_self_registered=True)
        except IntegrityError:  # a parallel request created it first
            customer = Customer.objects.get(email__iexact=email)
    if not customer.is_active and customer.assigned_plot_id is not None:
        return None
    return customer


@transaction.atomic
def restart_as_new_customer(customer):
    """A former buyer whose plot was taken away signed in again: they go through onboarding from scratch."""
    from kyc.services import reset_submission

    customer.is_active = True
    customer.is_self_registered = True
    customer.plot_role = None
    customer.kyc_status = Customer.KYCStatus.NOT_STARTED
    customer.save(update_fields=["is_active", "is_self_registered", "plot_role", "kyc_status", "updated_at"])
    reset_submission(customer)


def send_otp_email(customer, otp):
    send_mail(
        subject="Your Atom Capitol verification code",
        message=(
            f"Hi {customer.get_full_name()},\n\n"
            f"Your one-time verification code is: {otp.code}\n"
            f"It expires in {settings.OTP_EXPIRY_MINUTES} minutes.\n\n"
            "If you did not request this, please ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[customer.email],
        fail_silently=False,
    )


def start_login(customer):
    """Issues a fresh OTP, respecting the resend cooldown."""
    last_otp = customer.otps.order_by("-created_at").first()
    if last_otp:
        seconds_since = (timezone.now() - last_otp.created_at).total_seconds()
        if seconds_since < settings.OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(settings.OTP_RESEND_COOLDOWN_SECONDS - seconds_since)
            raise OTPSendError(f"Please wait {wait}s before requesting another code.", code="cooldown")
    otp = OTP.generate_for(customer)
    send_otp_email(customer, otp)
    return otp


class OTPVerifyError(Exception):
    def __init__(self, message, code="otp_invalid"):
        self.message = message
        self.code = code
        super().__init__(message)


def verify_otp(customer, code):
    # Dev/testing bypass (settings.OTP_BYPASS_CODE is always "" unless DEBUG). Logged so it's never silent.
    if settings.OTP_BYPASS_CODE and hmac.compare_digest(str(code), settings.OTP_BYPASS_CODE):
        from core.models import AuditLog

        AuditLog.record(None, "customer.otp_bypass_login", target=customer, details={"email": customer.email})
        customer.last_login_at = timezone.now()
        customer.save(update_fields=["last_login_at"])
        return None

    otp = customer.otps.order_by("-created_at").first()
    if otp is None:
        raise OTPVerifyError("No verification code found. Please request a new one.", code="no_otp")
    if otp.is_used:
        raise OTPVerifyError("This code has already been used. Please request a new one.", code="used")
    if otp.is_expired():
        raise OTPVerifyError("This code has expired. Please request a new one.", code="expired")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise OTPVerifyError("Too many incorrect attempts. Please request a new code.", code="locked")
    if otp.code != code:
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        remaining = settings.OTP_MAX_ATTEMPTS - otp.attempts
        raise OTPVerifyError(f"Incorrect code. {remaining} attempt(s) remaining.", code="mismatch")

    otp.is_used = True
    otp.save(update_fields=["is_used"])
    customer.last_login_at = timezone.now()
    customer.save(update_fields=["last_login_at"])
    return otp


def next_route_for(customer):
    """Where the app goes after sign-in. Without a plot, KYC Step 1 comes first, then a wait for admin to assign one."""
    if customer.assigned_plot_id is None:
        submission = getattr(customer, "kyc_submission", None)
        return "awaiting_plot" if submission and submission.step1_submitted_at else "kyc_step1"
    return next_route_for_status(customer.kyc_status)


def next_route_for_status(kyc_status):
    return {
        Customer.KYCStatus.NOT_STARTED: "onboarding",
        Customer.KYCStatus.SUBMITTED: "pending",
        Customer.KYCStatus.REJECTED: "rejected",
        Customer.KYCStatus.APPROVED: "home",
    }.get(kyc_status, "onboarding")


def customer_delete_blockers(customer):
    """Reasons this customer can't be deleted. Deleting cascades to payment proofs, KYC, tickets,
    documents (incl. receipts) and change requests, so only records with none of that may go —
    i.e. wrongly created entries. Everyone else should be unassigned or deactivated instead."""
    reasons = []
    if customer.assigned_plot_id:
        reasons.append("assigned to a plot — unassign them first")
    if customer.payment_proofs.exists():
        reasons.append("has submitted payments")
    kyc = getattr(customer, "kyc_submission", None)
    if kyc is not None and (kyc.step1_submitted_at or kyc.step2_status or kyc.step3_status):
        reasons.append("has submitted KYC")
    if customer.tickets.exists():
        reasons.append("has support tickets")
    if customer.documents.exists():
        reasons.append("has documents")
    if customer.change_requests.exists():
        reasons.append("has schedule change requests")
    return reasons

