"""Auth service — register, login, and profile endpoints."""

import logging

from auth_jwt import create_token, get_auth_context, hash_password, verify_password
from http_router import parse_event
from postgres_service import create_user, get_user_by_email, get_user_by_id
from responses import error_response, json_response, preflight_response
from validators import parse_email, parse_password, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "auth-service"


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        method, path, body, headers = req["method"], req["path"], req["body"], req["headers"]
        if method == "OPTIONS":
            return preflight_response()

        if method == "POST" and path == "/register":
            return register(body)
        if method == "POST" and path == "/login":
            return login(body)
        if method == "GET" and path == "/me":
            return me(headers)

        return error_response(404, "not_found", f"No route for {method} {path}")
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.exception("Handler error")
        return error_response(500, "internal_error", str(e))


def register(body: dict):
    missing = require_fields(body, ["email", "password"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})

    email, email_err = parse_email(body.get("email"))
    if email_err:
        return error_response(400, "validation_error", email_err)
    password, password_err = parse_password(body.get("password"))
    if password_err:
        return error_response(400, "validation_error", password_err)

    role = body.get("role", "employee")
    if role not in ("admin", "manager", "employee"):
        return error_response(400, "validation_error", "Invalid role")
    if role == "admin":
        return error_response(400, "validation_error", "The admin account is managed by the system")

    employee_id = body.get("employee_id")
    user = create_user(email, hash_password(password), role, employee_id)
    token = create_token(user["id"], user["role"])
    return json_response(201, {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "employee_id": user.get("employee_id"),
        },
    })


def login(body: dict):
    missing = require_fields(body, ["email", "password"])
    if missing:
        return error_response(400, "validation_error", "Missing required fields", {"fields": missing})

    email, email_err = parse_email(body.get("email"))
    if email_err:
        return error_response(400, "validation_error", email_err)
    password, password_err = parse_password(body.get("password"))
    if password_err:
        return error_response(400, "validation_error", password_err)

    user = get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return error_response(401, "unauthorized", "Invalid email or password")

    token = create_token(user["id"], user["role"])
    return json_response(200, {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "employee_id": user.get("employee_id"),
        },
    })


def me(headers: dict):
    auth = get_auth_context(headers)
    if not auth:
        return error_response(401, "unauthorized", "Missing or invalid token")

    user = get_user_by_id(auth["user_id"])
    if not user:
        return error_response(404, "not_found", "User not found")
    return json_response(200, {"user": user})


if __name__ == "__main__":
    print(handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/api/auth-service/me"}))
