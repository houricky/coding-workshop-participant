"""RAG service — project health status endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import match_path, parse_event
from postgres_service import get_rag_details, recalculate_rag
from responses import error_response, json_response
from validators import is_valid_uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "rag-service"


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if not get_auth_context(req["headers"]):
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path = req["method"], req["path"]
        subpath = path.lstrip("/")

        get_match = match_path(["projects", "{id}"], subpath)
        if get_match and method == "GET":
            return get_rag(get_match["id"])

        recalc_match = match_path(["projects", "{id}", "recalculate"], subpath)
        if recalc_match and method == "POST":
            return recalculate(recalc_match["id"])

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def get_rag(project_id: str):
    if not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project ID")
    details = get_rag_details(project_id)
    if not details:
        return error_response(404, "not_found", "Project not found")
    return json_response(200, {"rag": details})


def recalculate(project_id: str):
    if not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project ID")
    details = recalculate_rag(project_id)
    if not details:
        return error_response(404, "not_found", "Project not found")
    return json_response(200, {"rag": details, "recalculated": True})
