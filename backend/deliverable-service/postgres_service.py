"""Deliverable domain — deliverable CRUD and dependency graph operations."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

DELIVERABLE_COLS = (
    "id, project_id, title, description, due_date, assigned_employee_id, "
    "status, created_at, updated_at"
)

DEPENDENCY_COLS = "id, deliverable_id, depends_on_deliverable_id, created_at"


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
        "blocked_by_count": int(row.get("blocked_by_count") or 0),
        "blocks_count": int(row.get("blocks_count") or 0),
        "blocked_project_count": int(row.get("blocked_project_count") or 0),
        "project": _project(row),
        "employee": _employee(row),
    }


def _select_sql(where: str = "") -> str:
    return f"""
        SELECT pd.*, p.name AS project_name, p.stage AS project_stage,
               e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title,
               (
                   SELECT COUNT(*)
                   FROM deliverable_dependencies dd
                   WHERE dd.deliverable_id = pd.id
               ) AS blocked_by_count,
               (
                   SELECT COUNT(*)
                   FROM deliverable_dependencies dd
                   WHERE dd.depends_on_deliverable_id = pd.id
               ) AS blocks_count,
               (
                   SELECT COUNT(DISTINCT downstream.project_id)
                   FROM deliverable_dependencies dd
                   JOIN project_deliverables downstream ON downstream.id = dd.deliverable_id
                   WHERE dd.depends_on_deliverable_id = pd.id
                     AND downstream.project_id <> pd.project_id
               ) AS blocked_project_count
        FROM project_deliverables pd
        LEFT JOIN projects p ON p.id = pd.project_id
        LEFT JOIN employees e ON e.id = pd.assigned_employee_id
        {where}
    """


def _dependency_select_sql(where: str = "") -> str:
    return f"""
        SELECT dd.id,
               dd.deliverable_id,
               dd.depends_on_deliverable_id,
               dd.created_at,
               d.title AS deliverable_title,
               d.project_id AS deliverable_project_id,
               p.name AS deliverable_project_name,
               p.stage AS deliverable_project_stage,
               u.title AS depends_on_deliverable_title,
               u.project_id AS depends_on_project_id,
               up.name AS depends_on_project_name,
               up.stage AS depends_on_project_stage,
               u.status AS depends_on_status
        FROM deliverable_dependencies dd
        JOIN project_deliverables d ON d.id = dd.deliverable_id
        JOIN project_deliverables u ON u.id = dd.depends_on_deliverable_id
        LEFT JOIN projects p ON p.id = d.project_id
        LEFT JOIN projects up ON up.id = u.project_id
        {where}
    """


def _dependency(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "deliverable_id": row.get("deliverable_id"),
        "depends_on_deliverable_id": row.get("depends_on_deliverable_id"),
        "created_at": row.get("created_at"),
        "deliverable": {
            "id": row.get("deliverable_id"),
            "title": row.get("deliverable_title"),
            "project_id": row.get("deliverable_project_id"),
            "project": {
                "id": row.get("deliverable_project_id"),
                "name": row.get("deliverable_project_name"),
                "stage": row.get("deliverable_project_stage"),
            },
        },
        "depends_on": {
            "id": row.get("depends_on_deliverable_id"),
            "title": row.get("depends_on_deliverable_title"),
            "status": row.get("depends_on_status"),
            "project_id": row.get("depends_on_project_id"),
            "project": {
                "id": row.get("depends_on_project_id"),
                "name": row.get("depends_on_project_name"),
                "stage": row.get("depends_on_project_stage"),
            },
        },
    }


def is_employee_allocated(project_id: str, employee_id: str | None) -> bool:
    if not employee_id:
        return False
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


def is_project_lead(project_id: str, employee_id: str | None) -> bool:
    if not employee_id:
        return False
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM projects p
            WHERE p.id = %s
              AND (
                  p.project_manager_id = %s
                  OR EXISTS (
                      SELECT 1
                      FROM project_resource_allocations pra
                      WHERE pra.project_id = p.id
                        AND pra.employee_id = %s
                        AND pra.role_on_project = 'manager'
                  )
              )
            """,
            (project_id, employee_id, employee_id),
        )
        return cur.fetchone() is not None


