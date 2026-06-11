"""Budget service — project budget CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import (
    create_budget,
    delete_budget,
    get_budget,
    is_employee_allocated,
    is_project_lead,
    list_budgets,
    update_budget,
)
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_uuid, parse_positive_number, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "budget-service"


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
            budget_id = path[1:]
            if not is_valid_uuid(budget_id):
                return error_response(400, "validation_error", "Invalid budget ID")
            if method == "GET":
                return get_one(budget_id, auth)
            if method == "PUT":
                return update(budget_id, body, auth)
            if method == "DELETE":
                return remove(budget_id, auth)
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
    budgets = list_budgets(project_id, allocated_employee_id)
    return json_response(200, {"budgets": budgets, "count": len(budgets)})


def create(body: dict, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    missing = require_fields(body, ["project_id", "allocated_budget"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    if not is_valid_uuid(body["project_id"]):
        return error_response(400, "validation_error", "Invalid project_id")
    amount, err = parse_positive_number(body["allocated_budget"], "allocated_budget")
    if err:
        return error_response(400, "validation_error", err)
    body["allocated_budget"] = amount
    if auth.get("role") == "manager" and not is_project_lead(body["project_id"], auth.get("employee_id")):
        return forbidden()
    budget = create_budget(body)
    return json_response(201, {"budget": budget})


def get_one(budget_id: str, auth: dict):
    budget = get_budget(budget_id)
    if not budget:
        return error_response(404, "not_found", "Budget not found")
    if auth.get("role") == "employee" and not is_employee_allocated(budget["project_id"], auth.get("employee_id")):
        return forbidden()
    return json_response(200, {"budget": budget})


def update(budget_id: str, body: dict, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    existing = get_budget(budget_id)
    if not existing:
        return error_response(404, "not_found", "Budget not found")
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    if "allocated_budget" in body:
        amount, err = parse_positive_number(body["allocated_budget"], "allocated_budget")
        if err:
            return error_response(400, "validation_error", err)
        body["allocated_budget"] = amount
    budget = update_budget(budget_id, body)
    if not budget:
        return error_response(404, "not_found", "Budget not found")
    return json_response(200, {"budget": budget})


def remove(budget_id: str, auth: dict):
    if auth.get("role") == "employee":
        return forbidden()
    existing = get_budget(budget_id)
    if not existing:
        return error_response(404, "not_found", "Budget not found")
    if auth.get("role") == "manager" and not is_project_lead(existing["project_id"], auth.get("employee_id")):
        return forbidden()
    if not delete_budget(budget_id):
        return error_response(404, "not_found", "Budget not found")
    return no_content()
