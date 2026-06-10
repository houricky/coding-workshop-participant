"""Allocation service — resource allocation CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_allocation,
    delete_allocation,
    get_allocation,
    list_allocations,
    update_allocation,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, parse_positive_number, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "allocation-service"


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
            allocation_id = path[1:]
            if not is_valid_uuid(allocation_id):
                return error_response(400, "validation_error", "Invalid allocation ID")
            if method == "GET":
                return get_one(allocation_id)
            if method == "PUT":
                return update(allocation_id, body)
            if method == "DELETE":
                return remove(allocation_id)
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
    allocations = list_allocations(project_id, employee_id)
    return json_response(200, {"allocations": allocations, "count": len(allocations)})


def create(body: dict):
    missing = require_fields(body, ["project_id", "employee_id", "allocated_hours"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    for field in ("project_id", "employee_id"):
        if not is_valid_uuid(body[field]):
            return error_response(400, "validation_error", f"Invalid {field}")
    hours, err = parse_positive_number(body["allocated_hours"], "allocated_hours")
    if err:
        return error_response(400, "validation_error", err)
    body["allocated_hours"] = hours
    validation_error = validate_role(body)
    if validation_error:
        return validation_error
    allocation = create_allocation(body)
    return json_response(201, {"allocation": allocation})


def get_one(allocation_id: str):
    allocation = get_allocation(allocation_id)
    if not allocation:
        return error_response(404, "not_found", "Allocation not found")
    return json_response(200, {"allocation": allocation})


def update(allocation_id: str, body: dict):
    if "allocated_hours" in body:
        hours, err = parse_positive_number(body["allocated_hours"], "allocated_hours")
        if err:
            return error_response(400, "validation_error", err)
        body["allocated_hours"] = hours
    validation_error = validate_role(body)
    if validation_error:
        return validation_error
    allocation = update_allocation(allocation_id, body)
    if not allocation:
        return error_response(404, "not_found", "Allocation not found")
    return json_response(200, {"allocation": allocation})


def remove(allocation_id: str):
    if not delete_allocation(allocation_id):
        return error_response(404, "not_found", "Allocation not found")
    return no_content()


def validate_role(body: dict):
    if body.get("role_on_project") and body["role_on_project"] not in ("manager", "employee"):
        return error_response(400, "validation_error", "Project role must be manager or employee")
    return None
