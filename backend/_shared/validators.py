"""Input validation helpers."""

import re
import uuid


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def require_fields(data: dict, fields: list[str]) -> list[str]:
    """Return list of missing required field names."""
    missing = []
    for field in fields:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    return missing


def is_valid_email(email: str) -> bool:
    """Validate email format."""
    return bool(email and EMAIL_RE.match(email))


def parse_email(value, field_name: str = "email") -> tuple[str | None, str | None]:
    """Normalize and validate an email. Returns (email, error_message)."""
    if not isinstance(value, str):
        return None, f"{field_name} must be a string"
    email = value.strip().lower()
    if not email:
        return None, f"{field_name} is required"
    if not is_valid_email(email):
        return None, "Invalid email format"
    return email, None


def parse_password(value, min_length: int = 6, field_name: str = "password") -> tuple[str | None, str | None]:
    """Validate a password string. Returns (password, error_message)."""
    if not isinstance(value, str):
        return None, f"{field_name} must be a string"
    if len(value) < min_length:
        return None, f"Password must be at least {min_length} characters"
    return value, None


def is_valid_uuid(value: str) -> bool:
    """Validate UUID string format."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False


def parse_bool(value) -> bool | None:
    """Parse boolean from string or bool."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("true", "1", "yes")


def parse_percent(value, field_name: str = "percent") -> tuple[float | None, str | None]:
    """Validate a 0-100 percent value. Returns (value, error_message)."""
    if value is None:
        return None, None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None, f"{field_name} must be a number"
    if num < 0 or num > 100:
        return None, f"{field_name} must be between 0 and 100"
    return num, None


def parse_positive_number(value, field_name: str) -> tuple[float | None, str | None]:
    """Validate a positive numeric value."""
    if value is None:
        return None, f"{field_name} is required"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None, f"{field_name} must be a number"
    if num <= 0:
        return None, f"{field_name} must be greater than 0"
    return num, None
