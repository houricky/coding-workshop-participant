# Integration tests

Run the integration tests against a running backend (default http://localhost:3001).

Set environment variables to customize:

- `BASE_URL` — base URL of running backend (default `http://localhost:3001`)
- `TEST_USERNAME` / `TEST_PASSWORD` — credentials for login discovery (defaults provided)
- `TEST_JWT` — provide a JWT token to skip login discovery

Install dev requirements and run:

```bash
python -m pip install -r requirements-dev.txt
pytest tests/integration -q
```
