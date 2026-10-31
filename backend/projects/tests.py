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

    def test_approval_saves_the_reviewed_amounts(self):
        self._assign()
        amounts = ["100000", "80000", "60000"]  # 300000 - 60000 booking
        res = self._decide(self._pending_step2(), total_value="300000", instalment_count=4, amounts=amounts)
        self.assertEqual(res.status_code, 200, res.content)
        ms = self.plot.milestones.filter(sequence__gte=2).order_by("sequence")
        self.assertEqual([m.amount for m in ms], [Decimal(a) for a in amounts])

    def test_reviewed_amounts_must_add_up(self):
        self._assign()
        submission = self._pending_step2()
        res = self._decide(submission, total_value="300000", instalment_count=4, amounts=["1", "2", "3"])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"]["code"], "schedule_total_mismatch")
        self.assertEqual(KYCSubmission.objects.get(pk=submission.pk).step2_status, StepStatus.PENDING)

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


@mock.patch("documents.services.notify_customer")
class PricesAndDocumentsTests(TestCase):
    """Prices stay editable, the allotment letter follows 50% paid, and project documents reach every buyer."""

    def setUp(self):
        from payments.models import Milestone

        self.project = Project.objects.create(name="Lakeview", is_published=True)
        self.plot = Plot.objects.create(
            project=self.project, plot_number="A-1", size="200", rate_per_sq_yd=Decimal("1500"),
            price=Decimal("0"), total_value=Decimal("300000"), instalment_count=3,
        )
        self.buyer = Customer.objects.create(email="buyer@example.com", assigned_plot=self.plot, plot_role="PRIMARY", kyc_status="APPROVED")
        self.milestones = [
            Milestone.objects.create(plot=self.plot, sequence=i, name=f"Instalment {i}", amount=Decimal("100000"), due_date=date(2027, i, 1))
            for i in (1, 2, 3)
        ]
        self.client = APIClient()
        self.client.force_authenticate(AdminUser.objects.create_user("admin@example.com", "pw", role=AdminUser.Role.SUPER_ADMIN))

    def _mark_paid(self, milestone):
        res = self.client.patch(f"/api/admin/milestones/{milestone.pk}/", {"status": "PAID", "paid_date": "2027-01-01"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)

    def _letters(self):
        return self.buyer.documents.filter(doc_type="ALLOTMENT_LETTER")

    def test_allotment_letter_issued_once_half_is_paid(self, _notify):
        self._mark_paid(self.milestones[0])
        self.assertFalse(self._letters().exists())  # 1/3 paid
        self._mark_paid(self.milestones[1])
        self.assertEqual(self._letters().count(), 1)
        self.assertTrue(self._letters().first().file.name.endswith(".pdf"))
        self._mark_paid(self.milestones[2])
        self.assertEqual(self._letters().count(), 1)  # not re-issued

    def test_selling_price_change_resplits_unpaid_instalments(self, _notify):
        self._mark_paid(self.milestones[0])
        res = self.client.patch(f"/api/admin/plots/{self.plot.pk}/", {"total_value": "360000"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        unpaid = self.plot.milestones.filter(sequence__gte=2).order_by("sequence")
        self.assertEqual([m.amount for m in unpaid], [Decimal("130000"), Decimal("130000")])

    def test_list_price_can_be_set_by_hand(self, _notify):
        self.plot.refresh_from_db()
        self.assertEqual(self.plot.price, Decimal("300000.00"))  # 200 x 1500
        res = self.client.patch(f"/api/admin/plots/{self.plot.pk}/", {"price": "320000"}, format="json")
        self.assertEqual(res.json()["price"], "320000.00")
        self.assertTrue(res.json()["price_is_manual"])
        res = self.client.patch(f"/api/admin/plots/{self.plot.pk}/", {"rate_per_sq_yd": "1600"}, format="json")
        self.assertEqual(res.json()["price"], "320000.00")  # derived again: 200 x 1600
        self.assertFalse(res.json()["price_is_manual"])

    def test_project_documents_reach_every_buyer_in_the_project(self, _notify):
        from accounts.authentication import issue_customer_tokens
        from documents.models import Document

        Document.objects.create(project=self.project, name="Layout approval", doc_type="PROJECT", status="ISSUED")
        Document.objects.create(project=Project.objects.create(name="Other"), name="Elsewhere", doc_type="PROJECT", status="ISSUED")
        app = APIClient()
        app.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_customer_tokens(self.buyer)['access']}")
        res = app.get("/api/customer/documents/")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([d["name"] for d in res.json()["results"]], ["Layout approval"])

    def _allotment_row(self, **params):
        res = self.client.get("/api/admin/allotments/", params)
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_allotment_list_tracks_paid_share_and_letters(self, _notify):
        from payments.services import plot_paid_total

        Plot.objects.filter(pk=self.plot.pk).update(amount_paid_outside_app=Decimal("120000"))
        row = self._allotment_row()["results"][0]
        self.assertEqual(row["paid"], "0.00")  # outside-app money counts once instalment 1 is paid
        self._mark_paid(self.milestones[0])
        row = self._allotment_row()["results"][0]
        self.assertEqual(row["paid"], str(plot_paid_total(Plot.objects.get(pk=self.plot.pk))))
        self.assertEqual((row["paid"], row["paid_percent"], row["instalments_paid"], row["instalments_total"]), ("120000.00", 40.0, 1, 3))
        self.assertEqual(row["letter_status"], "NOT_DUE")
        self.assertIsNone(row["buyers"][0]["letter"])

        self._mark_paid(self.milestones[1])
        row = self._allotment_row()["results"][0]
        self.assertEqual(row["letter_status"], "ISSUED")
        self.assertTrue(row["buyers"][0]["letter"]["is_visible_to_customer"])

        # A co-applicant added after the letter went out still needs theirs.
        Customer.objects.create(email="co@example.com", assigned_plot=self.plot, plot_role="CO_APPLICANT")
        data = self._allotment_row(letter_status="READY")
        self.assertEqual(data["stats"], {"READY": 1, "ISSUED": 0, "NOT_DUE": 0})
        self.assertEqual([b["email"] for b in data["results"][0]["buyers"]], ["buyer@example.com", "co@example.com"])  # primary first
        self.assertEqual(self._allotment_row(search="nobody")["count"], 0)

    def test_allotment_letter_can_be_issued_by_hand(self, _notify):
        url = f"/api/admin/allotments/{self.plot.pk}/issue/"
        res = self.client.post(url, {}, format="json")  # nothing paid yet: an early, manual letter
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["letter_status"], "ISSUED")
        letter = self._letters().get()
        self.assertTrue(letter.is_visible_to_customer)
        self.assertEqual(letter.uploaded_by.email, "admin@example.com")

        # Re-issuing a hidden letter shares it again without adding a second one.
        letter.is_visible_to_customer = False
        letter.save()
        self.assertEqual(self._allotment_row()["results"][0]["letter_status"], "NOT_DUE")
        res = self.client.post(url, {"customers": [self.buyer.pk]}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self._letters().count(), 1)
        self.assertTrue(self._letters().get().is_visible_to_customer)

        # Reaching 50% later doesn't issue a second letter either.
        self._mark_paid(self.milestones[0])
        self._mark_paid(self.milestones[1])
        self.assertEqual(self._letters().count(), 1)

    def test_allotment_letter_needs_a_selling_price(self, _notify):
        self.plot.total_value = None
        self.plot.save()
        res = self.client.post(f"/api/admin/allotments/{self.plot.pk}/issue/", {}, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(res.json()["errors"]["code"], "no_total_value")
