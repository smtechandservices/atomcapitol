import logging

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Wraps DRF's default handler so every error response has a consistent shape:
    {"detail": "...", "errors": {...}} instead of the bare default payloads.
    """
    response = exception_handler(exc, context)
    if response is None:
        view = context.get("view")
        logger.exception("Unhandled exception in %s", view.__class__.__name__ if view else "API view", exc_info=exc)
        return Response(
            {"detail": "Internal server error.", "errors": {}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        response.data = {"detail": data["detail"], "errors": {}}
    elif isinstance(data, dict):
        response.data = {"detail": "Validation failed.", "errors": data}
    elif isinstance(data, list):
        response.data = {"detail": "Validation failed.", "errors": {"non_field_errors": data}}
    return response
