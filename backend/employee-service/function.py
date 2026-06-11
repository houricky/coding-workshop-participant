"""Employee service — CRUD endpoints."""

import logging

from auth_jwt import get_auth_context
from http_router import parse_event
from postgres_service import create_employee, delete_employee, get_employee, list_employees, update_employee
from responses import error_response, json_response, no_content, preflight_response
from validators import is_valid_email, is_valid_uuid, parse_bool, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "employee-service"


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
                return list_all(query)
            if method == "POST":
                if auth.get("role") != "admin":
                    return forbidden()
                return create(body)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        if path.startswith("/") and len(path) > 1:
            employee_id = path[1:]
            if not is_valid_uuid(employee_id):
                return error_response(400, "validation_error", "Invalid employee ID")
            if method == "GET":
                return get_one(employee_id)
            if method == "PUT":
                if auth.get("role") != "admin":
                    return forbidden()
                return update(employee_id, body)
            if method == "DELETE":
                if auth.get("role") != "admin":
                    return forbidden()
                return remove(employee_id)
            return error_response(405, "method_not_allowed", f"{method} not allowed")

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def forbidden():
    return error_response(403, "forbidden", "You do not have permission to perform this action")


def list_all(query: dict):
    department = query.get("department")
    is_active = parse_bool(query.get("is_active"))
    is_direct_staff = parse_bool(query.get("is_direct_staff"))
    search = query.get("search")
    role = query.get("role")
    work_location = query.get("work_location")
    if role and role not in ("admin", "manager", "employee"):
        return error_response(400, "validation_error", "Invalid role")
    if work_location and work_location not in ("remote", "on_site"):
        return error_response(400, "validation_error", "Invalid work_location")
    employees = list_employees(department, is_active, search, role, is_direct_staff, work_location)
    return json_response(200, {"employees": employees, "count": len(employees)})


def create(body: dict):
    missing = require_fields(body, ["first_name", "last_name"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})
    if body.get("email") and not is_valid_email(body["email"]):
        return error_response(400, "validation_error", "Invalid email format")
    validation_error = validate_employee_attributes(body)
    if validation_error:
        return validation_error
    employee = create_employee(body)
    return json_response(201, {"employee": employee})


def get_one(employee_id: str):
    employee = get_employee(employee_id)
    if not employee:
        return error_response(404, "not_found", "Employee not found")
    return json_response(200, {"employee": employee})


def update(employee_id: str, body: dict):
    if body.get("email") and not is_valid_email(body["email"]):
        return error_response(400, "validation_error", "Invalid email format")
    validation_error = validate_employee_attributes(body)
    if validation_error:
        return validation_error
    employee = update_employee(employee_id, body)
    if not employee:
        return error_response(404, "not_found", "Employee not found")
    return json_response(200, {"employee": employee})


def remove(employee_id: str):
    if not delete_employee(employee_id):
        return error_response(404, "not_found", "Employee not found")
    return no_content()


def validate_employee_attributes(body: dict):
    if body.get("role") and body["role"] not in ("manager", "employee"):
        return error_response(400, "validation_error", "Employee role must be manager or employee")
    if body.get("work_location") and body["work_location"] not in ("remote", "on_site"):
        return error_response(400, "validation_error", "Invalid work_location")
    return None
