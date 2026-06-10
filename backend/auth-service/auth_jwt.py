"""JWT and password utilities for authentication."""

import os
import hmac
import logging
from datetime import datetime, timedelta, timezone

import jwt

logger = logging.getLogger(__name__)


def _bcrypt_module():
    try:
        import bcrypt
        return bcrypt
    except Exception:
        logger.exception("Unable to load bcrypt password backend")
        return None


def _crypt_hash(password: str, salt: str | None = None) -> str:
    try:
        import crypt
    except ImportError as exc:
        raise RuntimeError("No password hashing backend available") from exc

    if salt is None:
        method = getattr(crypt, "METHOD_BLOWFISH", None)
        if method is None:
            raise RuntimeError("bcrypt hashing backend unavailable")
        salt = crypt.mksalt(method)

    hashed = crypt.crypt(password, salt)
    if not hashed:
        raise RuntimeError("Password hashing failed")
    return hashed


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    bcrypt = _bcrypt_module()
    if bcrypt:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")
    return _crypt_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    bcrypt = _bcrypt_module()
    if bcrypt:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    return hmac.compare_digest(_crypt_hash(password, password_hash), password_hash)


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", os.getenv("APP_ID", "acme-dev-secret"))


def create_token(user_id: str, role: str, hours: int = 24) -> str:
    """Create a signed JWT for the given user."""
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns claims or None."""
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def extract_bearer_token(headers: dict) -> str | None:
    """Extract Bearer token from request headers."""
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_auth_context(headers: dict) -> dict | None:
    """Return auth context {user_id, role} from Authorization header."""
    token = extract_bearer_token(headers)
    if not token:
        return None
    claims = decode_token(token)
    if not claims:
        return None
    return {"user_id": claims.get("sub"), "role": claims.get("role")}
