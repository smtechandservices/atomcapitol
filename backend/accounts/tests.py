import shutil
import tempfile
from decimal import Decimal

from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import AdminUser, Customer
from kyc.models import KYCSubmission, StepStatus
from notifications.models import Notification
from projects.models import Plot, Project
from projects.services import assign_plot, unassign_plot

TEST_MEDIA = tempfile.mkdtemp(prefix="atomcap-test-media-")


def tearDownModule():
    shutil.rmtree(TEST_MEDIA, ignore_errors=True)


def _image(name):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n", content_type="image/png")


@override_settings(MEDIA_ROOT=TEST_MEDIA, OTP_BYPASS_CODE="")
class SelfSignupFlowTests(TestCase):
    """Unknown emails sign up through the OTP, submit KYC Step 1, and wait for admin to assign a plot."""

    def setUp(self):
        cache.clear()  # OTP throttle counts live in the cache
        self.client = APIClient()
        project = Project.objects.create(name="Lakeview")
        self.plot = Plot.objects.create(project=project, plot_number="A-1", size="200", price=Decimal("300000"))
        self.admin = AdminUser.objects.create_user("admin@example.com", "pw", role=AdminUser.Role.SUPER_ADMIN)
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def _sign_in(self, email):
        res = self.client.post("/api/customer/auth/login/", {"email": email})
        self.assertEqual(res.status_code, 200, res.content)
        customer = Customer.objects.get(email=email)
        code = customer.otps.first().code
        res = self.client.post("/api/customer/auth/verify-otp/", {"email": email, "code": code})
        self.assertEqual(res.status_code, 200, res.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
        return res.json()

    def _step1(self, **extra):
        data = {
            "name": "New Buyer",
            "phone": "+91 90000 00000",
            "claimed_project": "lakeview",
            "claimed_plot_number": "a1",
            "aadhaar_front": _image("aadhaar.png"),
            "pan_card": _image("pan.png"),
            **extra,
        }
        return self.client.post("/api/customer/kyc/step1/", data, format="multipart")

    def _admin_customer_emails(self, **params):
        res = self.admin_client.get("/api/admin/customers/", params)
        return [c["email"] for c in res.json()["results"]]

    def test_unknown_email_gets_an_otp_and_starts_at_step1(self):
        body = self._sign_in("new@example.com")
        self.assertEqual(body["next_route"], "kyc_step1")
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(Customer.objects.get(email="new@example.com").is_self_registered)

    def test_signup_is_hidden_from_admin_until_step1(self):
        self._sign_in("new@example.com")
        self.assertNotIn("new@example.com", self._admin_customer_emails())

        res = self._step1()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["next_route"], "awaiting_plot")

        res = self.admin_client.get("/api/admin/customers/", {"assigned_plot__isnull": "true", "kyc_submission__step1_submitted_at__isnull": "false"})
        row = res.json()["results"][0]
        self.assertEqual(row["email"], "new@example.com")
        self.assertEqual(row["claimed_plot"], {"project": "lakeview", "plot_number": "a1"})

    def test_step1_requires_identity_files(self):
        self._sign_in("new@example.com")
        res = self._step1(aadhaar_front="", pan_card="")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(res.json()["errors"]), {"aadhaar_front", "pan_card"})

    def test_steps_2_and_3_wait_for_a_plot_then_reuse_step1_ids(self):
        self._sign_in("new@example.com")
        self._step1()
        self.assertEqual(self.client.get("/api/customer/kyc/step3/").status_code, 403)

        assign_plot(self.plot, "new@example.com", performed_by=self.admin)
        self.assertTrue(Notification.objects.filter(customer__email="new@example.com", notif_type="PLOT_ASSIGNED").exists())
        self.assertEqual(self.client.get("/api/customer/kyc/status/").json()["next_route"], "onboarding")

        res = self.client.post(
            "/api/customer/kyc/step2/",
            {
                "plot_confirmed": "true",
                "receipt_file": SimpleUploadedFile("r.pdf", b"%PDF-1.4", content_type="application/pdf"),
                "receipt_amount": "100000",
                "receipt_payment_date": "2026-10-01",
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.content)  # Aadhaar / PAN came from Step 1
        self.assertEqual(KYCSubmission.objects.get(customer__email="new@example.com").step2_status, StepStatus.PENDING)

    def test_step1_closed_once_a_plot_is_assigned(self):
        assign_plot(self.plot, "buyer@example.com", performed_by=self.admin)
        self.assertEqual(self._sign_in("buyer@example.com")["next_route"], "onboarding")
        res = self._step1()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["errors"], {"code": "plot_already_assigned"})

    def test_former_buyer_signs_in_again_as_a_new_customer(self):
        customer = assign_plot(self.plot, "old@example.com", performed_by=self.admin)
        KYCSubmission.objects.create(customer=customer, step2_status=StepStatus.APPROVED, step3_status=StepStatus.APPROVED)
        Customer.objects.filter(pk=customer.pk).update(kyc_status=Customer.KYCStatus.APPROVED)
        unassign_plot(self.plot, Customer.objects.get(pk=customer.pk), performed_by=self.admin)

        body = self._sign_in("old@example.com")
        self.assertEqual(body["next_route"], "kyc_step1")
        customer.refresh_from_db()
        self.assertTrue(customer.is_active)
        self.assertEqual(customer.kyc_status, Customer.KYCStatus.NOT_STARTED)
        self.assertIsNone(KYCSubmission.objects.get(customer=customer).step2_status)

    def test_switched_off_buyer_who_still_holds_a_plot_stays_blocked(self):
        customer = assign_plot(self.plot, "blocked@example.com", performed_by=self.admin)
        Customer.objects.filter(pk=customer.pk).update(is_active=False)
        res = self.client.post("/api/customer/auth/login/", {"email": "blocked@example.com"})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)
