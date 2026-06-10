"""PostgreSQL connection configuration and pooling."""

import os
from psycopg import connect
from psycopg.rows import dict_row

PG_CONN = None


def build_pg_config() -> str:
    """Build a psycopg3 connection string from environment variables."""
    parts = [
        f"host={os.getenv('POSTGRES_HOST', 'localhost')}",
        f"port={os.getenv('POSTGRES_PORT', '5432')}",
        f"user={os.getenv('POSTGRES_USER', 'postgres')}",
        f"password={os.getenv('POSTGRES_PASS', 'postgres123')}",
        f"dbname={os.getenv('POSTGRES_NAME', 'postgres')}",
        "connect_timeout=15",
    ]
    if os.getenv("IS_LOCAL", "true") != "true":
        parts.append("sslmode=require")
    return " ".join(parts)


def get_connection(config: str | None = None):
    """Return a pooled PostgreSQL connection with dict rows."""
    global PG_CONN
    conn_str = config or build_pg_config()
    try:
        if PG_CONN is None or PG_CONN.closed:
            PG_CONN = connect(conn_str, row_factory=dict_row)
        return PG_CONN
    except Exception:
        PG_CONN = None
        raise


def reset_connection():
    """Reset the pooled connection (e.g. after errors)."""
    global PG_CONN
    PG_CONN = None
