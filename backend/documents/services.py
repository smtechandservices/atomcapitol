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
            "bank": "",
            "reference": milestone.transaction_reference or proof.transaction_reference,
            "amount": amount,
        }
    ]


def generate_receipt_document(milestone, proof, amount, entries=None):
    """`entries` lists each payment that makes up the receipt; defaults to the single proof."""
    entries = entries or _proof_entries(milestone, proof, amount)
    pdf_bytes = render_payment_receipt_pdf(milestone.plot, proof.submitted_by, entries)
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
