from datetime import date
from decimal import Decimal
from unittest import mock

from dateutil.relativedelta import relativedelta
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AdminUser, Customer
from kyc.models import KYCSubmission, StepStatus
from kyc.services import decide_step

from .models import Plot, Project


class AssignPaymentTermsTests(TestCase):
    """Payment terms are set when the primary buyer's KYC Step 2 (booking receipt) is approved, not at assignment."""

    def setUp(self):
        self.plot = Plot.objects.create(project=Project.objects.create(name="Lakeview"), plot_number="A-1", size="200", price=Decimal("300000"))
        self.client = APIClient()
        self.client.force_authenticate(AdminUser.objects.create_user("admin@example.com", "pw", role=AdminUser.Role.SUPER_ADMIN))

    def _assign(self, **data):
        return self.client.post(f"/api/admin/plots/{self.plot.pk}/assign/", {"email": "buyer@example.com", **data}, format="json")

    def _pending_step2(self, receipt_amount="60000"):
        return KYCSubmission.objects.create(
            customer=Customer.objects.get(email="buyer@example.com"),
            receipt_file="kyc/receipts/r.pdf",
            receipt_amount=Decimal(receipt_amount),
            receipt_payment_date=date(2026, 10, 1),
            step2_status=StepStatus.PENDING,
        )

    def _decide(self, submission, **data):
        with mock.patch("kyc.services.notify_customer"):
            return self.client.post(f"/api/admin/kyc-queue/{submission.pk}/decide/", {"step2_decision": "APPROVED", **data}, format="json")

    def test_primary_buyer_assigned_without_terms(self):
        res = self._assign()
        self.assertEqual(res.status_code, 200, res.content)
        self.plot.refresh_from_db()
        self.assertIsNone(self.plot.total_value)
        self.assertEqual(self.plot.milestones.count(), 0)

    def test_step2_approval_sets_terms_and_generates_schedule(self):
        self._assign()
        submission = self._pending_step2()
        res = self._decide(submission, total_value="300000", instalment_count=4)
        self.assertEqual(res.status_code, 200, res.content)

        self.plot.refresh_from_db()
        self.assertEqual((self.plot.total_value, self.plot.instalment_count), (Decimal("300000"), 4))
        self.assertEqual(self.plot.amount_paid_outside_app, Decimal("60000"))  # the booking receipt
        ms = list(self.plot.milestones.order_by("sequence"))
        self.assertEqual([m.sequence for m in ms], [1, 2, 3, 4])
        self.assertEqual(ms[0].amount, Decimal("60000"))
        self.assertEqual(sum(m.amount for m in ms), Decimal("300000"))

    def test_step2_approval_without_terms_is_refused(self):
        self._assign()
        submission = self._pending_step2()
        res = self._decide(submission)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"], {"code": "payment_terms_required"})
        submission.refresh_from_db()
        self.assertEqual(submission.step2_status, StepStatus.PENDING)
        self.assertEqual(self.plot.milestones.count(), 0)

    def test_total_value_must_exceed_booking(self):
        self._assign()
        res = self._decide(self._pending_step2(), total_value="60000", instalment_count=4)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"], {"code": "total_value_too_low"})

    def test_preview_matches_generated_schedule(self):
        self._assign()
        submission = self._pending_step2()
        entries = [{"payment_by": "UPI", "payment_date": "2026-10-02", "bank": "SBI", "reference": "UTR1", "amount": "75000"}]
        terms = {"total_value": "300000", "instalment_count": 4, "receipt_entries": entries}
        preview = self.client.post(f"/api/admin/kyc-queue/{submission.pk}/schedule-preview/", terms, format="json")
        self.assertEqual(preview.status_code, 200, preview.content)
        rows = preview.json()["milestones"]
        self.assertEqual(self.plot.milestones.count(), 0)  # preview saves nothing

        with mock.patch("documents.services.generate_receipt_document"):
            self.assertEqual(self._decide(submission, **terms).status_code, 200)
        ms = self.plot.milestones.order_by("sequence")
        self.assertEqual(
            [(r["sequence"], Decimal(r["amount"]), r["due_date"]) for r in rows],
            [(m.sequence, m.amount, m.due_date.isoformat()) for m in ms],
        )

    def test_weekly_preview(self):
        self._assign()
        submission = self._pending_step2()
        res = self.client.post(
            f"/api/admin/kyc-queue/{submission.pk}/schedule-preview/",
            {"total_value": "300000", "instalment_count": 4, "frequency": "WEEKLY"},
            format="json",
        )
        dates = [r["due_date"] for r in res.json()["milestones"][1:]]
        self.assertEqual(dates, [(date.today() + relativedelta(weeks=k)).isoformat() for k in (1, 2, 3)])

    def test_approval_saves_the_reviewed_due_dates(self):
        self._assign()
        due = ["2026-12-01", "2027-01-15", "2027-03-01"]
        res = self._decide(self._pending_step2(), total_value="300000", instalment_count=4, frequency="WEEKLY", due_dates=due)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([m.due_date.isoformat() for m in self.plot.milestones.filter(sequence__gte=2).order_by("sequence")], due)

    def test_due_dates_must_be_in_order_and_complete(self):
        self._assign()
        submission = self._pending_step2()
        for due in (["2027-01-15", "2026-12-01", "2027-03-01"], ["2026-12-01"]):
            res = self._decide(submission, total_value="300000", instalment_count=4, due_dates=due)
            self.assertEqual(res.status_code, 400, due)
            self.assertIn("due_dates", res.json()["errors"])

    def test_terms_given_at_assignment_still_work(self):  # e.g. CSV bulk assign
        res = self._assign(total_value="300000", instalment_count=4)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.plot.milestones.count(), 0)

        customer = Customer.objects.get(email="buyer@example.com")
        submission = KYCSubmission.objects.create(
            customer=customer, receipt_file="kyc/receipts/r.pdf", receipt_amount=Decimal("60000"), receipt_payment_date=date(2026, 10, 1), step2_status=StepStatus.PENDING,
        )
        with mock.patch("kyc.services.notify_customer"):
            decide_step(submission, step="STEP2", decision="APPROVED", reason="", admin_user=None)

        ms = list(self.plot.milestones.order_by("sequence"))
        self.assertEqual([m.sequence for m in ms], [1, 2, 3, 4])
        self.assertEqual(ms[0].amount, Decimal("60000"))
        self.assertEqual(sum(m.amount for m in ms[1:]), Decimal("240000"))
        self.assertEqual(ms[1].due_date, date.today() + relativedelta(months=1))  # counted from approval

    def test_buyer_with_approved_booking_gets_a_schedule_on_assignment(self):
        customer = Customer.objects.create(email="buyer@example.com")
        KYCSubmission.objects.create(customer=customer, step2_status=StepStatus.APPROVED)
        self._assign(total_value="300000", instalment_count=4)
        self.assertEqual(self.plot.milestones.filter(sequence__gte=2).count(), 3)

    def test_plot_that_already_has_terms_needs_none(self):
        Plot.objects.filter(pk=self.plot.pk).update(total_value=Decimal("300000"), instalment_count=4)
        self.assertEqual(self._assign().status_code, 200)

    def test_co_applicant_needs_no_terms(self):
        self._assign(total_value="300000", instalment_count=4)
        res = self._assign(email="co@example.com", role="CO_APPLICANT")
        self.assertEqual(res.status_code, 200, res.content)
