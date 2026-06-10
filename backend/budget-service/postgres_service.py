"""Budget domain — project budget CRUD."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

BUDGET_COLS = "id, project_id, allocated_budget, budget_used, currency, notes, created_at, updated_at"


def project_exists(project_id: str) -> bool:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM projects WHERE id = %s", (project_id,))
        return cur.fetchone() is not None


def list_budgets(project_id: str | None = None) -> list:
    conn = get_connection()
    if project_id:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {BUDGET_COLS} FROM project_budgets WHERE project_id = %s", (project_id,))
            return cur.fetchall()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {BUDGET_COLS} FROM project_budgets ORDER BY created_at DESC")
        return cur.fetchall()


def get_budget(budget_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {BUDGET_COLS} FROM project_budgets WHERE id = %s", (budget_id,))
        return cur.fetchone()


def create_budget(data: dict) -> dict:
    if not project_exists(data["project_id"]):
        raise ValueError("Project not found")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO project_budgets (project_id, allocated_budget, currency, notes)
                VALUES (%s, %s, %s, %s)
                RETURNING {BUDGET_COLS}
                """,
                (
                    data["project_id"],
                    data["allocated_budget"],
                    data.get("currency", "USD"),
                    data.get("notes"),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Budget already exists for this project")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_budget(budget_id: str, data: dict) -> dict | None:
    allowed = {"allocated_budget", "currency", "notes"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_budget(budget_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [budget_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE project_budgets SET {set_clause} WHERE id = %s RETURNING {BUDGET_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_budget(budget_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_budgets WHERE id = %s RETURNING id", (budget_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
