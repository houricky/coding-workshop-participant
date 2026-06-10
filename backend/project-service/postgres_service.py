"""Project domain — CRUD and summary operations."""

from pg_connection import get_connection, reset_connection

PROJECT_COLS = (
    "id, name, description, stage, actual_completion_percent, rag_status, "
    "rag_progress_gap, start_date, end_date, project_manager_id, created_at, updated_at"
)


def _rag_label(status: str | None) -> str:
    return {
        "green": "Green",
        "amber": "Amber",
        "red": "Red",
    }.get(str(status or "").lower(), "Green")


def _project_summary(row: dict | None) -> dict | None:
    if not row:
        return None
    budget_used_percent = float(row.get("budget_used_percent") or 0)
    hours_used_percent = float(row.get("hours_used_percent") or 0)
    allocated_hours = float(row.get("allocated_hours") or 0)
    return {
        **row,
        "id": row.get("project_id", row.get("id")),
        "rag_status": _rag_label(row.get("rag_status")),
        "progress_gap": float(row.get("rag_progress_gap") or 0),
        "burn_percent": max(budget_used_percent, hours_used_percent),
        "budget_used_percent": budget_used_percent,
        "hours_used_percent": hours_used_percent,
        "team_size": int(row.get("allocation_count") or 0),
        "manager_count": int(row.get("manager_count") or (1 if row.get("project_manager_id") else 0)),
        "allocated_cost": allocated_hours,
    }


def _employee(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        **row,
        "name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
        "role": row.get("role", "employee"),
        "title": row.get("job_title"),
        "staff_type": "direct" if row.get("is_direct_staff", True) else "non_direct",
        "location": row.get("work_location", "remote"),
        "capacity_hours": row.get("weekly_capacity_hours"),
    }


def _allocation(row: dict) -> dict:
    return {
        **row,
        "employee": _employee({
            "id": row.get("employee_id"),
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "email": row.get("email"),
            "role": row.get("employee_role"),
            "job_title": row.get("job_title"),
            "is_direct_staff": row.get("is_direct_staff"),
            "work_location": row.get("work_location"),
            "hourly_rate": row.get("employee_hourly_rate"),
            "weekly_capacity_hours": row.get("weekly_capacity_hours"),
        }),
    }


def _usage(row: dict) -> dict:
    return {
        **row,
        "logged_on": row.get("usage_date"),
        "employee": _employee({
            "id": row.get("employee_id"),
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "email": row.get("email"),
            "role": row.get("employee_role"),
            "job_title": row.get("job_title"),
            "is_direct_staff": row.get("is_direct_staff"),
            "work_location": row.get("work_location"),
            "hourly_rate": row.get("employee_hourly_rate"),
            "weekly_capacity_hours": row.get("weekly_capacity_hours"),
        }),
    }


def _deliverable(row: dict) -> dict:
    assigned_employee_id = row.get("assigned_employee_id")
    employee = None
    if assigned_employee_id:
        employee = _employee({
            "id": assigned_employee_id,
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "email": row.get("email"),
            "role": row.get("employee_role"),
            "job_title": row.get("job_title"),
            "is_direct_staff": row.get("is_direct_staff"),
            "work_location": row.get("work_location"),
            "hourly_rate": row.get("employee_hourly_rate"),
            "weekly_capacity_hours": row.get("weekly_capacity_hours"),
        })
    return {
        **row,
        "employee_id": assigned_employee_id,
        "employee": employee,
    }


def list_projects(stage: str | None = None, rag_status: str | None = None, search: str | None = None) -> list:
    conn = get_connection()
    conditions = []
    params = []

    if stage:
        conditions.append("stage = %s")
        params.append(stage)
    if rag_status:
        conditions.append("rag_status = %s")
        params.append(rag_status)
    if search:
        conditions.append("(name ILIKE %s)")
        pattern = f"%{search}%"
        params.append(pattern)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT * FROM v_project_summary {where} ORDER BY rag_progress_gap DESC, name", params)
        return [_project_summary(row) for row in cur.fetchall()]


