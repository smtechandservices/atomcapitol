import io
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.core.files.base import ContentFile
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from core.models import SiteSettings
from notifications.services import notify_customer

from .models import Document

ASSETS = Path(__file__).resolve().parent / "assets"
PAGE_W, PAGE_H = A4
LEFT = 70
VALUE_X = 180
TABLE_W = 345
TABLE_LABEL_W = 105
ROW_H = 20
# Below this the letterhead footer and the signature block need the space.
CONTENT_BOTTOM = 120


def _inr(amount):
    """Indian digit grouping, e.g. 101000 -> '1,01,000/-'."""
    amount = Decimal(amount).quantize(Decimal("0.01"))
    whole, paise = divmod(amount, 1)
    digits = str(int(whole))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        digits = ",".join(([head] if head else []) + groups + [tail])
    return f"{digits}.{int(paise * 100):02d}/-" if paise else f"{digits}/-"


def _ddmmyyyy(value):
    if isinstance(value, str):
        value = date.fromisoformat(value)
    return value.strftime("%d.%m.%Y") if value else "-"


def _area(size):
    try:
        Decimal(str(size).strip())
    except ArithmeticError:
        return size
    return f"{size} Sq. Yard"


class _ReceiptCanvas:
    def __init__(self):
        self.buffer = io.BytesIO()
        self.c = canvas.Canvas(self.buffer, pagesize=A4)
        self.page = 0
        self.letterhead = ImageReader(str(ASSETS / "letterhead.png"))
        self.stamp = ImageReader(str(ASSETS / "stamp.png"))
        self.new_page()

    def new_page(self):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.c.drawImage(self.letterhead, 0, 0, width=PAGE_W, height=PAGE_H)
        self.c.setFont("Helvetica", 9)
        self.c.setFillGray(0.4)
        self.c.drawRightString(PAGE_W - 75, 82, f"{self.page} | Page")
        self.c.setFillGray(0)
        self.y = PAGE_H - 130

    def title(self, text):
        c = self.c
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(PAGE_W / 2, self.y, text)
        half = c.stringWidth(text, "Helvetica-Bold", 12) / 2
        c.setLineWidth(0.8)
        c.line(PAGE_W / 2 - half, self.y - 2, PAGE_W / 2 + half, self.y - 2)
        self.y -= 45

    def details(self, rows):
        c = self.c
        for label, value in rows:
            c.setFont("Helvetica", 11)
            c.drawString(LEFT, self.y, label)
            c.drawString(VALUE_X, self.y, f": {value}")
            self.y -= 20
        self.y -= 15

    def entry_table(self, entry):
        rows = [
            ("Payment By", entry.get("payment_by") or "-"),
            ("Payment date", _ddmmyyyy(entry.get("payment_date"))),
            ("Bank", entry.get("bank") or "-"),
            ("Chq./Ref.No.", entry.get("reference") or "-"),
            ("Amount", _inr(entry["amount"])),
        ]
        height = ROW_H * len(rows)
        if self.y - height < CONTENT_BOTTOM:
            self.new_page()
        c = self.c
        top = self.y
        c.setLineWidth(0.8)
        c.rect(LEFT, top - height, TABLE_W, height)
        c.line(LEFT + TABLE_LABEL_W, top, LEFT + TABLE_LABEL_W, top - height)
        for i, (label, value) in enumerate(rows):
            row_top = top - i * ROW_H
            if i:
                c.line(LEFT, row_top, LEFT + TABLE_W, row_top)
            c.setFont("Helvetica", 10.5)
            c.drawString(LEFT + 8, row_top - 14, label)
            c.drawString(LEFT + TABLE_LABEL_W + 6, row_top - 14, str(value))
        self.y = top - height - 15

    def signature(self, note=""):
        if self.y - 120 < 105:
            self.new_page()
        c = self.c
        self.y -= 15
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(LEFT + 5, self.y, "Authority Signature")
        c.drawImage(self.stamp, LEFT, self.y - 100, width=90, height=86, mask="auto")
        if note:
            c.setFont("Helvetica-Oblique", 8)
            c.setFillGray(0.4)
            c.drawString(LEFT, self.y - 115, note[:120])
            c.setFillGray(0)

    def terms(self, text, *, own_page=True):
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return
        if own_page:
            self.new_page()
        c = self.c
        self.y = PAGE_H - 160
        c.setFont("Helvetica-Bold", 12)
        c.drawString(LEFT - 10, self.y, "Terms and Conditions")
        self.y -= 25
        c.setFont("Helvetica", 9.5)
        for line in lines:
            for wrapped in _wrap(line, "Helvetica", 9.5, PAGE_W - 2 * LEFT):
                if self.y < 120:
                    self.new_page()
                    c.setFont("Helvetica", 9.5)
                c.drawString(LEFT - 5, self.y, wrapped)
                self.y -= 14
            self.y -= 3

    def finish(self):
        self.c.showPage()
        self.c.save()
        return self.buffer.getvalue()


def _wrap(text, font, size, width):
    from reportlab.pdfbase.pdfmetrics import stringWidth

    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = f"   {word}"
    if current:
        lines.append(current)
    return lines


def render_payment_receipt_pdf(plot, customer, entries, *, receipt_date=None):
    """Payment receipt on the company letterhead: plot details, one table per payment
    entry ({payment_by, payment_date, bank, reference, amount}), stamp, then T&C."""
    settings_obj = SiteSettings.load()
    total = sum(Decimal(e["amount"]) for e in entries)
    pdf = _ReceiptCanvas()
    pdf.title("PAYMENT RECEIPT")
    pdf.details(
        [
            ("Date", _ddmmyyyy(receipt_date or date.today())),
            ("Customer Name", customer.name or customer.email),
            ("Project Name", plot.project.name),
            ("Plot No.", plot.plot_number),
            ("Total Area", _area(plot.size)),
            ("Plot Address", plot.project.location or "-"),
            ("Amount (Rs.)", _inr(total)),
        ]
    )
    for entry in entries:
        pdf.entry_table(entry)
    pdf.signature(settings_obj.receipt_template_note)
    pdf.terms(settings_obj.receipt_terms)
    return pdf.finish()


