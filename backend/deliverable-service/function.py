"""Deliverable service — project deliverable CRUD endpoints."""

import logging
from datetime import date

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_deliverable,
    create_deliverable_dependency,
    delete_deliverable,
    delete_deliverable_dependency,
    get_deliverable,
    get_deliverable_dependency,
    is_employee_allocated,
    is_project_lead,
    list_deliverable_dependencies,
    list_deliverables,
    update_deliverable,
    update_deliverable_dependency,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "deliverable-service"
# Statuses a client may write. 'stalled' is computed by the database, never set directly.
VALID_STATUSES = {"pending", "in_progress", "completed"}
# Statuses a client may filter by (includes the computed 'stalled').
VALID_FILTER_STATUSES = VALID_STATUSES | {"stalled"}


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if req["method"] == "OPTIONS":
            return preflight_response()

        auth = get_auth_context(req["headers"])
        if not auth:
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path, body, query = req["method"], req["path"], req["body"], req["query"]

        if path == "/":
            if method == "GET":
                return list_all(query, auth)
            if method == "POST":
                return create(body, auth)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path == "/dependencies":
            if method == "GET":
                return list_deps(query, auth)
            if method == "POST":
                return create_dep(body, auth)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path.startswith("/dependencies/"):
            dependency_id = path[len("/dependencies/"):]
            if not is_valid_uuid(dependency_id):
                return error_response(400, "validation_error", "Invalid dependency ID")
            if method == "PUT":
                return update_dep(dependency_id, body, auth)
            if method == "DELETE":
                return remove_dep(dependency_id, auth)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path.startswith("/") and len(path) > 1:
            deliverable_id = path[1:]
            if not is_valid_uuid(deliverable_id):
                return error_response(400, "validation_error", "Invalid deliverable ID")
            if method == "GET":
                return get_one(deliverable_id, auth)
            if method == "PUT":
                return update(deliverable_id, body, auth)
            if method == "DELETE":
                return remove(deliverable_id, auth)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def forbidden():
    return error_response(403, "forbidden", "You do not have permission to perform this action")


def list_all(query: dict, auth: dict):
    project_id = query.get("project_id")
    employee_id = query.get("employee_id")
    status = query.get("status")
    if project_id and not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project_id")
    if employee_id and not is_valid_uuid(employee_id):
        return error_response(400, "validation_error", "Invalid employee_id")
    if status and status not in VALID_FILTER_STATUSES:
        return error_response(400, "validation_error", "Invalid deliverable status")
    allocated_employee_id = auth.get("employee_id") if auth.get("role") == "employee" else None
    deliverables = list_deliverables(project_id, employee_id, status, allocated_employee_id)
    return json_response(200, {"deliverables": deliverables, "count": len(deliverables)})


