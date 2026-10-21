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
    """A primary buyer's schedule is generated from the payment terms, so assigning one needs them."""

    def setUp(self):
        self.plot = Plot.objects.create(project=Project.objects.create(name="Lakeview"), plot_number="A-1", size="200", price=Decimal("300000"))
        self.client = APIClient()
        self.client.force_authenticate(AdminUser.objects.create_user("admin@example.com", "pw", role=AdminUser.Role.SUPER_ADMIN))

    def _assign(self, **data):
        return self.client.post(f"/api/admin/plots/{self.plot.pk}/assign/", {"email": "buyer@example.com", **data}, format="json")

    def test_primary_buyer_needs_terms(self):
        res = self._assign(total_value="300000")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"], {"code": "payment_terms_required"})

    def test_schedule_waits_for_kyc_step2_approval(self):
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
