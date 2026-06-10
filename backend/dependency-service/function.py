"""Dependency service — project dependency CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_dependency,
    delete_dependency,
    get_dependency,
    list_dependencies,
    update_dependency,
)
from responses import error_response, json_response, no_content
from validators import is_valid_uuid, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "dependency-service"


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
            dependency_id = path[1:]
            if not is_valid_uuid(dependency_id):
                return error_response(400, "validation_error", "Invalid dependency ID")
            if method == "GET":
                return get_one(dependency_id)
            if method == "PUT":
                return update(dependency_id, body)
            if method == "DELETE":
                return remove(dependency_id)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def list_all(query: dict):
    project_id = query.get("project_id")
    if project_id and not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project_id")
    deps = list_dependencies(project_id)
    return json_response(200, {"dependencies": deps, "count": len(deps)})


def create(body: dict):
    missing = require_fields(body, ["project_id", "depends_on_project_id"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    for field in ("project_id", "depends_on_project_id"):
        if not is_valid_uuid(body[field]):
            return error_response(400, "validation_error", f"Invalid {field}")
    dep = create_dependency(body)
    return json_response(201, {"dependency": dep})


def get_one(dependency_id: str):
    dep = get_dependency(dependency_id)
    if not dep:
        return error_response(404, "not_found", "Dependency not found")
    return json_response(200, {"dependency": dep})


def update(dependency_id: str, body: dict):
    dep = update_dependency(dependency_id, body)
    if not dep:
        return error_response(404, "not_found", "Dependency not found")
    return json_response(200, {"dependency": dep})


def remove(dependency_id: str):
    if not delete_dependency(dependency_id):
        return error_response(404, "not_found", "Dependency not found")
    return no_content()
