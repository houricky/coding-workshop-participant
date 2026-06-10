"""RAG calculation domain — project health status."""

from pg_connection import get_connection, reset_connection


def get_rag_details(project_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                p.id AS project_id,
                p.actual_completion_percent,
                p.rag_status,
                p.rag_progress_gap,
                pb.allocated_budget,
                pb.budget_used,
                CASE WHEN pb.allocated_budget > 0
                     THEN ROUND((pb.budget_used / pb.allocated_budget) * 100, 2)
                     ELSE 0 END AS budget_used_percent,
                fn_project_allocated_hours(p.id) AS allocated_hours,
                fn_project_hours_used(p.id) AS hours_used,
                CASE WHEN fn_project_allocated_hours(p.id) > 0
                     THEN ROUND((fn_project_hours_used(p.id) / fn_project_allocated_hours(p.id)) * 100, 2)
                     ELSE 0 END AS hours_used_percent
            FROM projects p
            LEFT JOIN project_budgets pb ON pb.project_id = p.id
            WHERE p.id = %s
            """,
            (project_id,),
        )
        return cur.fetchone()


def recalculate_rag(project_id: str) -> dict | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM projects WHERE id = %s", (project_id,))
            if not cur.fetchone():
                return None
            cur.execute("SELECT fn_update_project_rag(%s)", (project_id,))
            conn.commit()
        return get_rag_details(project_id)
    except Exception:
        conn.rollback()
        reset_connection()
        raise
