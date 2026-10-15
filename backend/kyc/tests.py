import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.authentication import issue_customer_tokens
from accounts.models import Customer
from projects.models import Plot, Project

from .models import KYCSubmission, StepStatus

# Uploaded receipts and ID images go to a throwaway folder, not the dev media/ directory.
TEST_MEDIA = tempfile.mkdtemp(prefix="atomcap-test-media-")


def tearDownModule():
    shutil.rmtree(TEST_MEDIA, ignore_errors=True)


def _image(name):
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\n", content_type="image/png")


def _pdf(name):
    return SimpleUploadedFile(name, b"%PDF-1.4", content_type="application/pdf")


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class KYCStep2IdentityDocumentTests(TestCase):
    def setUp(self):
        project = Project.objects.create(name="Test Project")
        plot = Plot.objects.create(project=project, plot_number="A-1", size="200", price=Decimal("300000"))
        self.customer = Customer.objects.create(email="buyer@example.com", assigned_plot=plot)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_customer_tokens(self.customer)['access']}")

    def _step2(self, **files):
        data = {
            "plot_confirmed": "true",
            "receipt_file": _pdf("receipt.pdf"),
            "receipt_amount": "100000",
            "receipt_payment_date": "2026-10-01",
            **files,
        }
        return self.client.post("/api/customer/kyc/step2/", data, format="multipart")

    def test_first_submission_requires_aadhaar_front_and_pan(self):
        res = self._step2()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(res.json()["errors"]), {"aadhaar_front", "pan_card"})
        self.assertFalse(KYCSubmission.objects.filter(customer=self.customer, step2_status=StepStatus.PENDING).exists())

    def test_submission_stores_identity_documents(self):
        res = self._step2(aadhaar_front=_image("aadhaar-front.png"), aadhaar_back=_image("aadhaar-back.png"), pan_card=_pdf("pan.pdf"))
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        for field in ("aadhaar_front", "aadhaar_back", "pan_card"):
            self.assertTrue(body[field])
        sub = KYCSubmission.objects.get(customer=self.customer)
        self.assertEqual(sub.step2_status, StepStatus.PENDING)
        self.assertTrue(sub.aadhaar_front.name.startswith("kyc/identity/"))

    def test_aadhaar_back_is_optional(self):
        res = self._step2(aadhaar_front=_pdf("e-aadhaar.pdf"), pan_card=_image("pan.png"))
        self.assertEqual(res.status_code, 201, res.content)
        self.assertIsNone(res.json()["aadhaar_back"])

    def test_resubmission_keeps_identity_documents_on_record(self):
        self._step2(aadhaar_front=_image("aadhaar-front.png"), pan_card=_image("pan.png"))
        sub = KYCSubmission.objects.get(customer=self.customer)
        original_pan = sub.pan_card.name
        KYCSubmission.objects.filter(pk=sub.pk).update(step2_status=StepStatus.REJECTED, step2_rejection_reason="Blurry receipt")

        res = self._step2(aadhaar_front=_image("aadhaar-front-2.png"))
        self.assertEqual(res.status_code, 201, res.content)
        sub.refresh_from_db()
        self.assertEqual(sub.step2_status, StepStatus.PENDING)
        self.assertEqual(sub.pan_card.name, original_pan)
        self.assertIn("aadhaar-front-2", sub.aadhaar_front.name)

    def test_rejects_unsupported_file_type(self):
        bad = SimpleUploadedFile("pan.txt", b"hello", content_type="text/plain")
        res = self._step2(aadhaar_front=_image("aadhaar-front.png"), pan_card=bad)
        self.assertEqual(res.status_code, 400)
        self.assertIn("pan_card", res.json()["errors"])
