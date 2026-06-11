"""Build grounded JSON context from PostgreSQL for AI prompts."""

import json
import re

from pg_connection import get_connection


def _row_list(rows: list) -> list:
    return rows or []


def get_project_context(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (project_id,))
        summary = cur.fetchone()
        if not summary:
            return None

        cur.execute(
            """
            SELECT pru.usage_date, pru.hours_used, pru.cost_amount, pru.description,
                   e.first_name, e.last_name
            FROM project_resource_usage pru
            JOIN employees e ON e.id = pru.employee_id
            WHERE pru.project_id = %s
            ORDER BY pru.usage_date DESC, pru.created_at DESC
            LIMIT 10
            """,
            (project_id,),
        )
        recent_usage = cur.fetchall()

        cur.execute(
            """
            SELECT pra.allocated_hours, pra.role_on_project,
                   e.first_name, e.last_name, eas.is_overallocated, eas.allocation_percent
            FROM project_resource_allocations pra
            JOIN employees e ON e.id = pra.employee_id
            LEFT JOIN v_employee_allocation_summary eas ON eas.employee_id = e.id
            WHERE pra.project_id = %s
            """,
            (project_id,),
        )
        allocations = cur.fetchall()

        cur.execute(
            """
            SELECT p.name AS depends_on_name, p.rag_status, p.rag_progress_gap, pd.dependency_type
            FROM project_dependencies pd
            JOIN projects p ON p.id = pd.depends_on_project_id
            WHERE pd.project_id = %s
            """,
            (project_id,),
        )
        dependencies = cur.fetchall()

        cur.execute(
            """
            SELECT p.name AS dependent_name, p.rag_status, p.rag_progress_gap
            FROM project_dependencies pd
            JOIN projects p ON p.id = pd.project_id
            WHERE pd.depends_on_project_id = %s
            """,
            (project_id,),
        )
        dependents = cur.fetchall()

    return {
        "project": summary,
        "recent_usage": _row_list(recent_usage),
        "allocations": _row_list(allocations),
        "dependencies": _row_list(dependencies),
        "dependents": _row_list(dependents),
    }


def get_portfolio_context() -> dict:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_portfolio_dashboard")
        dashboard = cur.fetchone()
        cur.execute(
            """
            SELECT name, stage, rag_status, rag_progress_gap,
                   budget_used_percent, hours_used_percent, actual_completion_percent
            FROM v_project_summary
            ORDER BY rag_progress_gap DESC
            LIMIT 20
            """
        )
        projects = cur.fetchall()
        cur.execute(
            """
            SELECT first_name, last_name, department, allocation_percent, project_count
            FROM v_employee_allocation_summary
            WHERE is_overallocated = TRUE
            ORDER BY allocation_percent DESC
            LIMIT 15
            """
        )
        overallocations = cur.fetchall()
        cur.execute(
            """
            SELECT name, rag_status, rag_progress_gap, budget_used_percent,
                   hours_used_percent, actual_completion_percent
            FROM v_project_summary
            WHERE rag_status IN ('amber', 'red')
            ORDER BY rag_progress_gap DESC
            """
        )
        at_risk = cur.fetchall()
    return {
        "dashboard": dashboard,
        "projects": _row_list(projects),
        "overallocations": _row_list(overallocations),
        "at_risk_projects": _row_list(at_risk),
    }


def find_projects_by_name(query: str, limit: int = 5) -> list:
    conn = get_connection()
    pattern = f"%{query.strip()}%"
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_project_summary
            WHERE name ILIKE %s
            ORDER BY name
            LIMIT %s
            """,
            (pattern, limit),
        )
        return cur.fetchall()


def get_usage_parse_context() -> dict:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, stage, rag_status
            FROM projects
            ORDER BY name
            """
        )
        projects = cur.fetchall()
        cur.execute(
            """
            SELECT id, first_name, last_name, email, is_active
            FROM employees
            WHERE is_active = TRUE
            ORDER BY last_name, first_name
            """
        )
        employees = cur.fetchall()
    return {"projects": _row_list(projects), "employees": _row_list(employees)}


def classify_chat_intent(message: str) -> str:
    text = message.lower()
    if any(w in text for w in ("overalloc", "over-alloc", "too many hours", "capacity")):
        return "overallocations"
    if any(w in text for w in ("red", "amber", "at risk", "at-risk", "attention", "risk")):
        return "at_risk"
    if any(w in text for w in ("summarize", "summary", "overview", "portfolio", "how are we", "health")):
        return "portfolio"
    if re.search(r"\bproject\b", text) or re.search(r"tell me about", text):
        return "project_lookup"
    return "portfolio"


def extract_project_query(message: str) -> str | None:
    text = message.strip()
    for prefix in (
        r"(?i)tell me about\s+",
        r"(?i)how is\s+",
        r"(?i)status of\s+",
        r"(?i)project\s+",
    ):
        m = re.search(prefix + r"(.+?)[\?\.!]?$", text)
        if m:
            return m.group(1).strip().strip("'\"")
    return None


def build_chat_context(message: str) -> tuple[str, dict]:
    intent = classify_chat_intent(message)
    ctx = get_portfolio_context()

    if intent == "project_lookup":
        fragment = extract_project_query(message) or message
        matches = find_projects_by_name(fragment)
        if matches:
            ctx = {"matched_projects": matches, "portfolio": get_portfolio_context()}
            intent = "project_detail"
        else:
            ctx = {"matched_projects": [], "portfolio": ctx, "search_query": fragment}

    return intent, ctx


def context_json(data: dict) -> str:
    return json.dumps(data, default=str)
