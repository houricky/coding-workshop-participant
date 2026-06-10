"""Dashboard domain — portfolio-level read models."""

from pg_connection import get_connection


def get_portfolio_dashboard() -> dict:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM v_portfolio_dashboard")
        dashboard = cur.fetchone()
        cur.execute(
            """
            SELECT rag_status, COUNT(*) AS count
            FROM projects
            GROUP BY rag_status
            ORDER BY rag_status
            """
        )
        rag_breakdown = cur.fetchall()
    return {"dashboard": dashboard, "rag_breakdown": rag_breakdown}


def get_overallocations() -> list:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_employee_allocation_summary
            WHERE is_overallocated = TRUE
            ORDER BY allocation_percent DESC
            """
        )
        return cur.fetchall()


def get_projects_at_risk() -> list:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT * FROM v_project_summary
            WHERE rag_status IN ('amber', 'red')
            ORDER BY rag_progress_gap DESC
            """
        )
        return cur.fetchall()
