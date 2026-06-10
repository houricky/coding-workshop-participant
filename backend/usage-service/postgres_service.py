"""Resource usage domain — actual hours and cost tracking."""

from psycopg import errors

from pg_connection import get_connection, reset_connection

USAGE_COLS = (
    "id, project_id, employee_id, usage_date, hours_used, cost_amount, "
    "description, created_at, updated_at"
)


def get_employee_rate(employee_id: str) -> float | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT hourly_rate FROM employees WHERE id = %s", (employee_id,))
        row = cur.fetchone()
        return float(row["hourly_rate"]) if row else None


def compute_cost(employee_id: str, hours_used: float, cost_amount: float | None) -> float:
    if cost_amount is not None:
        return float(cost_amount)
    rate = get_employee_rate(employee_id)
    if rate is None:
        raise ValueError("Employee not found")
    return round(hours_used * rate, 2)


def list_usage(
    project_id: str | None = None,
    employee_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list:
    conn = get_connection()
    conditions = []
    params = []
    if project_id:
        conditions.append("project_id = %s")
        params.append(project_id)
    if employee_id:
        conditions.append("employee_id = %s")
        params.append(employee_id)
    if from_date:
        conditions.append("usage_date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("usage_date <= %s")
        params.append(to_date)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {USAGE_COLS} FROM project_resource_usage {where} ORDER BY usage_date DESC", params)
        return cur.fetchall()


def get_usage(usage_id: str) -> dict | None:
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(f"SELECT {USAGE_COLS} FROM project_resource_usage WHERE id = %s", (usage_id,))
        return cur.fetchone()


def create_usage(data: dict) -> dict:
    cost = compute_cost(data["employee_id"], float(data["hours_used"]), data.get("cost_amount"))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO project_resource_usage
                    (project_id, employee_id, usage_date, hours_used, cost_amount, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING {USAGE_COLS}
                """,
                (
                    data["project_id"],
                    data["employee_id"],
                    data["usage_date"],
                    data["hours_used"],
                    cost,
                    data.get("description"),
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except errors.ForeignKeyViolation:
        conn.rollback()
        raise ValueError("Invalid project_id or employee_id")
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def update_usage(usage_id: str, data: dict) -> dict | None:
    existing = get_usage(usage_id)
    if not existing:
        return None

    allowed = {"usage_date", "hours_used", "cost_amount", "description"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return existing

    hours = float(updates.get("hours_used", existing["hours_used"]))
    employee_id = existing["employee_id"]
    if "hours_used" in updates or "cost_amount" in updates:
        updates["cost_amount"] = compute_cost(employee_id, hours, updates.get("cost_amount"))

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [usage_id]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE project_resource_usage SET {set_clause} WHERE id = %s RETURNING {USAGE_COLS}",
                params,
            )
            row = cur.fetchone()
            conn.commit()
            return row
    except Exception:
        conn.rollback()
        reset_connection()
        raise


def delete_usage(usage_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_resource_usage WHERE id = %s RETURNING id", (usage_id,))
            row = cur.fetchone()
            conn.commit()
            return row is not None
    except Exception:
        conn.rollback()
        reset_connection()
        raise
