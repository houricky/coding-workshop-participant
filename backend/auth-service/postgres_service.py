"""Authentication domain — app_users persistence."""

from psycopg import errors

from pg_connection import get_connection, reset_connection


def _public_user(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "employee_id": row.get("employee_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def create_user(email: str, password_hash: str, role: str = "employee", employee_id: str | None = None) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_users (email, password_hash, role, employee_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id, email, password_hash, role, employee_id, created_at, updated_at
                """,
                (email, password_hash, role, employee_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Email already registered")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def get_user_by_email(email: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, password_hash, role, employee_id, created_at, updated_at FROM app_users WHERE email = %s",
            (email,),
        )
        return cur.fetchone()


def get_user_by_id(user_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, role, employee_id, created_at, updated_at FROM app_users WHERE id = %s",
            (user_id,),
        )
        return _public_user(cur.fetchone())
