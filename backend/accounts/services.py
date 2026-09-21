from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import OTP, Customer


class OTPSendError(Exception):
    def __init__(self, message, code="otp_send_error"):
        self.message = message
        self.code = code
        super().__init__(message)


def get_login_eligible_customer(email):
    """Step 1: email must be registered AND assigned to a plot by admin. Returns None otherwise."""
    try:
        customer = Customer.objects.select_related("assigned_plot").get(email__iexact=email)
    except Customer.DoesNotExist:
        return None
    if not customer.is_active or customer.assigned_plot_id is None:
        return None
    return customer


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


def next_route_for_status(kyc_status):
    return {
        Customer.KYCStatus.NOT_STARTED: "onboarding",
        Customer.KYCStatus.SUBMITTED: "pending",
        Customer.KYCStatus.REJECTED: "rejected",
        Customer.KYCStatus.APPROVED: "home",
    }.get(kyc_status, "onboarding")
