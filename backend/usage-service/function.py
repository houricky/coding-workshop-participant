"""Usage service — resource usage CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import create_usage, delete_usage, get_usage, list_usage, update_usage
from responses import error_response, json_response, no_content
from validators import is_valid_uuid, parse_positive_number, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "usage-service"


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if not get_auth_context(req["headers"]):
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path, body, query = req["method"], req["path"], req["body"], req["query"]

        if path == "/":
            if method == "GET":
                return list_all(query)
            if method == "POST":
                return create(body)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path.startswith("/") and len(path) > 1:
            usage_id = path[1:]
            if not is_valid_uuid(usage_id):
                return error_response(400, "validation_error", "Invalid usage ID")
            if method == "GET":
                return get_one(usage_id)
            if method == "PUT":
                return update(usage_id, body)
            if method == "DELETE":
                return remove(usage_id)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def list_all(query: dict):
    project_id = query.get("project_id")
    employee_id = query.get("employee_id")
    if project_id and not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project_id")
    if employee_id and not is_valid_uuid(employee_id):
        return error_response(400, "validation_error", "Invalid employee_id")
    records = list_usage(project_id, employee_id, query.get("from_date"), query.get("to_date"))
    return json_response(200, {"usage": records, "count": len(records)})


def create(body: dict):
    missing = require_fields(body, ["project_id", "employee_id", "usage_date", "hours_used"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    for field in ("project_id", "employee_id"):
        if not is_valid_uuid(body[field]):
            return error_response(400, "validation_error", f"Invalid {field}")
    hours, err = parse_positive_number(body["hours_used"], "hours_used")
    if err:
        return error_response(400, "validation_error", err)
    body["hours_used"] = hours
    record = create_usage(body)
    return json_response(201, {"usage": record})


def get_one(usage_id: str):
    record = get_usage(usage_id)
    if not record:
        return error_response(404, "not_found", "Usage record not found")
    return json_response(200, {"usage": record})


def update(usage_id: str, body: dict):
    if "hours_used" in body:
        hours, err = parse_positive_number(body["hours_used"], "hours_used")
        if err:
            return error_response(400, "validation_error", err)
        body["hours_used"] = hours
    record = update_usage(usage_id, body)
    if not record:
        return error_response(404, "not_found", "Usage record not found")
    return json_response(200, {"usage": record})


def remove(usage_id: str):
    if not delete_usage(usage_id):
        return error_response(404, "not_found", "Usage record not found")
    return no_content()
