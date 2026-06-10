"""Parse Lambda Function URL events into HTTP request parts."""

import json
from urllib.parse import parse_qs, urlparse


def parse_event(event: dict | None, service_name: str) -> dict:
    """
    Parse a Lambda Function URL v2 event into routing components.

    Returns dict with: method, path, body, query, headers, raw_path
    """
    event = event or {}
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}

    if "requestContext" in event and "http" in event["requestContext"]:
        method = event["requestContext"]["http"].get("method", "GET")
        raw_path = event.get("rawPath", "/")
    else:
        method = event.get("httpMethod", "GET")
        raw_path = event.get("path", "/")

    prefix = f"/api/{service_name}"
    if raw_path.startswith(prefix):
        path = raw_path[len(prefix):] or "/"
    else:
        path = raw_path or "/"

    if not path.startswith("/"):
        path = "/" + path

    body = {}
    raw_body = event.get("body")
    if raw_body:
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            body = {}

    query_params = event.get("queryStringParameters") or {}
    if not query_params and event.get("rawQueryString"):
        parsed = parse_qs(event["rawQueryString"], keep_blank_values=True)
        query_params = {k: (v[0] if len(v) == 1 else v) for k, v in parsed.items()}

    return {
        "method": method.upper(),
        "path": path.rstrip("/") if path != "/" else path,
        "body": body,
        "query": query_params,
        "headers": headers,
        "raw_path": raw_path,
    }


def match_path(pattern_parts: list[str], path: str) -> dict | None:
    """
    Match a path like /projects/{id}/summary against pattern ['projects', '{id}', 'summary'].
    Returns captured params or None if no match.
    """
    path_parts = [p for p in path.split("/") if p]
    if len(path_parts) != len(pattern_parts):
        return None
    params = {}
    for actual, pattern in zip(path_parts, pattern_parts):
        if pattern.startswith("{") and pattern.endswith("}"):
            params[pattern[1:-1]] = actual
        elif actual != pattern:
            return None
    return params
