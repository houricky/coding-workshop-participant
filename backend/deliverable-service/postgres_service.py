"""Deliverable domain — project deliverable CRUD operations."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

DELIVERABLE_COLS = (
    "id, project_id, title, description, due_date, assigned_employee_id, "
    "status, created_at, updated_at"
)


def _project(row: dict) -> dict:
    return {
        "id": row.get("project_id"),
        "name": row.get("project_name"),
        "stage": row.get("project_stage"),
    }


def _employee(row: dict) -> dict | None:
    if not row.get("assigned_employee_id"):
        return None
    return {
        "id": row.get("assigned_employee_id"),
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
        "email": row.get("email"),
        "role": row.get("employee_role"),
        "title": row.get("job_title"),
        "job_title": row.get("job_title"),
    }


def _deliverable(row: dict) -> dict:
    return {
        **row,
        "employee_id": row.get("assigned_employee_id"),
        "project": _project(row),
        "employee": _employee(row),
    }


def _select_sql(where: str = "") -> str:
    return f"""
        SELECT pd.*, p.name AS project_name, p.stage AS project_stage,
               e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title
        FROM project_deliverables pd
        LEFT JOIN projects p ON p.id = pd.project_id
        LEFT JOIN employees e ON e.id = pd.assigned_employee_id
        {where}
    """


def _is_allocated(project_id: str, employee_id: str) -> bool:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM project_resource_allocations
            WHERE project_id = %s AND employee_id = %s
            """,
            (project_id, employee_id),
        )
        return cur.fetchone() is not None


def _project_id_for_deliverable(deliverable_id: str) -> str | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT project_id FROM project_deliverables WHERE id = %s", (deliverable_id,))
        row = cur.fetchone()
        return row["project_id"] if row else None


def _validate_assignment(project_id: str, employee_id: str | None):
    if employee_id and not _is_allocated(project_id, employee_id):
        raise ValueError("Assigned employee must be allocated to this project")


def list_deliverables(
    project_id: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
) -> list:
    conn = get_connection()
    conditions = []
    params = []
    if project_id:
        conditions.append("pd.project_id = %s")
        params.append(project_id)
    if employee_id:
        conditions.append("pd.assigned_employee_id = %s")
        params.append(employee_id)
    if status:
        conditions.append("pd.status = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"{_select_sql(where)} ORDER BY pd.due_date, pd.created_at", params)
        return [_deliverable(row) for row in cur.fetchall()]


def get_deliverable(deliverable_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_select_sql("WHERE pd.id = %s"), (deliverable_id,))
        row = cur.fetchone()
        return _deliverable(row) if row else None


def create_deliverable(data: dict) -> dict:
    employee_id = data.get("employee_id", data.get("assigned_employee_id"))
    _validate_assignment(data["project_id"], employee_id)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO project_deliverables
                    (project_id, title, description, due_date, assigned_employee_id, status)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING {DELIVERABLE_COLS}
                """,
                (
                    data["project_id"],
                    data["title"],
                    data.get("description"),
                    data["due_date"],
                    employee_id,
                    data.get("status", "pending"),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return get_deliverable(row["id"])
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid project_id or employee_id")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_deliverable(deliverable_id: str, data: dict) -> dict | None:
    project_id = _project_id_for_deliverable(deliverable_id)
    if not project_id:
        return None

    if "employee_id" in data and "assigned_employee_id" not in data:
        data["assigned_employee_id"] = data["employee_id"]
    if "assigned_employee_id" in data:
        _validate_assignment(project_id, data.get("assigned_employee_id"))

    allowed = {"title", "description", "due_date", "assigned_employee_id", "status"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_deliverable(deliverable_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [deliverable_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE project_deliverables SET {set_clause} WHERE id = %s RETURNING {DELIVERABLE_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return get_deliverable(row["id"]) if row else None
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid employee_id")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_deliverable(deliverable_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_deliverables WHERE id = %s RETURNING id", (deliverable_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
