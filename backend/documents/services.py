import io

from django.core.files.base import ContentFile
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from core.models import SiteSettings
from notifications.services import notify_customer

from .models import Document


def _render_receipt_pdf(milestone, proof, amount):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    settings_obj = SiteSettings.load()
    plot = milestone.plot
    customer = proof.submitted_by

    y = height - 60
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, settings_obj.company_name or "Atom Capitol")
    c.setFont("Helvetica", 10)
    y -= 20
    c.drawString(50, y, "Payment Receipt")
    y -= 30

    lines = [
        f"Receipt for: {customer.name or customer.email} ({customer.email})",
        f"Project / Plot: {plot.project.name} / {plot.plot_number}",
        f"Milestone: {milestone.name}",
        f"Amount Paid: {amount}",
        f"Payment Date: {milestone.paid_date}",
        f"Payment Mode: {milestone.payment_mode or '-'}",
        f"Transaction Reference: {milestone.transaction_reference or '-'}",
    ]
    c.setFont("Helvetica", 11)
    for line in lines:
        c.drawString(50, y, line)
        y -= 20

    if settings_obj.receipt_template_note:
        y -= 20
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(50, y, settings_obj.receipt_template_note[:120])

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()


def generate_receipt_document(milestone, proof, amount):
    pdf_bytes = _render_receipt_pdf(milestone, proof, amount)
    filename = f"receipt_{milestone.plot.plot_number}_{milestone.sequence}.pdf"

    document = Document.objects.create(
        customer=proof.submitted_by,
        project=milestone.plot.project,
        milestone=milestone,
        name=f"Receipt - {milestone.name}",
        doc_type=Document.DocType.PAYMENT_RECEIPT,
        status=Document.DocStatus.ISSUED,
    )
    document.file.save(filename, ContentFile(pdf_bytes), save=True)

    notify_customer(
        proof.submitted_by,
        "RECEIPT_ISSUED",
        "Receipt available",
        f"Your receipt for '{milestone.name}' is now available in Documents.",
        deep_link=f"document:{document.id}",
    )
    return document
