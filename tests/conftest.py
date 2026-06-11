import os
import pytest
import requests

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3001")
USERNAME = os.environ.get("TEST_USERNAME", "admin@acme.com")
PASSWORD = os.environ.get("TEST_PASSWORD", "admin123")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def auth_token(base_url):
    # Try common login endpoints to obtain a JWT token. Allow override via TEST_JWT env var.
    token = os.environ.get("TEST_JWT")
    if token:
        return token

    login_paths = ["/auth/login", "/login", "/api/auth/login", "/api/login"]
    for p in login_paths:
        try:
            resp = requests.post(base_url.rstrip("/") + p, json={"username": USERNAME, "password": PASSWORD}, timeout=5)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    token = data.get("token") or data.get("access_token") or data.get("jwt")
                    if token:
                        return token
                except Exception:
                    # non-json response but 200 — return raw text as token fallback
                    text = resp.text.strip()
                    if text:
                        return text
        except Exception:
            continue

    pytest.skip("No login endpoint responding with token; set TEST_JWT or provide working credentials/login path")
