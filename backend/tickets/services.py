from notifications.services import notify_customer

from .models import Ticket, TicketMessage


def create_ticket(customer, *, category, subject, description, attachment=None):
    ticket = Ticket.objects.create(customer=customer, category=category, subject=subject, description=description)
    TicketMessage.objects.create(
        ticket=ticket, sender_type=TicketMessage.SenderType.CUSTOMER, sender_customer=customer,
        message=description, attachment=attachment,
    )
    return ticket


def add_customer_reply(ticket, customer, *, message, attachment=None):
    if ticket.status == Ticket.Status.CLOSED:
        raise ValueError("This ticket is closed and read-only.")
    reply = TicketMessage.objects.create(
        ticket=ticket, sender_type=TicketMessage.SenderType.CUSTOMER, sender_customer=customer,
        message=message, attachment=attachment,
    )
    if ticket.status == Ticket.Status.RESOLVED:
        ticket.status = Ticket.Status.OPEN
        ticket.save(update_fields=["status"])
    return reply


def add_admin_reply(ticket, admin_user, *, message, attachment=None):
    reply = TicketMessage.objects.create(
        ticket=ticket, sender_type=TicketMessage.SenderType.ADMIN, sender_admin=admin_user,
        message=message, attachment=attachment,
    )
    if ticket.status == Ticket.Status.OPEN:
        ticket.status = Ticket.Status.IN_PROGRESS
        ticket.save(update_fields=["status"])
    notify_customer(
        ticket.customer, "TICKET_REPLY", f"Reply on ticket #{ticket.id}", message[:200], deep_link=f"ticket:{ticket.id}"
    )
    return reply