def get_project(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (project_id,))
        project = _project_summary(cur.fetchone())
        if not project:
            return None

        if project.get("project_manager_id"):
            cur.execute(
                """
                SELECT id, first_name, last_name, email, role, job_title, is_direct_staff,
                       work_location, hourly_rate, weekly_capacity_hours
                FROM employees
                WHERE id = %s
                """,
                (project["project_manager_id"],),
            )
            manager = cur.fetchone()
            project["project_manager"] = _employee({
                **manager,
                "employee_role": manager.get("role") if manager else None,
            }) if manager else None
        else:
            project["project_manager"] = None

        cur.execute(
            """
            SELECT pra.*, e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
                   e.is_direct_staff, e.work_location,
                   e.hourly_rate AS employee_hourly_rate, e.weekly_capacity_hours
            FROM project_resource_allocations pra
            LEFT JOIN employees e ON e.id = pra.employee_id
            WHERE pra.project_id = %s
            ORDER BY e.last_name, e.first_name
            """,
            (project_id,),
        )
        project["allocations"] = [_allocation(row) for row in cur.fetchall()]

        cur.execute(
            """
            SELECT pru.*, e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
                   e.is_direct_staff, e.work_location,
                   e.hourly_rate AS employee_hourly_rate, e.weekly_capacity_hours
            FROM project_resource_usage pru
            LEFT JOIN employees e ON e.id = pru.employee_id
            WHERE pru.project_id = %s
            ORDER BY pru.usage_date
            """,
            (project_id,),
        )
        project["usage"] = [_usage(row) for row in cur.fetchall()]

        cur.execute(
            """
            SELECT pd.*, e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
                   e.is_direct_staff, e.work_location,
                   e.hourly_rate AS employee_hourly_rate, e.weekly_capacity_hours
            FROM project_deliverables pd
            LEFT JOIN employees e ON e.id = pd.assigned_employee_id
            WHERE pd.project_id = %s
            ORDER BY pd.due_date, pd.created_at
            """,
            (project_id,),
        )
        project["deliverables"] = [_deliverable(row) for row in cur.fetchall()]

        cur.execute(
            """
            SELECT pd.id, pd.project_id, pd.depends_on_project_id, pd.dependency_type, pd.created_at
            FROM project_dependencies pd
            WHERE pd.project_id = %s
            ORDER BY pd.created_at
            """,
            (project_id,),
        )
        dependencies = cur.fetchall()
        for dep in dependencies:
            cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (dep["depends_on_project_id"],))
            dep["depends_on"] = _project_summary(cur.fetchone())
        project["dependencies"] = dependencies

        return project


def get_project_summary(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (project_id,))
        return _project_summary(cur.fetchone())


def get_employee_role(employee_id: str) -> str | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT role FROM employees WHERE id = %s", (employee_id,))
        row = cur.fetchone()
        return row["role"] if row else None


def create_project(data: dict) -> dict:
    manager_id = data.get("project_manager_id")
    if not manager_id:
        raise ValueError("Project manager is required")
    if get_employee_role(manager_id) != "manager":
        raise ValueError("Project manager must be an employee with the manager role")

    deliverables = data.get("deliverables") or []
    if not isinstance(deliverables, list):
        raise ValueError("deliverables must be an array")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projects (name, description, stage, actual_completion_percent,
                                      start_date, end_date, project_manager_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING """ + PROJECT_COLS,
                (
                    data["name"],
                    data.get("description"),
                    data.get("stage", "planning"),
                    data.get("actual_completion_percent", 0),
                    data.get("start_date"),
                    data.get("end_date"),
                    data.get("project_manager_id"),
                ),
            )
            row = cur.fetchone()

            for deliverable in deliverables:
                assigned_employee_id = deliverable.get("employee_id", deliverable.get("assigned_employee_id"))
                if assigned_employee_id:
                    cur.execute(
                        """
                        SELECT 1
                        FROM project_resource_allocations
                        WHERE project_id = %s AND employee_id = %s
                        """,
                        (row["id"], assigned_employee_id),
                    )
                    if not cur.fetchone():
                        raise ValueError("Assigned employee must be allocated to this project")
                cur.execute(
                    """
                    INSERT INTO project_deliverables
                        (project_id, title, description, due_date, assigned_employee_id, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        row["id"],
                        deliverable["title"],
                        deliverable.get("description"),
                        deliverable["due_date"],
                        assigned_employee_id,
                        deliverable.get("status", "pending"),
                    ),
                )
            conn.commit()
            return get_project(row["id"])
    except ValueError:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_project(project_id: str, data: dict) -> dict | None:
    if "project_manager_id" in data:
        if not data.get("project_manager_id"):
            raise ValueError("Project manager is required")
        if get_employee_role(data["project_manager_id"]) != "manager":
            raise ValueError("Project manager must be an employee with the manager role")

    allowed = {
        "name", "description", "stage", "actual_completion_percent",
        "start_date", "end_date", "project_manager_id",
    }
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_project(project_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [project_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE projects SET {set_clause} WHERE id = %s RETURNING {PROJECT_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return get_project(project_id)
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_project(project_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM projects WHERE id = %s RETURNING id", (project_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
