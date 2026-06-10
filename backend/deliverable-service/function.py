"""Deliverable service — project deliverable CRUD endpoints."""

import logging
from datetime import date

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_deliverable,
    delete_deliverable,
    get_deliverable,
    list_deliverables,
    update_deliverable,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "deliverable-service"
VALID_STATUSES = {"pending", "in_progress", "completed"}


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if req["method"] == "OPTIONS":
            return preflight_response()

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
            deliverable_id = path[1:]
            if not is_valid_uuid(deliverable_id):
                return error_response(400, "validation_error", "Invalid deliverable ID")
            if method == "GET":
                return get_one(deliverable_id)
            if method == "PUT":
                return update(deliverable_id, body)
            if method == "DELETE":
                return remove(deliverable_id)
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
    status = query.get("status")
    if project_id and not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project_id")
    if employee_id and not is_valid_uuid(employee_id):
        return error_response(400, "validation_error", "Invalid employee_id")
    if status and status not in VALID_STATUSES:
        return error_response(400, "validation_error", "Invalid deliverable status")
    deliverables = list_deliverables(project_id, employee_id, status)
    return json_response(200, {"deliverables": deliverables, "count": len(deliverables)})


def create(body: dict):
    body = dict(body or {})
    missing = require_fields(body, ["project_id", "title", "due_date"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    validation_error = validate_payload(body, creating=True)
    if validation_error:
        return validation_error
    deliverable = create_deliverable(body)
    return json_response(201, {"deliverable": deliverable})


def get_one(deliverable_id: str):
    deliverable = get_deliverable(deliverable_id)
    if not deliverable:
        return error_response(404, "not_found", "Deliverable not found")
    return json_response(200, {"deliverable": deliverable})


def update(deliverable_id: str, body: dict):
    body = dict(body or {})
    validation_error = validate_payload(body, creating=False)
    if validation_error:
        return validation_error
    deliverable = update_deliverable(deliverable_id, body)
    if not deliverable:
        return error_response(404, "not_found", "Deliverable not found")
    return json_response(200, {"deliverable": deliverable})


def remove(deliverable_id: str):
    if not delete_deliverable(deliverable_id):
        return error_response(404, "not_found", "Deliverable not found")
    return no_content()


def validate_payload(body: dict, creating: bool):
    if creating and not is_valid_uuid(body.get("project_id")):
        return error_response(400, "validation_error", "Invalid project_id")
    if "project_id" in body and not is_valid_uuid(body["project_id"]):
        return error_response(400, "validation_error", "Invalid project_id")

    employee_id = body.get("employee_id", body.get("assigned_employee_id"))
    if employee_id == "":
        employee_id = None
    if "employee_id" in body:
        body["employee_id"] = employee_id
    if "assigned_employee_id" in body:
        body["assigned_employee_id"] = employee_id
    if employee_id is not None and not is_valid_uuid(employee_id):
        return error_response(400, "validation_error", "Invalid employee_id")

    if "status" in body and body.get("status") not in VALID_STATUSES:
        return error_response(400, "validation_error", "Invalid deliverable status")
    if "due_date" in body:
        try:
            date.fromisoformat(str(body["due_date"]))
        except (TypeError, ValueError):
            return error_response(400, "validation_error", "due_date must be an ISO date")
    return None
