"""Project domain — CRUD and summary operations."""

from pg_connection import get_connection, reset_connection

PROJECT_COLS = (
    "id, name, description, stage, actual_completion_percent, rag_status, "
    "rag_progress_gap, start_date, end_date, project_manager_id, created_at, updated_at"
)


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
        conditions.append("(name ILIKE %s OR description ILIKE %s)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {PROJECT_COLS} FROM projects {where} ORDER BY name", params)
        return cur.fetchall()


def get_project(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {PROJECT_COLS} FROM projects WHERE id = %s", (project_id,))
        return cur.fetchone()


def get_project_summary(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_project_summary WHERE project_id = %s", (project_id,))
        return cur.fetchone()


def create_project(data: dict) -> dict:
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
            conn.commit()
            return row
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_project(project_id: str, data: dict) -> dict | None:
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
            return row
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
