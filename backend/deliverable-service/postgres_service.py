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


def _dep_node(row: dict) -> dict:
    return {
        "dependency_id": row.get("dependency_id"),
        "id": row.get("id"),
        "title": row.get("title"),
        "status": row.get("status"),
        "project_id": row.get("project_id"),
        "project_name": row.get("project_name"),
    }


def _with_dependencies(deliverable: dict | None) -> dict | None:
    """Attach blocked_by (upstream blockers) and blocks (downstream impact)."""
    if not deliverable:
        return deliverable
    deliverable_id = deliverable.get("id")
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT dd.id AS dependency_id, up.id, up.title, up.status,
                   up.project_id, p.name AS project_name
            FROM deliverable_dependencies dd
            JOIN project_deliverables up ON up.id = dd.depends_on_deliverable_id
            LEFT JOIN projects p ON p.id = up.project_id
            WHERE dd.deliverable_id = %s
            ORDER BY up.title
            """,
            (deliverable_id,),
        )
        blocked_by = [_dep_node(row) for row in cur.fetchall()]

        cur.execute(
            """
            SELECT dd.id AS dependency_id, down.id, down.title, down.status,
                   down.project_id, p.name AS project_name
            FROM deliverable_dependencies dd
            JOIN project_deliverables down ON down.id = dd.deliverable_id
            LEFT JOIN projects p ON p.id = down.project_id
            WHERE dd.depends_on_deliverable_id = %s
            ORDER BY down.title
            """,
            (deliverable_id,),
        )
        blocks = [_dep_node(row) for row in cur.fetchall()]

    deliverable["blocked_by"] = blocked_by
    deliverable["blocks"] = blocks
    deliverable["blocks_count"] = len(blocks)
    deliverable["is_blocked"] = any(node.get("status") != "completed" for node in blocked_by)
    return deliverable


def _select_sql(where: str = "") -> str:
    return f"""
        SELECT pd.*, p.name AS project_name, p.stage AS project_stage,
               e.first_name, e.last_name, e.email, e.role AS employee_role, e.job_title
        FROM project_deliverables pd
        LEFT JOIN projects p ON p.id = pd.project_id
        LEFT JOIN employees e ON e.id = pd.assigned_employee_id
        {where}
    """


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
        rows = cur.fetchall()
    return [_with_dependencies(_deliverable(row)) for row in rows]


def get_deliverable(deliverable_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(_select_sql("WHERE pd.id = %s"), (deliverable_id,))
        row = cur.fetchone()
    return _with_dependencies(_deliverable(row)) if row else None


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


# --- Deliverable-to-deliverable dependencies -------------------------------

DEP_COLS = "id, deliverable_id, depends_on_deliverable_id, created_at"


def list_deliverable_dependencies(deliverable_id: str | None = None) -> list:
    conn = get_connection()
    where = ""
    params: list = []
    if deliverable_id:
        where = "WHERE deliverable_id = %s"
        params.append(deliverable_id)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {DEP_COLS} FROM deliverable_dependencies {where} ORDER BY created_at",
            params,
        )
        return cur.fetchall()


def get_deliverable_dependency(dependency_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {DEP_COLS} FROM deliverable_dependencies WHERE id = %s",
            (dependency_id,),
        )
        return cur.fetchone()


def _has_circular_dependency(deliverable_id: str, depends_on_id: str, exclude_id: str | None = None) -> bool:
    """DFS check: adding depends_on_id -> deliverable_id edge would create a cycle."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, deliverable_id, depends_on_deliverable_id FROM deliverable_dependencies")
        edges = cur.fetchall()

    graph: dict[str, list[str]] = {}
    for edge in edges:
        if exclude_id and str(edge.get("id")) == exclude_id:
            continue
        graph.setdefault(str(edge["deliverable_id"]), []).append(str(edge["depends_on_deliverable_id"]))

    graph.setdefault(deliverable_id, []).append(depends_on_id)

    visited = set()
    stack = [depends_on_id]
    while stack:
        node = stack.pop()
        if node == deliverable_id:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(graph.get(node, []))
    return False


def create_deliverable_dependency(data: dict) -> dict:
    deliverable_id = data["deliverable_id"]
    depends_on_id = data["depends_on_deliverable_id"]
    if str(deliverable_id) == str(depends_on_id):
        raise ValueError("A deliverable cannot depend on itself")
    if _has_circular_dependency(str(deliverable_id), str(depends_on_id)):
        raise ValueError("Circular deliverable dependency detected")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO deliverable_dependencies (deliverable_id, depends_on_deliverable_id)
                VALUES (%s, %s)
                RETURNING {DEP_COLS}
                """,
                (deliverable_id, depends_on_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid deliverable_id or depends_on_deliverable_id")
    except errors.RaiseException as e:
        conn.rollback()
        raise ValueError(str(e).strip() or "Circular deliverable dependency detected")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_deliverable_dependency(dependency_id: str, data: dict) -> dict | None:
    existing = get_deliverable_dependency(dependency_id)
    if not existing:
        return None

    deliverable_id = data.get("deliverable_id", existing["deliverable_id"])
    depends_on_id = data.get("depends_on_deliverable_id", existing["depends_on_deliverable_id"])

    if str(deliverable_id) == str(depends_on_id):
        raise ValueError("A deliverable cannot depend on itself")
    if _has_circular_dependency(str(deliverable_id), str(depends_on_id), dependency_id):
        raise ValueError("Circular deliverable dependency detected")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE deliverable_dependencies
                SET deliverable_id = %s, depends_on_deliverable_id = %s
                WHERE id = %s
                RETURNING {DEP_COLS}
                """,
                (deliverable_id, depends_on_id, dependency_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid deliverable_id or depends_on_deliverable_id")
    except errors.RaiseException as e:
        conn.rollback()
        raise ValueError(str(e).strip() or "Circular deliverable dependency detected")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_deliverable_dependency(dependency_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM deliverable_dependencies WHERE id = %s RETURNING id",
                (dependency_id,),
            )
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
