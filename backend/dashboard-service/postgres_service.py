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


def _project_scope(alias: str, allocated_employee_id: str | None) -> tuple[str, list]:
    if not allocated_employee_id:
        return "", []
    return (
        f"""
        WHERE EXISTS (
            SELECT 1 FROM project_resource_allocations scope_pra
            WHERE scope_pra.project_id = {alias}.id
              AND scope_pra.employee_id = %s
        )
        """,
        [allocated_employee_id],
    )


def _project_summary_scope(alias: str, allocated_employee_id: str | None) -> tuple[str, list]:
    if not allocated_employee_id:
        return "", []
    return (
        f"""
        WHERE EXISTS (
            SELECT 1 FROM project_resource_allocations scope_pra
            WHERE scope_pra.project_id = {alias}.project_id
              AND scope_pra.employee_id = %s
        )
        """,
        [allocated_employee_id],
    )


def _deliverable_scope(alias: str, allocated_employee_id: str | None) -> tuple[str, list]:
    if not allocated_employee_id:
        return "", []
    return (
        f"""
        WHERE EXISTS (
            SELECT 1 FROM project_resource_allocations scope_pra
            WHERE scope_pra.project_id = {alias}.project_id
              AND scope_pra.employee_id = %s
        )
        """,
        [allocated_employee_id],
    )


def _team_scope(alias: str, allocated_employee_id: str | None) -> tuple[str, list]:
    if not allocated_employee_id:
        return "", []
    return (
        f"""
        AND EXISTS (
            SELECT 1
            FROM project_resource_allocations viewer_pra
            JOIN project_resource_allocations member_pra
              ON member_pra.project_id = viewer_pra.project_id
            WHERE viewer_pra.employee_id = %s
              AND member_pra.employee_id = {alias}.employee_id
        )
        """,
        [allocated_employee_id],
    )


def get_portfolio_dashboard(allocated_employee_id: str | None = None) -> dict:
    conn = get_connection()
    with conn.cursor() as cur:
        project_where, project_params = _project_scope("p", allocated_employee_id)
        cur.execute(
            f"""
            SELECT rag_status, COUNT(*) AS count
            FROM projects p
            {project_where}
            GROUP BY rag_status
            ORDER BY rag_status
            """,
            project_params,
        )
        rag_rows = cur.fetchall()
        cur.execute(
            f"""
            SELECT rag_status, COUNT(*) AS count
            FROM projects p
            {project_where + " AND" if project_where else "WHERE"} stage = 'active'
            GROUP BY rag_status
            ORDER BY rag_status
            """,
            project_params,
        )
        active_rag_rows = cur.fetchall()
        cur.execute(
            f"""
            SELECT stage, COUNT(*) AS count
            FROM projects p
            {project_where}
            GROUP BY stage
            ORDER BY stage
            """,
            project_params,
        )
        stage_rows = cur.fetchall()
        deliverable_where, deliverable_params = _deliverable_scope("pd", allocated_employee_id)
        cur.execute(
            f"""
            SELECT status, COUNT(*) AS count
            FROM project_deliverables pd
            {deliverable_where}
            GROUP BY status
            ORDER BY status
            """,
            deliverable_params,
        )
        deliverable_status_rows = cur.fetchall()
        summary_where, summary_params = _project_summary_scope("vps", allocated_employee_id)
        cur.execute(
            f"SELECT * FROM v_project_summary vps {summary_where} ORDER BY rag_progress_gap DESC, name",
            summary_params,
        )
        projects = [_project_summary(row) for row in cur.fetchall()]
        cur.execute(
            f"""
            SELECT *
            FROM v_project_summary vps
            {summary_where}
            ORDER BY GREATEST(budget_used_percent, hours_used_percent) DESC, name
            """,
            summary_params,
        )
        project_chart_rows = [_project_chart_row(row) for row in cur.fetchall()]
        team_filter, team_params = _team_scope("eas", allocated_employee_id)
        cur.execute(
            f"""
            SELECT *
            FROM v_employee_allocation_summary eas
            WHERE 1 = 1
            {team_filter}
            ORDER BY allocation_percent DESC, last_name, first_name
            """,
            team_params,
        )
        team_utilization = [_team_utilization_row(row) for row in cur.fetchall()]
        cur.execute(
            f"""
            SELECT COUNT(*) AS total_deliverables,
                   COUNT(*) FILTER (WHERE status = 'completed') AS completed_deliverables,
                   COUNT(*) FILTER (WHERE assigned_employee_id IS NULL) AS unassigned_deliverables
            FROM project_deliverables pd
            {deliverable_where}
            """,
            deliverable_params,
        )
        deliverable_totals = cur.fetchone() or {}

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

    active_project_count = len([p for p in projects if str(p.get("stage") or "").lower() == "active"])
    total_project_count = len(projects)
    total_allocated_budget = sum(float(p.get("allocated_budget") or 0) for p in projects)
    total_budget_used = sum(float(p.get("budget_used") or 0) for p in projects)
    total_allocated_hours = sum(float(p.get("allocated_hours") or 0) for p in projects)
    total_hours_used = sum(float(p.get("hours_used") or 0) for p in projects)

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
        "overallocated_employees": len([employee for employee in team_utilization if employee.get("overallocated")]),
        "total_deliverables": int(deliverable_totals.get("total_deliverables") or 0),
        "completed_deliverables": int(deliverable_totals.get("completed_deliverables") or 0),
        "unassigned_deliverables": int(deliverable_totals.get("unassigned_deliverables") or 0),
        "at_risk_projects": [p for p in projects if p["rag_status"] == "Red"],
        "projects": projects,
    }


def get_overallocations(allocated_employee_id: str | None = None) -> list:
    conn = get_connection()
    team_filter, team_params = _team_scope("eas", allocated_employee_id)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT * FROM v_employee_allocation_summary eas
            WHERE is_overallocated = TRUE
            {team_filter}
            ORDER BY allocation_percent DESC
            """,
            team_params,
        )
        return cur.fetchall()


def get_projects_at_risk(allocated_employee_id: str | None = None) -> list:
    conn = get_connection()
    summary_where, summary_params = _project_summary_scope("vps", allocated_employee_id)
    if summary_where:
        summary_where += " AND rag_status IN ('amber', 'red')"
    else:
        summary_where = "WHERE rag_status IN ('amber', 'red')"
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT * FROM v_project_summary vps
            {summary_where}
            ORDER BY rag_progress_gap DESC
            """,
            summary_params,
        )
        return [_project_summary(row) for row in cur.fetchall()]
