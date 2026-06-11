"""Anthropic Messages API client (stdlib HTTP only)."""

import json
import os
import urllib.error
import urllib.request


DEFAULT_MODEL_FAST = "claude-sonnet-4-6"
DEFAULT_MODEL_DEEP = "claude-opus-4-20250514"
API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class AnthropicError(Exception):
    """Raised when the Anthropic API returns an error."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def is_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


def get_model(deep: bool = False) -> str:
    if deep:
        return os.getenv("AI_MODEL_DEEP", DEFAULT_MODEL_DEEP)
    return os.getenv("AI_MODEL_FAST", DEFAULT_MODEL_FAST)


def complete(
    system: str,
    user: str,
    *,
    deep: bool = False,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    """Send a single user turn and return assistant text."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise AnthropicError("ANTHROPIC_API_KEY is not configured", status=503)

    payload = {
        "model": get_model(deep),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": API_VERSION,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AnthropicError(f"Anthropic API error: {detail}", status=exc.code) from exc
    except urllib.error.URLError as exc:
        raise AnthropicError(f"Anthropic API unreachable: {exc.reason}", status=502) from exc

    blocks = body.get("content") or []
    texts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
    return "\n".join(t for t in texts if t).strip()


def parse_json_response(text: str) -> dict:
    """Extract JSON object from model output (handles fenced code blocks)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return valid JSON")
    return json.loads(cleaned[start : end + 1])
