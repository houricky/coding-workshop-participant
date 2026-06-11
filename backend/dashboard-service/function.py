"""Dashboard service — portfolio metrics endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import get_overallocations, get_portfolio_dashboard, get_projects_at_risk
from responses import error_response, json_response, preflight_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "dashboard-service"


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if req["method"] == "OPTIONS":
            return preflight_response()

        auth = get_auth_context(req["headers"])
        if not auth:
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path = req["method"], req["path"]

        if method == "GET" and path == "/":
            return portfolio(auth)
        if method == "GET" and path == "/overallocations":
            return overallocations(auth)
        if method == "GET" and path == "/projects-at-risk":
            return projects_at_risk(auth)

        return error_response(404, "not_found", f"No route for {method} {path}")
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def scoped_employee_id(auth: dict) -> str | None:
    return auth.get("employee_id") if auth.get("role") == "employee" else None


def portfolio(auth: dict):
    data = get_portfolio_dashboard(scoped_employee_id(auth))
    return json_response(200, data)


def overallocations(auth: dict):
    rows = get_overallocations(scoped_employee_id(auth))
    return json_response(200, {"overallocations": rows, "count": len(rows)})


def projects_at_risk(auth: dict):
    rows = get_projects_at_risk(scoped_employee_id(auth))
    return json_response(200, {"projects": rows, "count": len(rows)})
