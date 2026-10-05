from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification, NotificationCampaign


def notify_customer(customer, notif_type, title, body, deep_link=""):
    """Creates an in-app Notification and, if opted in, emails the customer too.
    Called from kyc/payments/documents/tickets services on every trigger event
    listed in the SRS (KYC decisions, payment events, receipts, ticket replies, ...).
    """
    notification = Notification.objects.create(
        customer=customer, notif_type=notif_type, title=title, body=body, deep_link=deep_link
    )
    if customer.notify_email and customer.email:
        send_mail(
            subject=title,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[customer.email],
            fail_silently=True,
        )
    return notification


def _resolve_recipients(campaign):
    from accounts.models import Customer

    if campaign.target_type == NotificationCampaign.TargetType.ALL:
        return Customer.objects.filter(is_active=True)
    if campaign.target_type == NotificationCampaign.TargetType.PROJECT:
        return Customer.objects.filter(is_active=True, assigned_plot__project=campaign.target_project)
    return campaign.target_customers.filter(is_active=True)


def send_campaign(campaign):
    recipients = _resolve_recipients(campaign)
    count = 0
    for customer in recipients:
        notify_customer(customer, "ANNOUNCEMENT", campaign.title, campaign.body)
        count += 1
    campaign.status = NotificationCampaign.CampaignStatus.SENT
    campaign.sent_at = timezone.now()
    campaign.recipient_count = count
    campaign.save(update_fields=["status", "sent_at", "recipient_count"])
    return campaign


def notify_new_banner(banner):
    from accounts.models import Customer

    for customer in Customer.objects.filter(is_active=True, kyc_status="APPROVED"):
        notify_customer(customer, "BANNER", "New on Atom Capitol", banner.title, deep_link=banner.link_target)
