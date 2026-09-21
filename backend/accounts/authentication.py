from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Customer


class BaseActorJWTAuthentication(JWTAuthentication):
    """Two actor types (admin/customer) share one API. Each authenticator only claims
    tokens whose 'actor' claim matches it, and silently steps aside otherwise so the
    other authenticator in DEFAULT_AUTHENTICATION_CLASSES gets a turn.
    """

    actor = None

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None
        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        if validated_token.get("actor") != self.actor:
            return None
        return self.get_user(validated_token), validated_token


class AdminJWTAuthentication(BaseActorJWTAuthentication):
    actor = "admin"
    # get_user() falls back to JWTAuthentication's default (AUTH_USER_MODEL = accounts.AdminUser)


class CustomerJWTAuthentication(BaseActorJWTAuthentication):
    actor = "customer"

    def get_user(self, validated_token):
        customer_id = validated_token.get("customer_id")
        if customer_id is None:
            raise exceptions.AuthenticationFailed("Invalid token: missing customer_id claim.")
        try:
            customer = Customer.objects.select_related("assigned_plot", "assigned_sales_person").get(id=customer_id)
        except Customer.DoesNotExist:
            raise exceptions.AuthenticationFailed("Customer not found.")
        if not customer.is_active:
            raise exceptions.AuthenticationFailed("This account no longer has app access. Contact support.")
        return customer


def issue_customer_tokens(customer):
    """Builds a refresh+access token pair carrying actor='customer' + customer_id claims."""
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken()
    refresh["actor"] = "customer"
    refresh["customer_id"] = customer.id
    refresh["email"] = customer.email
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


def issue_admin_tokens(admin_user):
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(admin_user)
    refresh["actor"] = "admin"
    refresh["role"] = admin_user.role
    refresh["email"] = admin_user.email
    return {"refresh": str(refresh), "access": str(refresh.access_token)}