def _project_id_for_deliverable(deliverable_id: str) -> str | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT project_id FROM project_deliverables WHERE id = %s", (deliverable_id,))
        row = cur.fetchone()
        return row["project_id"] if row else None


def _project_id_for_dependency(dependency_id: str) -> str | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT pd.project_id
            FROM deliverable_dependencies dd
            JOIN project_deliverables pd ON pd.id = dd.deliverable_id
            WHERE dd.id = %s
            """,
            (dependency_id,),
        )
        row = cur.fetchone()
        return row["project_id"] if row else None


def _validate_assignment(project_id: str, employee_id: str | None):
    if employee_id and not is_employee_allocated(project_id, employee_id):
        raise ValueError("Assigned employee must be allocated to this project")


def list_deliverables(
    project_id: str | None = None,
    employee_id: str | None = None,
    status: str | None = None,
    allocated_employee_id: str | None = None,
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
    if allocated_employee_id:
        conditions.append(
            """
            EXISTS (
                SELECT 1 FROM project_resource_allocations pra
                WHERE pra.project_id = pd.project_id
                  AND pra.employee_id = %s
            )
            """
        )
        params.append(allocated_employee_id)
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


def list_deliverable_dependencies(
    deliverable_id: str | None = None,
    project_id: str | None = None,
    allocated_employee_id: str | None = None,
) -> list:
    conn = get_connection()
    conditions = []
    params = []

    if deliverable_id:
        conditions.append("(dd.deliverable_id = %s OR dd.depends_on_deliverable_id = %s)")
        params.extend([deliverable_id, deliverable_id])
    if project_id:
        conditions.append("d.project_id = %s")
        params.append(project_id)
    if allocated_employee_id:
        conditions.append(
            """
            EXISTS (
                SELECT 1 FROM project_resource_allocations pra
                WHERE pra.project_id = d.project_id
                  AND pra.employee_id = %s
            )
            """
        )
        params.append(allocated_employee_id)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"{_dependency_select_sql(where)} ORDER BY dd.created_at", params)
        return [_dependency(row) for row in cur.fetchall()]


def get_deliverable_dependency(dependency_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_dependency_select_sql("WHERE dd.id = %s"), (dependency_id,))
        row = cur.fetchone()
        return _dependency(row) if row else None


def create_deliverable_dependency(data: dict) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO deliverable_dependencies (deliverable_id, depends_on_deliverable_id)
                VALUES (%s, %s)
                RETURNING {DEPENDENCY_COLS}
                """,
                (data["deliverable_id"], data["depends_on_deliverable_id"]),
            )
            row = cur.fetchone()
            conn.commit()
            return get_deliverable_dependency(row["id"])
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid deliverable_id or depends_on_deliverable_id")
    except Exception as exc:
        conn.rollback()
        reset_connection()
        if "Circular deliverable dependency detected" in str(exc):
            raise ValueError("Circular deliverable dependency detected") from exc
        raise


def update_deliverable_dependency(dependency_id: str, data: dict) -> dict | None:
    existing = get_deliverable_dependency(dependency_id)
    if not existing:
        return None

    deliverable_id = data.get("deliverable_id", existing["deliverable_id"])
    depends_on_deliverable_id = data.get("depends_on_deliverable_id", existing["depends_on_deliverable_id"])

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE deliverable_dependencies
                SET deliverable_id = %s,
                    depends_on_deliverable_id = %s
                WHERE id = %s
                RETURNING {DEPENDENCY_COLS}
                """,
                (deliverable_id, depends_on_deliverable_id, dependency_id),
            )
            row = cur.fetchone()
            conn.commit()
            return get_deliverable_dependency(row["id"]) if row else None
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid deliverable_id or depends_on_deliverable_id")
    except Exception as exc:
        conn.rollback()
        reset_connection()
        if "Circular deliverable dependency detected" in str(exc):
            raise ValueError("Circular deliverable dependency detected") from exc
        raise


def delete_deliverable_dependency(dependency_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM deliverable_dependencies WHERE id = %s RETURNING id", (dependency_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
