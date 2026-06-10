"""Dashboard domain — portfolio-level read models."""

from pg_connection import get_connection


def _rag_label(status: str | None) -> str:
    return {
        "green": "Green",
        "amber": "Amber",
        "red": "Red",
    }.get(str(status or "").lower(), "Green")


def _project_summary(row: dict) -> dict:
    budget_used_percent = float(row.get("budget_used_percent") or 0)
    hours_used_percent = float(row.get("hours_used_percent") or 0)
    return {
        **row,
        "id": row.get("project_id"),
        "rag_status": _rag_label(row.get("rag_status")),
        "progress_gap": float(row.get("rag_progress_gap") or 0),
        "burn_percent": max(budget_used_percent, hours_used_percent),
        "budget_used_percent": budget_used_percent,
        "hours_used_percent": hours_used_percent,
    }


def get_portfolio_dashboard() -> dict:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_portfolio_dashboard")
        dashboard = cur.fetchone() or {}
        cur.execute(
            """
            SELECT rag_status, COUNT(*) AS count
            FROM projects
            GROUP BY rag_status
            ORDER BY rag_status
            """
        )
        rag_rows = cur.fetchall()
        cur.execute(
            """
            SELECT rag_status, COUNT(*) AS count
            FROM projects
            WHERE stage = 'active'
            GROUP BY rag_status
            ORDER BY rag_status
            """
        )
        active_rag_rows = cur.fetchall()
        cur.execute("SELECT * FROM v_project_summary ORDER BY rag_progress_gap DESC, name")
        projects = [_project_summary(row) for row in cur.fetchall()]

    rag_breakdown = {"Green": 0, "Amber": 0, "Red": 0}
    for row in rag_rows:
        rag_breakdown[_rag_label(row.get("rag_status"))] = int(row.get("count") or 0)

    active_rag_breakdown = {"Green": 0, "Amber": 0, "Red": 0}
    for row in active_rag_rows:
        active_rag_breakdown[_rag_label(row.get("rag_status"))] = int(row.get("count") or 0)

    active_project_count = int(dashboard.get("active_projects") or 0)
    total_project_count = int(dashboard.get("total_projects") or 0)

    return {
        "project_count": active_project_count,
        "active_project_count": active_project_count,
        "total_project_count": total_project_count,
        "rag_breakdown": rag_breakdown,
        "active_rag_breakdown": active_rag_breakdown,
        "total_allocated_budget": dashboard.get("total_allocated_budget", 0),
        "total_budget_used": dashboard.get("total_budget_used", 0),
        "total_allocated_hours": dashboard.get("total_allocated_hours", 0),
        "total_hours_used": dashboard.get("total_hours_used", 0),
        "overallocated_employees": dashboard.get("overallocated_employee_count", 0),
        "total_deliverables": int(dashboard.get("total_deliverables") or 0),
        "completed_deliverables": int(dashboard.get("completed_deliverables") or 0),
        "unassigned_deliverables": int(dashboard.get("unassigned_deliverables") or 0),
        "at_risk_projects": [p for p in projects if p["rag_status"] == "Red"],
        "projects": projects,
    }


def get_overallocations() -> list:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_employee_allocation_summary
            WHERE is_overallocated = TRUE
            ORDER BY allocation_percent DESC
            """
        )
        return cur.fetchall()


def get_projects_at_risk() -> list:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_project_summary
            WHERE rag_status IN ('amber', 'red')
            ORDER BY rag_progress_gap DESC
            """
        )
        return [_project_summary(row) for row in cur.fetchall()]
