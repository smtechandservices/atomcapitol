import shutil
import tempfile
from datetime import date
from decimal import Decimal
from unittest import mock

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings

from accounts.models import AdminUser, Customer
from projects.models import Plot, Project

from . import services
from .models import Milestone, PaymentProof

# Uploaded proofs and generated receipts go to a throwaway folder, not the dev media/ directory.
TEST_MEDIA = tempfile.mkdtemp(prefix="atomcap-test-media-")


def tearDownModule():
    shutil.rmtree(TEST_MEDIA, ignore_errors=True)


@override_settings(MEDIA_ROOT=TEST_MEDIA)
@mock.patch("documents.services.generate_receipt_document")
@mock.patch("payments.services.notify_customer")
class ApprovePaymentProofTests(TestCase):
    def setUp(self):
        project = Project.objects.create(name="Test Project")
        self.plot = Plot.objects.create(project=project, plot_number="A-1", size="200", price=Decimal("300000"))
        self.customer = Customer.objects.create(email="buyer@example.com")
        self.admin = AdminUser.objects.create(email="admin@example.com")
        for i, amount in enumerate(["100000", "100000", "100000"], start=1):
            Milestone.objects.create(plot=self.plot, sequence=i, name=f"Instalment {i} of 3", amount=Decimal(amount), due_date=date(2026, i, 10))
        services.refresh_plot_milestone_statuses(self.plot)
        self.first = self.plot.milestones.get(sequence=1)

    def _proof(self, amount):
        self.first.refresh_from_db()
        return services.submit_payment_proof(
            self.first, self.customer, file=ContentFile(b"%PDF-1.4", name="p.pdf"), claimed_amount=Decimal(amount),
            payment_date=date(2026, 1, 9), payment_mode="NEFT",
        )

    def test_matching_amount_needs_no_schedule(self, *_):
        proof = services.approve_payment_proof(self._proof("100000"), self.admin, bank="HDFC Bank", transaction_reference="REF1")
        self.assertEqual(proof.status, PaymentProof.Status.APPROVED)
        self.assertEqual(self.plot.milestones.count(), 3)

    def test_admin_receipt_details_are_recorded(self, *_):
        proof = services.approve_payment_proof(self._proof("100000"), self.admin, bank="SBI", transaction_reference="UTR123", payment_mode="RTGS")
        self.first.refresh_from_db()
        self.assertEqual((self.first.bank, self.first.transaction_reference, self.first.payment_mode), ("SBI", "UTR123", "RTGS"))
        self.assertEqual(proof.transaction_reference, "UTR123")

    def test_mismatch_requires_schedule(self, *_):
        with self.assertRaises(services.PaymentError) as ctx:
            services.approve_payment_proof(self._proof("80000"), self.admin, bank="HDFC Bank", transaction_reference="REF1")
        self.assertEqual(ctx.exception.code, "schedule_required")

    def test_mismatch_schedule_must_cover_remaining(self, *_):
        bad = [{"name": "Instalment 2 of 3", "amount": Decimal("100000"), "due_date": date(2026, 2, 10)}]
        with self.assertRaises(services.PaymentError) as ctx:
            services.approve_payment_proof(self._proof("80000"), self.admin, bank="HDFC Bank", transaction_reference="REF1", schedule=bad)
        self.assertEqual(ctx.exception.code, "schedule_total_mismatch")

    def test_short_payment_revalues_milestone_and_replans(self, *_):
        schedule = [
            {"name": "Instalment 2 of 3", "amount": Decimal("110000"), "due_date": date(2026, 2, 10)},
            {"name": "Instalment 3 of 3", "amount": Decimal("110000"), "due_date": date(2026, 3, 10)},
        ]
        services.approve_payment_proof(self._proof("80000"), self.admin, bank="HDFC Bank", transaction_reference="REF1", schedule=schedule)
        ms = list(self.plot.milestones.order_by("sequence"))
        self.assertEqual([(m.sequence, m.amount) for m in ms], [(1, Decimal("80000")), (2, Decimal("110000")), (3, Decimal("110000"))])
        self.assertEqual(ms[0].status, Milestone.Status.PAID)

    def test_replan_after_out_of_order_payment(self, *_):
        # Milestone 3 already paid, so the kept sequences are {1, 3}: new ones must start at 4, not 3.
        self.plot.milestones.filter(sequence=3).update(status=Milestone.Status.PAID)
        schedule = [{"name": "Balance", "amount": Decimal("120000"), "due_date": date(2026, 2, 10)}]
        services.approve_payment_proof(self._proof("80000"), self.admin, bank="HDFC Bank", transaction_reference="REF1", schedule=schedule)
        ms = list(self.plot.milestones.order_by("sequence"))
        self.assertEqual([(m.sequence, m.amount) for m in ms], [(1, Decimal("80000")), (3, Decimal("100000")), (4, Decimal("120000"))])

    def test_replan_before_kyc_instalment_recorded(self, *_):
        # Generated schedules start at 2 until the KYC receipt becomes instalment 1.
        self.plot.milestones.filter(sequence=1).delete()
        services.refresh_plot_milestone_statuses(self.plot)
        self.first = self.plot.milestones.get(sequence=2)
        schedule = [{"name": "Balance", "amount": Decimal("120000"), "due_date": date(2026, 3, 10)}]
        services.approve_payment_proof(self._proof("80000"), self.admin, bank="HDFC Bank", transaction_reference="REF1", schedule=schedule)
        self.assertEqual(list(self.plot.milestones.values_list("sequence", flat=True)), [2, 3])

    def test_replan_with_nothing_paid_keeps_instalment_1_free(self, *_):
        self.plot.milestones.all().delete()
        Milestone.objects.create(plot=self.plot, sequence=2, name="Instalment 2", amount=Decimal("100000"), due_date=date(2026, 2, 10))
        services.apply_schedule(self.plot, [{"name": "Balance", "amount": Decimal("100000"), "due_date": date(2026, 3, 10)}])
        self.assertEqual(list(self.plot.milestones.values_list("sequence", flat=True)), [2])

    def test_payment_clearing_whole_balance(self, *_):
        services.approve_payment_proof(self._proof("300000"), self.admin, bank="HDFC Bank", transaction_reference="REF1")
        self.assertEqual(list(self.plot.milestones.values_list("amount", flat=True)), [Decimal("300000")])

    def test_payment_above_whole_balance_blocked(self, *_):
        with self.assertRaises(services.PaymentError) as ctx:
            services.approve_payment_proof(self._proof("400000"), self.admin, bank="HDFC Bank", transaction_reference="REF1", schedule=[])
        self.assertEqual(ctx.exception.code, "overpaid_balance")


