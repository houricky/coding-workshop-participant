"""AI service — Claude-powered portfolio insights, chat, and usage parsing."""

import logging
from datetime import date

from anthropic_client import AnthropicError, complete, is_configured, parse_json_response
from auth_jwt import get_auth_context
from context_builder import (
    build_chat_context,
    context_json,
    get_project_context,
    get_usage_parse_context,
)
from http_router import parse_event
from prompts import CHAT_SYSTEM, EXPLAIN_PROJECT_SYSTEM, PARSE_USAGE_SYSTEM
from responses import error_response, json_response, preflight_response
from validators import is_valid_uuid, require_fields

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE_NAME = "ai-service"


def handler(event=None, context=None):
    try:
        req = parse_event(event, SERVICE_NAME)
        if req["method"] == "OPTIONS":
            return preflight_response()

        if not get_auth_context(req["headers"]):
            return error_response(401, "unauthorized", "Missing or invalid token")

        method, path = req["method"], req["path"]

        if method == "GET" and path == "/health":
            return health()
        if method == "POST" and path == "/explain-project":
            return explain_project(req["body"])
        if method == "POST" and path == "/chat":
            return chat(req["body"])
        if method == "POST" and path == "/parse-usage":
            return parse_usage(req["body"])

        return error_response(404, "not_found", f"No route for {method} {path}")
    except AnthropicError as e:
        status = e.status or 502
        return error_response(status, "ai_error", str(e))
    except ValueError as e:
        return error_response(400, "validation_error", str(e))
    except Exception as e:
        logger.error("Handler error: %s", e)
        return error_response(500, "internal_error", str(e))


def health():
    return json_response(200, {
        "service": SERVICE_NAME,
        "anthropic_configured": is_configured(),
    })


def explain_project(body: dict):
    missing = require_fields(body, ["project_id"])
    if missing:
        return error_response(400, "validation_error", f"Missing fields: {', '.join(missing)}")

    project_id = body["project_id"]
    if not is_valid_uuid(project_id):
        return error_response(400, "validation_error", "Invalid project ID")

    ctx = get_project_context(project_id)
    if not ctx:
        return error_response(404, "not_found", "Project not found")

    if not is_configured():
        return error_response(503, "ai_unavailable", "ANTHROPIC_API_KEY is not configured")

    user_msg = f"Explain this project's health and recommend next steps.\n\nContext:\n{context_json(ctx)}"
    raw = complete(EXPLAIN_PROJECT_SYSTEM, user_msg, max_tokens=800)
    insight = parse_json_response(raw)
    return json_response(200, {"insight": insight, "project_id": project_id})


def chat(body: dict):
    missing = require_fields(body, ["message"])
    if missing:
        return error_response(400, "validation_error", f"Missing fields: {', '.join(missing)}")

    message = str(body["message"]).strip()
    if not message:
        return error_response(400, "validation_error", "message cannot be empty")

    if not is_configured():
        return error_response(503, "ai_unavailable", "ANTHROPIC_API_KEY is not configured")

    history = body.get("history") or []
    if not isinstance(history, list):
        history = []

    intent, ctx = build_chat_context(message)
    history_text = ""
    if history:
        turns = history[-4:]
        history_text = "Recent conversation:\n" + "\n".join(
            f"{t.get('role', 'user')}: {t.get('content', '')}" for t in turns
        ) + "\n\n"

    user_msg = (
        f"{history_text}"
        f"User question: {message}\n\n"
        f"Detected intent: {intent}\n\n"
        f"Context:\n{context_json(ctx)}"
    )
    raw = complete(CHAT_SYSTEM, user_msg, max_tokens=900)
    result = parse_json_response(raw)
    return json_response(200, {
        "answer": result.get("answer", raw),
        "sources": result.get("sources", []),
        "intent": intent,
    })


def parse_usage(body: dict):
    missing = require_fields(body, ["text"])
    if missing:
        return error_response(400, "validation_error", f"Missing fields: {', '.join(missing)}")

    text = str(body["text"]).strip()
    if not text:
        return error_response(400, "validation_error", "text cannot be empty")

    if not is_configured():
        return error_response(503, "ai_unavailable", "ANTHROPIC_API_KEY is not configured")

    ctx = get_usage_parse_context()
    today = date.today().isoformat()
    user_msg = (
        f"Today's date: {today}\n"
        f"User entry: {text}\n\n"
        f"Context:\n{context_json(ctx)}"
    )
    raw = complete(PARSE_USAGE_SYSTEM, user_msg, max_tokens=600)
    parsed = parse_json_response(raw)
    return json_response(200, {"parsed": parsed})
