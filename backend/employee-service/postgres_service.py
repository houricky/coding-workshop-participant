"""Employee domain — CRUD operations."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

EMPLOYEE_COLS = (
    "id, first_name, last_name, email, role, job_title, department, is_direct_staff, work_location, "
    "hourly_rate, weekly_capacity_hours, is_active, created_at, updated_at"
)


def _rag_label(status: str | None) -> str:
    return {
        "green": "Green",
        "amber": "Amber",
        "red": "Red",
    }.get(str(status or "").lower(), "Green")


def _employee(row: dict | None) -> dict | None:
    if not row:
        return None

    allocated_hours = float(row.get("total_allocated_hours", row.get("allocated_hours", 0)) or 0)
    hours_used = float(row.get("hours_used", 0) or 0)
    capacity_hours = float(row.get("weekly_capacity_hours", 0) or 0)
    utilization = float(row.get("allocation_percent") or 0)

    return {
        **row,
        "name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
        "role": row.get("role", "employee"),
        "title": row.get("job_title"),
        "staff_type": "direct" if row.get("is_direct_staff", True) else "non_direct",
        "location": row.get("work_location", "remote"),
        "capacity_hours": capacity_hours,
        "allocated_hours": allocated_hours,
        "hours_used": hours_used,
        "utilization_percent": utilization,
        "overallocated": bool(row.get("is_overallocated", allocated_hours > capacity_hours if capacity_hours else False)),
        "project_count": int(row.get("project_count") or 0),
    }


def _project(row: dict | None) -> dict | None:
    if not row:
        return None
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
        "team_size": int(row.get("allocation_count") or 0),
    }


def list_employees(
    department: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    role: str | None = None,
    is_direct_staff: bool | None = None,
    work_location: str | None = None,
) -> list:
    conn = get_connection()
    conditions = []
    params = []

    if department:
        conditions.append("eas.department = %s")
        params.append(department)
    if role:
        conditions.append("eas.role = %s")
        params.append(role)
    if is_direct_staff is not None:
        conditions.append("eas.is_direct_staff = %s")
        params.append(is_direct_staff)
    if work_location:
        conditions.append("eas.work_location = %s")
        params.append(work_location)
    if is_active is not None:
        conditions.append("e.is_active = %s")
        params.append(is_active)
    if search:
        conditions.append("(eas.first_name ILIKE %s OR eas.last_name ILIKE %s OR eas.email ILIKE %s)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT eas.*, e.job_title, e.hourly_rate, e.is_active, e.created_at, e.updated_at,
                   COALESCE(usage_totals.hours_used, 0) AS hours_used
            FROM v_employee_allocation_summary eas
            JOIN employees e ON e.id = eas.employee_id
            LEFT JOIN (
                SELECT employee_id, SUM(hours_used) AS hours_used
                FROM project_resource_usage
                GROUP BY employee_id
            ) usage_totals ON usage_totals.employee_id = eas.employee_id
            {where}
            ORDER BY eas.last_name, eas.first_name
            """,
            params,
        )
        return [_employee({**row, "id": row["employee_id"]}) for row in cur.fetchall()]


def get_employee(employee_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT eas.*, e.job_title, e.hourly_rate, e.is_active, e.created_at, e.updated_at,
                   COALESCE(usage_totals.hours_used, 0) AS hours_used
            FROM v_employee_allocation_summary eas
            JOIN employees e ON e.id = eas.employee_id
            LEFT JOIN (
                SELECT employee_id, SUM(hours_used) AS hours_used
                FROM project_resource_usage
                GROUP BY employee_id
            ) usage_totals ON usage_totals.employee_id = eas.employee_id
            WHERE eas.employee_id = %s
            """,
            (employee_id,),
        )
        employee = _employee({**row, "id": row["employee_id"]}) if (row := cur.fetchone()) else None
        if not employee:
            return None

        cur.execute(
            """
            SELECT pra.*
            FROM project_resource_allocations pra
            WHERE pra.employee_id = %s
            ORDER BY pra.created_at
            """,
            (employee_id,),
        )
        allocations = cur.fetchall()
        for allocation in allocations:
            cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (allocation["project_id"],))
            allocation["project"] = _project(cur.fetchone())
        employee["allocations"] = allocations

        return employee


def create_employee(data: dict) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO employees (first_name, last_name, email, role, job_title, department,
                                       is_direct_staff, work_location, hourly_rate, weekly_capacity_hours, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING """ + EMPLOYEE_COLS,
                (
                    data["first_name"],
                    data["last_name"],
                    data.get("email"),
                    data.get("role", "employee"),
                    data.get("job_title"),
                    data.get("department"),
                    data.get("is_direct_staff", True),
                    data.get("work_location", "remote"),
                    data.get("hourly_rate", 0),
                    data.get("weekly_capacity_hours", 40),
                    data.get("is_active", True),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return get_employee(row["id"])
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Employee email already exists")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_employee(employee_id: str, data: dict) -> dict | None:
    allowed = {
        "first_name", "last_name", "email", "role", "job_title", "department",
        "is_direct_staff", "work_location", "hourly_rate", "weekly_capacity_hours", "is_active",
    }
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_employee(employee_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [employee_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE employees SET {set_clause} WHERE id = %s RETURNING {EMPLOYEE_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return get_employee(employee_id)
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Employee email already exists")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_employee(employee_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM project_resource_allocations WHERE employee_id = %s",
                (employee_id,),
            )
            if cur.fetchone()["cnt"] > 0:
                raise ValueError("Cannot delete employee with active allocations")
            cur.execute("DELETE FROM employees WHERE id = %s RETURNING id", (employee_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except ValueError:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        reset_connection()
        raise
