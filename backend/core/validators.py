from django.conf import settings
from django.core.exceptions import ValidationError


IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic")
DOCUMENT_TYPES = IMAGE_TYPES + ("application/pdf",)
VIDEO_TYPES = ("video/mp4", "video/quicktime", "video/webm")


def _validate(file, allowed_types, label):
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file.size > max_bytes:
        raise ValidationError(f"{label} exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB limit.")
    content_type = getattr(file, "content_type", None)
    if content_type and content_type not in allowed_types:
        raise ValidationError(f"{label} must be one of: {', '.join(allowed_types)} (got {content_type}).")


def validate_receipt_file(file):
    _validate(file, DOCUMENT_TYPES, "Receipt file")


def validate_payment_proof_file(file):
    _validate(file, DOCUMENT_TYPES, "Payment proof")


def validate_video_file(file):
    _validate(file, VIDEO_TYPES, "KYC video")


def validate_document_file(file):
    _validate(file, DOCUMENT_TYPES, "Document")


def validate_image_file(file):
    _validate(file, IMAGE_TYPES, "Image")
