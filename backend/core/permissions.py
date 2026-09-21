from rest_framework.permissions import BasePermission


class IsAdminPortalUser(BasePermission):
    """Any authenticated staff/admin user (Admin Portal), regardless of role."""

    message = "Admin Portal credentials are required for this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "actor_type", None) == "admin")


class HasAdminRole(BasePermission):
    """Restrict to specific AdminUser.role values. Subclass or use `role_required` factory."""

    allowed_roles: tuple = ()
    message = "You do not have the required role for this action."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and getattr(user, "actor_type", None) == "admin"):
            return False
        if not self.allowed_roles:
            return True
        return user.role in self.allowed_roles or user.role == "SUPER_ADMIN"


def role_required(*roles):
    """HasAdminRole('KYC_REVIEWER', 'SUPER_ADMIN') -> permission class."""
    return type("RoleRequired", (HasAdminRole,), {"allowed_roles": roles})


class IsCustomerUser(BasePermission):
    """Any authenticated CustomerApp user, whatever their KYC status."""

    message = "Customer login is required for this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "actor_type", None) == "customer")


class IsKYCApproved(BasePermission):
    """Gates sections 5.1-5.11: only an Approved customer may access plot/payment/document data."""

    message = "Your KYC is not approved yet. This section is locked until admin approval."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and getattr(user, "actor_type", None) == "customer"):
            return False
        return user.kyc_status == "APPROVED"