def create(body: dict, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    body = dict(body or {})
    missing = require_fields(body, ["project_id", "title", "due_date"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    validation_error = validate_payload(body, creating=True)
    if validation_error:
        return validation_error
    if auth.get("role") == "manager" and not is_project_lead(body["project_id"], auth.get("employee_id")):
        return forbidden()
    deliverable = create_deliverable(body)
    return json_response(201, {"deliverable": deliverable})


def get_one(deliverable_id: str, auth: dict):
    deliverable = get_deliverable(deliverable_id)
    if not deliverable:
        return error_response(404, "not_found", "Deliverable not found")
    if auth.get("role") == "employee" and not is_employee_allocated(deliverable["project_id"], auth.get("employee_id")):
        return forbidden()
    return json_response(200, {"deliverable": deliverable})


def update(deliverable_id: str, body: dict, auth: dict):
    body = dict(body or {})
    existing = get_deliverable(deliverable_id)
    if not existing:
        return error_response(404, "not_found", "Deliverable not found")
    validation_error = validate_payload(body, creating=False)
    if validation_error:
        return validation_error
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    if auth.get("role") == "employee":
        employee_id = auth.get("employee_id")
        if not is_employee_allocated(existing["project_id"], employee_id):
            return forbidden()
        assigned_employee_id = existing.get("employee_id") or existing.get("assigned_employee_id")
        requested_assignee = body.get("employee_id", body.get("assigned_employee_id"))
        allowed = {"status", "employee_id", "assigned_employee_id"}
        if set(body) - allowed:
            return forbidden()
        if assigned_employee_id == employee_id:
            if requested_assignee not in (None, "", employee_id):
                return forbidden()
            body.pop("employee_id", None)
            body.pop("assigned_employee_id", None)
        elif assigned_employee_id in (None, "") and requested_assignee == employee_id:
            body["assigned_employee_id"] = employee_id
            body.pop("employee_id", None)
        else:
            return forbidden()
    deliverable = update_deliverable(deliverable_id, body)
    if not deliverable:
        return error_response(404, "not_found", "Deliverable not found")
    return json_response(200, {"deliverable": deliverable})


def remove(deliverable_id: str, auth: dict):
    existing = get_deliverable(deliverable_id)
    if not existing:
        return error_response(404, "not_found", "Deliverable not found")
    if auth.get("role") == "employee":
        return forbidden()
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    if not delete_deliverable(deliverable_id):
        return error_response(404, "not_found", "Deliverable not found")
    return no_content()


def _can_manage_dependency(deliverable_id: str, auth: dict):
    """Returns (deliverable, error_response). Manager must lead the dependent's project."""
    deliverable = get_deliverable(deliverable_id)
    if not deliverable:
        return None, error_response(404, "not_found", "Deliverable not found")
    if auth.get("role") == "employee":
        return None, forbidden()
    if auth.get("role") == "manager" and not is_project_lead(deliverable["project_id"], auth.get("employee_id")):
        return None, forbidden()
    return deliverable, None


def list_deps(query: dict, auth: dict):
    deliverable_id = query.get("deliverable_id")
    if deliverable_id and not is_valid_uuid(deliverable_id):
        return error_response(400, "validation_error", "Invalid deliverable_id")
    dependencies = list_deliverable_dependencies(deliverable_id)
    return json_response(200, {"dependencies": dependencies, "count": len(dependencies)})


def create_dep(body: dict, auth: dict):
    body = dict(body or {})
    missing = require_fields(body, ["deliverable_id", "depends_on_deliverable_id"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    if not is_valid_uuid(body.get("deliverable_id")):
        return error_response(400, "validation_error", "Invalid deliverable_id")
    if not is_valid_uuid(body.get("depends_on_deliverable_id")):
        return error_response(400, "validation_error", "Invalid depends_on_deliverable_id")
    _, denied = _can_manage_dependency(body["deliverable_id"], auth)
    if denied:
        return denied
    if not get_deliverable(body["depends_on_deliverable_id"]):
        return error_response(404, "not_found", "Upstream deliverable not found")
    dependency = create_deliverable_dependency(body)
    return json_response(201, {"dependency": dependency})


def update_dep(dependency_id: str, body: dict, auth: dict):
    body = dict(body or {})
    existing = get_deliverable_dependency(dependency_id)
    if not existing:
        return error_response(404, "not_found", "Dependency not found")
    for field in ("deliverable_id", "depends_on_deliverable_id"):
        if field in body and not is_valid_uuid(body[field]):
            return error_response(400, "validation_error", f"Invalid {field}")
    _, denied = _can_manage_dependency(str(existing["deliverable_id"]), auth)
    if denied:
        return denied
    dependency = update_deliverable_dependency(dependency_id, body)
    if not dependency:
        return error_response(404, "not_found", "Dependency not found")
    return json_response(200, {"dependency": dependency})


def remove_dep(dependency_id: str, auth: dict):
    existing = get_deliverable_dependency(dependency_id)
    if not existing:
        return error_response(404, "not_found", "Dependency not found")
    _, denied = _can_manage_dependency(str(existing["deliverable_id"]), auth)
    if denied:
        return denied
    if not delete_deliverable_dependency(dependency_id):
        return error_response(404, "not_found", "Dependency not found")
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
