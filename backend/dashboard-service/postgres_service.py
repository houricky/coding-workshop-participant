"""Dashboard domain — portfolio-level read models."""

from pg_connection import get_connection


def _rag_label(status: str | None) -> str:
    return {
        "green": "Green",
        "amber": "Amber",
        "red": "Red",
    }.get(str(status or "").lower(), "Green")


def _stage_label(stage: str | None) -> str:
    return {
        "planning": "Planning",
        "active": "In progress",
        "on_hold": "On hold",
        "completed": "Completed",
        "cancelled": "Cancelled",
    }.get(str(stage or "").lower(), str(stage or "Unknown").replace("_", " ").title())


def _deliverable_status_label(status: str | None) -> str:
    return {
        "pending": "Pending",
        "in_progress": "In progress",
        "completed": "Completed",
    }.get(str(status or "").lower(), str(status or "Unknown").replace("_", " ").title())


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


def _project_chart_row(row: dict) -> dict:
    project = _project_summary(row)
    allocated_budget = float(project.get("allocated_budget") or 0)
    budget_used = float(project.get("budget_used") or 0)
    allocated_hours = float(project.get("allocated_hours") or 0)
    hours_used = float(project.get("hours_used") or 0)
    completion = float(project.get("actual_completion_percent") or 0)
    return {
        "id": project.get("id"),
        "name": project.get("name"),
        "stage": _stage_label(project.get("stage")),
        "rag_status": project.get("rag_status"),
        "allocated_budget": allocated_budget,
        "budget_used": budget_used,
        "budget_remaining": max(allocated_budget - budget_used, 0),
        "allocated_hours": allocated_hours,
        "hours_used": hours_used,
        "hours_remaining": max(allocated_hours - hours_used, 0),
        "budget_used_percent": project.get("budget_used_percent", 0),
        "hours_used_percent": project.get("hours_used_percent", 0),
        "burn_percent": project.get("burn_percent", 0),
        "completion_percent": completion,
        "progress_gap": project.get("progress_gap", 0),
    }


def _team_utilization_row(row: dict) -> dict:
    first = row.get("first_name") or ""
    last = row.get("last_name") or ""
    allocation_percent = float(row.get("allocation_percent") or 0)
    return {
        "id": row.get("employee_id"),
        "name": f"{first} {last}".strip() or row.get("email") or "Unknown",
        "role": row.get("role"),
        "department": row.get("department"),
        "allocated_hours": float(row.get("total_allocated_hours") or 0),
        "capacity_hours": float(row.get("weekly_capacity_hours") or 0),
        "utilization_percent": allocation_percent,
        "overallocated": bool(row.get("is_overallocated")),
        "project_count": int(row.get("project_count") or 0),
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
        cur.execute(
            """
            SELECT stage, COUNT(*) AS count
            FROM projects
            GROUP BY stage
            ORDER BY stage
            """
        )
        stage_rows = cur.fetchall()
        cur.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM project_deliverables
            GROUP BY status
            ORDER BY status
            """
        )
        deliverable_status_rows = cur.fetchall()
        cur.execute("SELECT * FROM v_project_summary ORDER BY rag_progress_gap DESC, name")
        projects = [_project_summary(row) for row in cur.fetchall()]
        cur.execute(
            """
            SELECT *
            FROM v_project_summary
            ORDER BY GREATEST(budget_used_percent, hours_used_percent) DESC, name
            """
        )
        project_chart_rows = [_project_chart_row(row) for row in cur.fetchall()]
        cur.execute(
            """
            SELECT *
            FROM v_employee_allocation_summary
            ORDER BY allocation_percent DESC, last_name, first_name
            """
        )
        team_utilization = [_team_utilization_row(row) for row in cur.fetchall()]

    rag_breakdown = {"Green": 0, "Amber": 0, "Red": 0}
    for row in rag_rows:
        rag_breakdown[_rag_label(row.get("rag_status"))] = int(row.get("count") or 0)

    active_rag_breakdown = {"Green": 0, "Amber": 0, "Red": 0}
    for row in active_rag_rows:
        active_rag_breakdown[_rag_label(row.get("rag_status"))] = int(row.get("count") or 0)

    stage_breakdown = []
    for row in stage_rows:
        stage_breakdown.append({
            "stage": _stage_label(row.get("stage")),
            "count": int(row.get("count") or 0),
        })

    deliverable_status_breakdown = []
    for row in deliverable_status_rows:
        deliverable_status_breakdown.append({
            "status": _deliverable_status_label(row.get("status")),
            "count": int(row.get("count") or 0),
        })

    active_project_count = int(dashboard.get("active_projects") or 0)
    total_project_count = int(dashboard.get("total_projects") or 0)
    total_allocated_budget = float(dashboard.get("total_allocated_budget") or 0)
    total_budget_used = float(dashboard.get("total_budget_used") or 0)
    total_allocated_hours = float(dashboard.get("total_allocated_hours") or 0)
    total_hours_used = float(dashboard.get("total_hours_used") or 0)

    return {
        "project_count": active_project_count,
        "active_project_count": active_project_count,
        "total_project_count": total_project_count,
        "rag_breakdown": rag_breakdown,
        "active_rag_breakdown": active_rag_breakdown,
        "stage_breakdown": stage_breakdown,
        "deliverable_status_breakdown": deliverable_status_breakdown,
        "project_burn": project_chart_rows,
        "team_utilization": team_utilization,
        "total_allocated_budget": total_allocated_budget,
        "total_budget_used": total_budget_used,
        "total_budget_remaining": max(total_allocated_budget - total_budget_used, 0),
        "budget_used_percent": (total_budget_used / total_allocated_budget * 100) if total_allocated_budget else 0,
        "total_allocated_hours": total_allocated_hours,
        "total_hours_used": total_hours_used,
        "total_hours_remaining": max(total_allocated_hours - total_hours_used, 0),
        "hours_used_percent": (total_hours_used / total_allocated_hours * 100) if total_allocated_hours else 0,
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
