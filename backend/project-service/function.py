"""Project service — CRUD and summary endpoints."""

import logging
from datetime import date

from auth_jwt import get_auth_context
from http_router import match_path, parse_event
from postgres_service import (
    create_project,
    delete_project,
    get_project,
    get_project_summary,
    list_projects,
    update_project,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, parse_percent, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "project-service"
VALID_STAGES = {"planning", "active", "on_hold", "completed", "cancelled"}
VALID_DELIVERABLE_STATUSES = {"pending", "in_progress", "completed"}


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if req["method"] == "OPTIONS":
            return preflight_response()

        auth = get_auth_context(req["headers"])
        if not auth:
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path, body, query = req["method"], req["path"], req["body"], req["query"]

        subpath = path.lstrip("/")
        summary_match = match_path(["{id}", "summary"], subpath)
        if summary_match and method == "GET":
            return get_summary(summary_match["id"])

        if path == "/":
            if method == "GET":
                return list_all(query)
            if method == "POST":
                return create(body)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path.startswith("/") and len(path) > 1:
            project_id = path[1:]
            if not is_valid_uuid(project_id):
                return error_response(400, "validation_error", "Invalid project ID")
            if method == "GET":
                return get_one(project_id)
            if method == "PUT":
                return update(project_id, body)
            if method == "DELETE":
                return remove(project_id)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def list_all(query: dict):
    projects = list_projects(query.get("stage"), query.get("rag_status"), query.get("search"))
    return json_response(200, {"projects": projects, "count": len(projects)})


def create(body: dict):
    missing = require_fields(body, ["name", "project_manager_id"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    if not is_valid_uuid(body["project_manager_id"]):
        return error_response(400, "validation_error", "Invalid project_manager_id")
    if body.get("stage") and body["stage"] not in VALID_STAGES:
        return error_response(400, "validation_error", "Invalid project stage")
    pct, err = parse_percent(body.get("actual_completion_percent", 0), "actual_completion_percent")
    if err:
        return error_response(400, "validation_error", err)
    if pct is not None:
        body["actual_completion_percent"] = pct
    validation_error = validate_initial_deliverables(body)
    if validation_error:
        return validation_error
    project = create_project(body)
    return json_response(201, {"project": project})


def get_one(project_id: str):
    project = get_project(project_id)
    if not project:
        return error_response(404, "not_found", "Project not found")
    return json_response(200, {"project": project})


def get_summary(project_id: str):
    if not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project ID")
    summary = get_project_summary(project_id)
    if not summary:
        return error_response(404, "not_found", "Project not found")
    return json_response(200, {"summary": summary})


def update(project_id: str, body: dict):
    if body.get("project_manager_id") and not is_valid_uuid(body["project_manager_id"]):
        return error_response(400, "validation_error", "Invalid project_manager_id")
    if body.get("stage") and body["stage"] not in VALID_STAGES:
        return error_response(400, "validation_error", "Invalid project stage")
    if "actual_completion_percent" in body:
        pct, err = parse_percent(body["actual_completion_percent"], "actual_completion_percent")
        if err:
            return error_response(400, "validation_error", err)
        body["actual_completion_percent"] = pct
    project = update_project(project_id, body)
    if not project:
        return error_response(404, "not_found", "Project not found")
    return json_response(200, {"project": project})


def remove(project_id: str):
    if not delete_project(project_id):
        return error_response(404, "not_found", "Project not found")
    return no_content()


def validate_initial_deliverables(body: dict):
    deliverables = body.get("deliverables")
    if deliverables is None:
        return None
    if not isinstance(deliverables, list):
        return error_response(400, "validation_error", "deliverables must be an array")
    for index, deliverable in enumerate(deliverables):
        if not isinstance(deliverable, dict):
            return error_response(400, "validation_error", "Each deliverable must be an object", {"index": index})
        missing = require_fields(deliverable, ["title", "due_date"])
        if missing:
            return error_response(
                400,
                "validation_error",
                "Missing required deliverable fields",
                {"index": index, "fields": missing},
            )
        employee_id = deliverable.get("employee_id", deliverable.get("assigned_employee_id"))
        if employee_id in ("", None):
            deliverable["employee_id"] = None
        elif not is_valid_uuid(employee_id):
            return error_response(400, "validation_error", "Invalid deliverable employee_id", {"index": index})
        if deliverable.get("status") and deliverable["status"] not in VALID_DELIVERABLE_STATUSES:
            return error_response(400, "validation_error", "Invalid deliverable status", {"index": index})
        try:
            date.fromisoformat(str(deliverable["due_date"]))
        except (TypeError, ValueError):
            return error_response(400, "validation_error", "Deliverable due_date must be an ISO date", {"index": index})
    return None
