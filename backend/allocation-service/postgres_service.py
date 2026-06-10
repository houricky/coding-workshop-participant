"""Resource allocation domain — employee-to-project assignments."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

ALLOC_COLS = (
    "id, project_id, employee_id, allocated_hours, hourly_rate_snapshot, "
    "role_on_project, start_date, end_date, created_at, updated_at"
)


def _employee(row: dict) -> dict:
    return {
        "id": row.get("employee_id"),
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
        "email": row.get("email"),
        "role": row.get("employee_role", "employee"),
        "title": row.get("job_title"),
        "job_title": row.get("job_title"),
        "staff_type": "direct" if row.get("is_direct_staff", True) else "non_direct",
        "location": row.get("work_location", "remote"),
        "hourly_rate": row.get("employee_hourly_rate"),
        "capacity_hours": row.get("weekly_capacity_hours"),
        "weekly_capacity_hours": row.get("weekly_capacity_hours"),
    }


def _project(row: dict) -> dict:
    return {
        "id": row.get("project_id"),
        "name": row.get("project_name"),
        "stage": row.get("project_stage"),
    }


def _allocation(row: dict) -> dict:
    return {
        **row,
        "employee": _employee(row),
        "project": _project(row),
    }


def get_employee_rate(employee_id: str) -> float | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT hourly_rate FROM employees WHERE id = %s", (employee_id,))
        row = cur.fetchone()
        return float(row["hourly_rate"]) if row else None


def list_allocations(project_id: str | None = None, employee_id: str | None = None) -> list:
    conn = get_connection()
    conditions = []
    params = []
    if project_id:
        conditions.append("pra.project_id = %s")
        params.append(project_id)
    if employee_id:
        conditions.append("pra.employee_id = %s")
        params.append(employee_id)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT pra.*, p.name AS project_name, p.stage AS project_stage,
                   e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
                   e.is_direct_staff, e.work_location,
                   e.hourly_rate AS employee_hourly_rate, e.weekly_capacity_hours
            FROM project_resource_allocations pra
            LEFT JOIN projects p ON p.id = pra.project_id
            LEFT JOIN employees e ON e.id = pra.employee_id
            {where}
            ORDER BY pra.created_at
            """,
            params,
        )
        return [_allocation(row) for row in cur.fetchall()]


def get_allocation(allocation_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pra.*, p.name AS project_name, p.stage AS project_stage,
                   e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
                   e.is_direct_staff, e.work_location,
                   e.hourly_rate AS employee_hourly_rate, e.weekly_capacity_hours
            FROM project_resource_allocations pra
            LEFT JOIN projects p ON p.id = pra.project_id
            LEFT JOIN employees e ON e.id = pra.employee_id
            WHERE pra.id = %s
            """,
            (allocation_id,),
        )
        row = cur.fetchone()
        return _allocation(row) if row else None


def create_allocation(data: dict) -> dict:
    rate = data.get("hourly_rate_snapshot")
    if rate is None:
        rate = get_employee_rate(data["employee_id"])
        if rate is None:
            raise ValueError("Employee not found")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO project_resource_allocations
                    (project_id, employee_id, allocated_hours, hourly_rate_snapshot,
                     role_on_project, start_date, end_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING {ALLOC_COLS}
                """,
                (
                    data["project_id"],
                    data["employee_id"],
                    data["allocated_hours"],
                    rate,
                    data.get("role_on_project"),
                    data.get("start_date"),
                    data.get("end_date"),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return get_allocation(row["id"])
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Employee already allocated to this project")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid project_id or employee_id")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_allocation(allocation_id: str, data: dict) -> dict | None:
    allowed = {"allocated_hours", "role_on_project", "start_date", "end_date", "hourly_rate_snapshot"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_allocation(allocation_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [allocation_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE project_resource_allocations SET {set_clause} WHERE id = %s RETURNING {ALLOC_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return get_allocation(allocation_id)
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_allocation(allocation_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_resource_allocations WHERE id = %s RETURNING id", (allocation_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
