"""Fills the review queues (KYC, payment verification, change requests) for the SAMPLE customers.

    python manage.py seed_sample_activity --dry-run   # show what would be created
    python manage.py seed_sample_activity             # create it

These records are normally created by customers in the app, which the admin API can't do.
Safety:
- only touches customers whose email ends with @example.com (the sample buyers) — real customers are never used;
- calls the same services the app uses (submit_step2/submit_step3/submit_payment_proof), none of which notify,
  so no email or push goes out;
- idempotent: skips anyone who already has a submission/proof/request.
"""

import io
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from dateutil.relativedelta import relativedelta
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas

from accounts.models import Customer
from kyc import services as kyc_services
from kyc.models import KYCSubmission
from payments import services as pay_services
from payments.models import Milestone, MilestoneChangeRequest, PaymentProof

SAMPLE_DOMAIN = "@example.com"
VIDEO = Path(__file__).parent / "assets" / "sample_kyc_video.mp4"


def receipt_pdf(*, bank, payer, amount, paid_on, mode, reference, payee="Atom Capitol Developers Pvt Ltd"):
    """A plain bank-transfer acknowledgement, the kind customers upload as proof."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    w, h = A5
    c.setFont("Helvetica-Bold", 15)
    c.drawString(36, h - 50, bank)
    c.setFont("Helvetica", 10)
    c.drawString(36, h - 66, "Fund transfer acknowledgement")
    c.line(36, h - 76, w - 36, h - 76)
    rows = [
        ("Transaction status", "Successful"),
        ("Reference no.", reference),
        ("Date", paid_on.strftime("%d %b %Y")),
        ("Mode", mode),
        ("From", payer),
        ("To", payee),
        ("Amount", f"INR {amount:,.2f}"),
    ]
    y = h - 100
    for label, value in rows:
        c.setFont("Helvetica", 10)
        c.drawString(36, y, label)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(170, y, str(value))
        y -= 22
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(36, 40, "Sample document generated for testing — not a real transaction.")
    c.save()
    return buf.getvalue()


# (email, step2 receipt?, video?, plot confirmed?, mismatch note)
KYC_PLAN = [
    ("simran.bedi@example.com", True, True, True, ""),
    ("ananya.joshi@example.com", True, True, True, ""),
    ("karthik.rao@example.com", True, False, False, "Plot size in the app shows 2400 sq.ft but my allotment letter says 2500 sq.ft."),
    ("kunal.deshpande@example.com", True, False, True, ""),
    ("meera.iyer@example.com", True, True, True, ""),
]

# (email, bank, mode, reference, days_ago, claimed delta vs milestone amount)
PROOF_PLAN = [
    ("aarav.malhotra@example.com", "HDFC Bank", "NEFT", "N281260845517203", 1, Decimal("0")),
    ("rohan.kapoor@example.com", "ICICI Bank", "RTGS", "ICICR52026100604412", 2, Decimal("0")),
    ("vikram.sethi@example.com", "Axis Bank", "IMPS", "628104773195", 0, Decimal("-25000")),
    ("pooja.kulkarni@example.com", "State Bank of India", "UPI", "UPI/427915806342/SBIN", 3, Decimal("0")),
    ("sneha.reddy@example.com", "Kotak Mahindra Bank", "NEFT", "KKBKH26100811294", 1, Decimal("0")),
]

# (email, change_type, details builder(schedule) -> dict, reason)
CHANGE_PLAN = [
    (
        "siddharth.joshi@example.com",
        MilestoneChangeRequest.ChangeType.CHANGE_DATE,
        lambda ms: {"milestone_sequence": ms[2].sequence, "new_due_date": (ms[2].due_date + timedelta(days=21)).isoformat()},
        "My annual bonus is credited in the third week of the month — could this instalment move by three weeks?",
    ),
    (
        "rohan.kapoor@example.com",
        MilestoneChangeRequest.ChangeType.CHANGE_INSTALMENTS,
        lambda ms: {"new_instalment_count": len(ms) + 4},
        "Home loan disbursement is delayed; spreading the balance over a few more months would help.",
    ),
    (
        "sneha.reddy@example.com",
        MilestoneChangeRequest.ChangeType.PAY_MORE,
        lambda ms: {"amount": str((ms[1].amount * 2).quantize(Decimal("1")))},
        "Received maturity proceeds from an FD and would like to prepay part of the balance.",
    ),
]


class Command(BaseCommand):
    help = "Create sample KYC submissions, payment proofs and change requests for @example.com customers."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print the plan without writing anything.")

    def handle(self, *args, dry_run=False, **options):
        sample = {c.email: c for c in Customer.objects.filter(email__endswith=SAMPLE_DOMAIN).select_related("assigned_plot")}
        if not sample:
            raise CommandError("No @example.com sample customers found — nothing to do.")
        # Dry run only prints the plan: rolling back a transaction wouldn't undo files already uploaded to storage.
        self.dry_run = dry_run
        with transaction.atomic():
            self._kyc(sample)
            self._proofs(sample)
            self._change_requests(sample)
        self.stdout.write(self.style.SUCCESS("Dry run — nothing saved." if dry_run else "Done."))

    def _say(self, msg):
        self.stdout.write(("[dry-run] " if self.dry_run else "") + msg)

    def _kyc(self, sample):
        for email, receipt, video, confirmed, note in KYC_PLAN:
            c = sample.get(email)
            if not c or not c.assigned_plot_id:
                continue
            sub = KYCSubmission.objects.filter(customer=c).first()
            if sub and (sub.step2_status or sub.step3_status):
                self._say(f"KYC: {email} already submitted — skipped")
                continue
            label = f"KYC: {c.name} — receipt{' + video' if video else ''}{' (plot mismatch flagged)' if not confirmed else ''}"
            if self.dry_run:
                self._say(label)
                continue
            plot = c.assigned_plot
            paid_on = date.today() - timedelta(days=12)
            amount = (plot.amount_paid_outside_app or plot.price * Decimal("0.1")).quantize(Decimal("1"))
            if receipt:
                pdf = receipt_pdf(
                    bank="HDFC Bank", payer=c.name, amount=amount, paid_on=paid_on, mode="NEFT",
                    reference=f"N{plot.id:04d}{c.id:05d}2026",
                )
                kyc_services.submit_step2(
                    c,
                    plot_confirmed=confirmed,
                    plot_mismatch_note=note,
                    receipt_file=ContentFile(pdf, name=f"booking-receipt-{plot.plot_number}.pdf"),
                    receipt_amount=amount,
                    receipt_payment_date=paid_on,
                )
            if video:
                kyc_services.submit_step3(c, video_file=ContentFile(VIDEO.read_bytes(), name="kyc-video.mp4"))
            self._say(label)

    def _proofs(self, sample):
        for email, bank, mode, reference, days_ago, delta in PROOF_PLAN:
            c = sample.get(email)
            if not c or not c.assigned_plot_id:
                continue
            if PaymentProof.objects.filter(submitted_by=c).exists():
                self._say(f"Proof: {email} already has one — skipped")
                continue
            if not self.dry_run:
                pay_services.refresh_plot_milestone_statuses(c.assigned_plot)
            m = c.assigned_plot.milestones.filter(status__in=[Milestone.Status.DUE, Milestone.Status.OVERDUE]).order_by("sequence").first()
            if not m:
                continue
            paid_on = date.today() - timedelta(days=days_ago)
            claimed = m.amount + delta
            short = f" (short by ₹{-delta:,.0f})" if delta < 0 else ""
            if self.dry_run:
                self._say(f"Proof: {c.name} — {m.name}, ₹{claimed:,.0f} via {mode}{short}")
                continue
            pdf = receipt_pdf(bank=bank, payer=c.name, amount=claimed, paid_on=paid_on, mode=mode, reference=reference)
            pay_services.submit_payment_proof(
                m, c,
                file=ContentFile(pdf, name=f"payment-{c.assigned_plot.plot_number}-{m.sequence}.pdf"),
                claimed_amount=claimed, payment_date=paid_on, payment_mode=mode, transaction_reference=reference,
            )
            self._say(f"Proof: {c.name} — {m.name}, ₹{claimed:,.0f} via {mode}{short}")

    def _change_requests(self, sample):
        for email, change_type, details, reason in CHANGE_PLAN:
            c = sample.get(email)
            if not c or not c.assigned_plot_id:
                continue
            if MilestoneChangeRequest.objects.filter(requested_by=c, status=MilestoneChangeRequest.Status.PENDING).exists():
                self._say(f"Change request: {email} already has a pending one — skipped")
                continue
            schedule = list(c.assigned_plot.milestones.order_by("sequence"))
            if len(schedule) < 3:
                continue
            if self.dry_run:
                self._say(f"Change request: {c.name} — {change_type.label}")
                continue
            MilestoneChangeRequest.objects.create(
                plot=c.assigned_plot, requested_by=c, change_type=change_type, proposed_details=details(schedule), reason=reason,
            )
            self._say(f"Change request: {c.name} — {change_type.label}")