def render_terms_pdf(text):
    """The receipt T&C on their own, on the letterhead (for the admin T&C page)."""
    pdf = _ReceiptCanvas()
    pdf.terms(text, own_page=False)
    return pdf.finish()


def _proof_entries(milestone, proof, amount):
    return [
        {
            "payment_by": proof.payment_mode or milestone.payment_mode,
            "payment_date": milestone.paid_date or proof.payment_date,
            "bank": milestone.bank,
            "reference": milestone.transaction_reference or proof.transaction_reference,
            "amount": amount,
        }
    ]


def generate_receipt_document(milestone, proof, amount, entries=None, *, customer=None):
    """`entries` lists each payment that makes up the receipt; defaults to the single proof.
    `customer` defaults to whoever submitted the proof (needed when there is no proof)."""
    customer = customer or proof.submitted_by
    entries = entries or _proof_entries(milestone, proof, amount)
    pdf_bytes = render_payment_receipt_pdf(milestone.plot, customer, entries)
    filename = f"receipt_{milestone.plot.plot_number}_{milestone.sequence}.pdf"

    document = Document.objects.create(
        customer=customer,
        project=milestone.plot.project,
        milestone=milestone,
        name=f"Receipt - {milestone.name}",
        doc_type=Document.DocType.PAYMENT_RECEIPT,
        status=Document.DocStatus.ISSUED,
    )
    document.file.save(filename, ContentFile(pdf_bytes), save=True)

    notify_customer(
        customer,
        "RECEIPT_ISSUED",
        "Receipt available",
        f"Your receipt for '{milestone.name}' is now available in Documents.",
        deep_link=f"document:{document.id}",
    )
    return document


# Share of total_value a buyer must have paid before their allotment letter is issued.
ALLOTMENT_THRESHOLD = Decimal("0.5")


def render_allotment_letter_pdf(plot, customer, *, paid, letter_date=None):
    settings_obj = SiteSettings.load()
    pdf = _ReceiptCanvas()
    pdf.title("ALLOTMENT LETTER")
    pdf.details(
        [
            ("Date", _ddmmyyyy(letter_date or date.today())),
            ("Allottee", customer.name or customer.email),
            ("Project Name", plot.project.name),
            ("Plot No.", plot.plot_number),
            ("Total Area", _area(plot.size)),
            ("Plot Address", plot.project.location or "-"),
            ("Sale Consideration", _inr(plot.total_value)),
            ("Amount Received", _inr(paid)),
        ]
    )
    body = (
        f"We are pleased to confirm the allotment of Plot No. {plot.plot_number} in {plot.project.name} to "
        f"{customer.name or customer.email}, against the payments received so far. The balance sale consideration "
        f"is payable as per the agreed payment schedule. Registry charges, legal fees and development charges are "
        f"additional and payable as applicable."
    )
    c = pdf.c
    c.setFont("Helvetica", 10.5)
    for line in _wrap(body, "Helvetica", 10.5, PAGE_W - 2 * LEFT):
        c.drawString(LEFT, pdf.y, line.strip())
        pdf.y -= 15
    pdf.y -= 10
    pdf.signature(settings_obj.receipt_template_note)
    pdf.terms(settings_obj.receipt_terms)
    return pdf.finish()


def allotment_letter_for(customer, plot):
    return customer.documents.filter(doc_type=Document.DocType.ALLOTMENT_LETTER, project=plot.project).order_by("-created_at").first()


def issue_allotment_letter(plot, customer, *, paid, issued_by=None):
    """Puts the buyer's allotment letter in their Documents and notifies them. An existing letter for the plot's
    project is re-rendered with today's figures and shown again (if it was hidden) instead of adding a second one."""
    document = allotment_letter_for(customer, plot)
    if document is None:
        document = Document(
            customer=customer,
            project=plot.project,
            name=f"Allotment Letter - Plot {plot.plot_number}",
            doc_type=Document.DocType.ALLOTMENT_LETTER,
        )
    if issued_by is not None:
        document.uploaded_by = issued_by
    document.status = Document.DocStatus.ISSUED
    document.is_visible_to_customer = True
    pdf_bytes = render_allotment_letter_pdf(plot, customer, paid=paid)
    document.file.save(f"allotment_letter_{plot.plot_number}_{customer.id}.pdf", ContentFile(pdf_bytes), save=True)
    notify_customer(
        customer,
        "DOCUMENT_UPLOADED",
        "Your allotment letter is ready",
        f"Your allotment letter for plot {plot.plot_number} is now available in Documents.",
        deep_link=f"document:{document.id}",
    )
    return document


def issue_allotment_letter_if_due(plot):
    """Issues the allotment letter to each buyer on the plot (primary and co-applicants) once at least half of
    total_value is paid. Each buyer gets it once; later payments don't re-issue it."""
    from payments.services import plot_paid_total

    if not plot or not plot.total_value:
        return []
    paid = plot_paid_total(plot)
    if paid < plot.total_value * ALLOTMENT_THRESHOLD:
        return []
    return [
        issue_allotment_letter(plot, customer, paid=paid)
        for customer in plot.customers.filter(is_active=True)
        if allotment_letter_for(customer, plot) is None
    ]
