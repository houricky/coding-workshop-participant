"""Project service — CRUD and summary endpoints."""

import logging

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
from responses import error_response, json_response, no_content
from validators import is_valid_uuid, parse_percent, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "project-service"
VALID_STAGES = {"planning", "active", "on_hold", "completed", "cancelled"}


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
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
    missing = require_fields(body, ["name"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    if body.get("stage") and body["stage"] not in VALID_STAGES:
        return error_response(400, "validation_error", "Invalid project stage")
    pct, err = parse_percent(body.get("actual_completion_percent", 0), "actual_completion_percent")
    if err:
        return error_response(400, "validation_error", err)
    if pct is not None:
        body["actual_completion_percent"] = pct
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
