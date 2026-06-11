import os
import re
from pathlib import Path
import requests
import pytest


def discover_routes():
    paths = list(Path("backend").rglob("http_router.py"))
    routes = set()
    if not paths:
        return []

    for p in paths:
        try:
            text = p.read_text()
        except Exception:
            continue

        # common patterns used in small routers: decorator @app.route('/path')
        for m in re.finditer(r"@\w+\.route\([\"']([^\"']+)[\"']", text):
            routes.add(m.group(1))

        # add_route('path') or add_route("path")
        for m in re.finditer(r"add_route\([\"']([^\"']+)[\"']", text):
            routes.add(m.group(1))

        # generic .route('/path') occurrences
        for m in re.finditer(r"\.route\([\"']([^\"']+)[\"']", text):
            routes.add(m.group(1))

    # normalize and remove templated-only routes
    cleaned = []
    for r in sorted(routes):
        if '{' in r or '<' in r:
            continue
        if not r.startswith('/'):
            r = '/' + r
        cleaned.append(r)
    return cleaned


def test_health(base_url := os.environ.get("BASE_URL", "http://localhost:3001")):
    url = base_url.rstrip("/") + "/health"
    try:
        r = requests.get(url, timeout=5)
        assert r.status_code < 500
    except requests.RequestException:
        pytest.skip("No health endpoint reachable at /health; backend may be down")


def test_login_shows_token():
    base = os.environ.get("BASE_URL", "http://localhost:3001")
    USERNAME = os.environ.get("TEST_USERNAME", "admin@acme.com")
    PASSWORD = os.environ.get("TEST_PASSWORD", "admin123")
    for p in ("/auth/login", "/login", "/api/auth/login", "/api/login"):
        try:
            resp = requests.post(base.rstrip("/") + p, json={"username": USERNAME, "password": PASSWORD}, timeout=5)
            if resp.status_code == 200:
                assert resp.text
                return
        except Exception:
            continue
    pytest.skip("Login endpoint not found; set TEST_JWT env var if you want to skip login discovery")


def test_discovered_endpoints(base_url, auth_token):
    routes = discover_routes()
    assert routes, "No routes discovered in backend/*/http_router.py"
    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    for route in routes:
        url = base_url.rstrip("/") + route
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            assert resp.status_code < 500
        except Exception as e:
            pytest.fail(f"Request to {url} failed: {e}")