@override_settings(MEDIA_ROOT=TEST_MEDIA)
@mock.patch("documents.services.notify_customer")
@mock.patch("payments.services.notify_customer")
class RegenerateReceiptTests(TestCase):
    def setUp(self):
        project = Project.objects.create(name="Receipt Project")
        self.plot = Plot.objects.create(project=project, plot_number="B-1", size="200", price=Decimal("200000"))
        self.customer = Customer.objects.create(email="r@example.com", assigned_plot=self.plot, plot_role="PRIMARY")
        self.admin = AdminUser.objects.create(email="radmin@example.com")
        self.m = Milestone.objects.create(plot=self.plot, sequence=1, name="Instalment 1 of 2", amount=Decimal("100000"), due_date=date(2026, 1, 10))
        Milestone.objects.create(plot=self.plot, sequence=2, name="Instalment 2 of 2", amount=Decimal("100000"), due_date=date(2026, 2, 10))
        services.refresh_plot_milestone_statuses(self.plot)

    def test_unpaid_milestone_rejected(self, *_):
        with self.assertRaises(services.PaymentError) as ctx:
            services.regenerate_milestone_receipt(self.m, self.admin)
        self.assertEqual(ctx.exception.code, "not_paid")

    def test_regenerate_hides_previous_receipt(self, *_):
        self.m.refresh_from_db()
        proof = services.submit_payment_proof(
            self.m, self.customer, file=ContentFile(b"%PDF-1.4", name="p.pdf"), claimed_amount=Decimal("100000"),
            payment_date=date(2026, 1, 9), payment_mode="NEFT",
        )
        services.approve_payment_proof(proof, self.admin, bank="HDFC Bank", transaction_reference="REF1")
        first = self.m.documents.get()
        new = services.regenerate_milestone_receipt(self.m, self.admin)
        first.refresh_from_db()
        self.assertFalse(first.is_visible_to_customer)
        self.assertTrue(new.is_visible_to_customer)
        self.assertEqual(new.customer, self.customer)

    def test_paid_without_proof_uses_primary_buyer(self, *_):
        Milestone.objects.filter(pk=self.m.pk).update(status=Milestone.Status.PAID, paid_date=date(2026, 1, 5), payment_mode="Cash")
        self.m.refresh_from_db()
        doc = services.regenerate_milestone_receipt(self.m, self.admin)
        self.assertEqual(doc.customer, self.customer)
        self.assertTrue(doc.file)


class OutsideAppMoneyTests(TestCase):
    """Money paid outside the app is the booking payment that the KYC receipt becomes instalment 1 for."""

    def setUp(self):
        project = Project.objects.create(name="Test Project")
        self.plot = Plot.objects.create(
            project=project, plot_number="A-1", size="200", price=Decimal("550000"), total_value=Decimal("550000"),
            amount_paid_outside_app=Decimal("10000"), instalment_count=10,
        )
        Milestone.objects.create(plot=self.plot, sequence=2, name="Instalment 2 of 10", amount=Decimal("540000"), due_date=date(2026, 11, 21))

    def _instalment_1(self, status):
        Milestone.objects.create(plot=self.plot, sequence=1, name="Instalment 1 of 10", amount=Decimal("10000"), due_date=date(2026, 10, 1), status=status)

    def test_not_collected_until_the_kyc_receipt_is_approved(self):
        self.assertEqual(services.outside_app_collected(self.plot), 0)
        self.assertEqual(services.outside_app_not_scheduled(self.plot), Decimal("10000"))  # still planned around
        self.assertEqual(services.pending_booking_payment(self.plot)["amount"], Decimal("10000"))

    def test_counted_once_through_instalment_1(self):
        self._instalment_1(Milestone.Status.PAID)
        self.assertEqual(services.outside_app_collected(self.plot), 0)  # instalment 1 already is that money
        self.assertIsNone(services.pending_booking_payment(self.plot))

    def test_excess_over_instalment_1_counts_once_approved(self):
        self.plot.amount_paid_outside_app = Decimal("15000")
        self.plot.save()
        self._instalment_1(Milestone.Status.PAID)
        self.assertEqual(services.outside_app_collected(self.plot), Decimal("5000"))
