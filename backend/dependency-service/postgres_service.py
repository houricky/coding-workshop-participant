"""Project dependency domain — dependency chain CRUD."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

DEP_COLS = "id, project_id, depends_on_project_id, dependency_type, created_at"

VALID_TYPES = {"finish_to_start", "start_to_start", "finish_to_finish"}


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


def list_dependencies(project_id: str | None = None, allocated_employee_id: str | None = None) -> list:
    conn = get_connection()
    conditions = []
    params = []
    if project_id:
        conditions.append("project_id = %s")
        params.append(project_id)
    if allocated_employee_id:
        conditions.append(
            """
            EXISTS (
                SELECT 1 FROM project_resource_allocations pra
                WHERE pra.project_id = project_dependencies.project_id
                  AND pra.employee_id = %s
            )
            """
        )
        params.append(allocated_employee_id)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {DEP_COLS} FROM project_dependencies {where} ORDER BY created_at", params)
        return cur.fetchall()


def get_dependency(dependency_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {DEP_COLS} FROM project_dependencies WHERE id = %s", (dependency_id,))
        return cur.fetchone()


def _has_circular_dependency(project_id: str, depends_on_id: str, exclude_id: str | None = None) -> bool:
    """DFS check: adding depends_on_id -> project_id edge would create a cycle."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT project_id, depends_on_project_id FROM project_dependencies")
        edges = cur.fetchall()

    graph: dict[str, list[str]] = {}
    for edge in edges:
        if exclude_id and str(edge.get("id")) == exclude_id:
            continue
        graph.setdefault(str(edge["project_id"]), []).append(str(edge["depends_on_project_id"]))

    graph.setdefault(project_id, []).append(depends_on_id)

    visited = set()
    stack = [depends_on_id]
    while stack:
        node = stack.pop()
        if node == project_id:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(graph.get(node, []))
    return False


def create_dependency(data: dict) -> dict:
    project_id = data["project_id"]
    depends_on_id = data["depends_on_project_id"]
    if project_id == depends_on_id:
        raise ValueError("A project cannot depend on itself")

    dep_type = data.get("dependency_type", "finish_to_start")
    if dep_type not in VALID_TYPES:
        raise ValueError("Invalid dependency_type")

    if _has_circular_dependency(project_id, depends_on_id):
        raise ValueError("Circular dependency detected")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO project_dependencies (project_id, depends_on_project_id, dependency_type)
                VALUES (%s, %s, %s)
                RETURNING {DEP_COLS}
                """,
                (project_id, depends_on_id, dep_type),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid project_id or depends_on_project_id")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_dependency(dependency_id: str, data: dict) -> dict | None:
    existing = get_dependency(dependency_id)
    if not existing:
        return None

    project_id = data.get("project_id", existing["project_id"])
    depends_on_id = data.get("depends_on_project_id", existing["depends_on_project_id"])
    dep_type = data.get("dependency_type", existing["dependency_type"])

    if str(project_id) == str(depends_on_id):
        raise ValueError("A project cannot depend on itself")
    if dep_type not in VALID_TYPES:
        raise ValueError("Invalid dependency_type")
    if _has_circular_dependency(str(project_id), str(depends_on_id), dependency_id):
        raise ValueError("Circular dependency detected")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE project_dependencies
                SET project_id = %s, depends_on_project_id = %s, dependency_type = %s
                WHERE id = %s
                RETURNING {DEP_COLS}
                """,
                (project_id, depends_on_id, dep_type, dependency_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Dependency already exists")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_dependency(dependency_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_dependencies WHERE id = %s RETURNING id", (dependency_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
