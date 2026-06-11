"""Dependency service — project dependency CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_dependency,
    delete_dependency,
    get_dependency,
    is_employee_allocated,
    is_project_lead,
    list_dependencies,
    update_dependency,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "dependency-service"


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

        if path.startswith("/") and len(path) > 1:
            dependency_id = path[1:]
            if not is_valid_uuid(dependency_id):
                return error_response(400, "validation_error", "Invalid dependency ID")
            if method == "GET":
                return get_one(dependency_id, auth)
            if method == "PUT":
                return update(dependency_id, body, auth)
            if method == "DELETE":
                return remove(dependency_id, auth)
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
    if project_id and not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project_id")
    allocated_employee_id = auth.get("employee_id") if auth.get("role") == "employee" else None
    deps = list_dependencies(project_id, allocated_employee_id)
    return json_response(200, {"dependencies": deps, "count": len(deps)})


def create(body: dict, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    missing = require_fields(body, ["project_id", "depends_on_project_id"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    for field in ("project_id", "depends_on_project_id"):
        if not is_valid_uuid(body[field]):
            return error_response(400, "validation_error", f"Invalid {field}")
    if auth.get("role") == "manager" and not is_project_lead(body["project_id"], auth.get("employee_id")):
        return forbidden()
    dep = create_dependency(body)
    return json_response(201, {"dependency": dep})


def get_one(dependency_id: str, auth: dict):
    dep = get_dependency(dependency_id)
    if not dep:
        return error_response(404, "not_found", "Dependency not found")
    if auth.get("role") == "employee" and not is_employee_allocated(dep["project_id"], auth.get("employee_id")):
        return forbidden()
    return json_response(200, {"dependency": dep})


def update(dependency_id: str, body: dict, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    existing = get_dependency(dependency_id)
    if not existing:
        return error_response(404, "not_found", "Dependency not found")
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    dep = update_dependency(dependency_id, body)
    if not dep:
        return error_response(404, "not_found", "Dependency not found")
    return json_response(200, {"dependency": dep})


def remove(dependency_id: str, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    existing = get_dependency(dependency_id)
    if not existing:
        return error_response(404, "not_found", "Dependency not found")
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    if not delete_dependency(dependency_id):
        return error_response(404, "not_found", "Dependency not found")
    return no_content()
