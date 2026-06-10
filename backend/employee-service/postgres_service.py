"""Employee domain — CRUD operations."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

EMPLOYEE_COLS = (
    "id, first_name, last_name, email, job_title, department, "
    "hourly_rate, weekly_capacity_hours, is_active, created_at, updated_at"
)


def list_employees(department: str | None = None, is_active: bool | None = None, search: str | None = None) -> list:
    conn = get_connection()
    conditions = []
    params = []

    if department:
        conditions.append("department = %s")
        params.append(department)
    if is_active is not None:
        conditions.append("is_active = %s")
        params.append(is_active)
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR email ILIKE %s)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {EMPLOYEE_COLS} FROM employees {where} ORDER BY last_name, first_name", params)
        return cur.fetchall()


def get_employee(employee_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {EMPLOYEE_COLS} FROM employees WHERE id = %s", (employee_id,))
        return cur.fetchone()


def create_employee(data: dict) -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO employees (first_name, last_name, email, job_title, department,
                                       hourly_rate, weekly_capacity_hours, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING """ + EMPLOYEE_COLS,
                (
                    data["first_name"],
                    data["last_name"],
                    data.get("email"),
                    data.get("job_title"),
                    data.get("department"),
                    data.get("hourly_rate", 0),
                    data.get("weekly_capacity_hours", 40),
                    data.get("is_active", True),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Employee email already exists")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_employee(employee_id: str, data: dict) -> dict | None:
    allowed = {
        "first_name", "last_name", "email", "job_title", "department",
        "hourly_rate", "weekly_capacity_hours", "is_active",
    }
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_employee(employee_id)

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [employee_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE employees SET {set_clause} WHERE id = %s RETURNING {EMPLOYEE_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.UniqueViolation:
        conn.rollback()
        raise ValueError("Employee email already exists")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_employee(employee_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM project_resource_allocations WHERE employee_id = %s",
                (employee_id,),
            )
            if cur.fetchone()["cnt"] > 0:
                raise ValueError("Cannot delete employee with active allocations")
            cur.execute("DELETE FROM employees WHERE id = %s RETURNING id", (employee_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except ValueError:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        reset_connection()
        raise
