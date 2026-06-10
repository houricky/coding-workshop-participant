"""Standard HTTP response helpers for Lambda."""

import json
from decimal import Decimal
from datetime import date, datetime
from uuid import UUID

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
}


def _serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    return obj


def json_response(status_code: int, body: dict | list | None = None, headers: dict | None = None):
    """Build a Lambda-compatible JSON response."""
    response_headers = {"Content-Type": "application/json", **CORS_HEADERS}
    if headers:
        response_headers.update(headers)
    payload = _serialize(body) if body is not None else {}
    return {
        "statusCode": status_code,
        "headers": response_headers,
        "body": json.dumps(payload),
    }


def error_response(status_code: int, error: str, message: str, details: dict | None = None):
    """Build a consistent error response."""
    body = {"error": error, "message": message}
    if details:
        body["details"] = details
    return json_response(status_code, body)


def no_content():
    """Return 204 No Content."""
    return {"statusCode": 204, "headers": {"Content-Type": "application/json", **CORS_HEADERS}, "body": ""}


def preflight_response():
    """Return a successful CORS preflight response."""
    return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}
