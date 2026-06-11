"""One-off Lambda entrypoint for applying SQL migrations inside the VPC."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from psycopg import connect


def _conninfo() -> str:
    parts = [
        f"host={os.environ['POSTGRES_HOST']}",
        f"port={os.environ.get('POSTGRES_PORT', '5432')}",
        f"user={os.environ['POSTGRES_USER']}",
        f"password={os.environ['POSTGRES_PASS']}",
        f"dbname={os.environ['POSTGRES_NAME']}",
        f"connect_timeout={os.environ.get('PGCONNECT_TIMEOUT', '15')}",
        f"sslmode={os.environ.get('PGSSLMODE', 'require')}",
    ]
    return " ".join(parts)


def _split_sql(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    i = 0
    dollar_tag: str | None = None
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False

    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""

        if in_line_comment:
            current.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            current.append(ch)
            if ch == "*" and nxt == "/":
                current.append(nxt)
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                current.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
            else:
                current.append(ch)
                i += 1
            continue

        if in_single:
            current.append(ch)
            if ch == "'" and nxt == "'":
                current.append(nxt)
                i += 2
            elif ch == "'":
                in_single = False
                i += 1
            else:
                i += 1
            continue

        if in_double:
            current.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "-" and nxt == "-":
            current.extend([ch, nxt])
            in_line_comment = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            current.extend([ch, nxt])
            in_block_comment = True
            i += 2
            continue

        if ch == "'":
            current.append(ch)
            in_single = True
            i += 1
            continue

        if ch == '"':
            current.append(ch)
            in_double = True
            i += 1
            continue

        if ch == "$":
            match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[i:])
            if match:
                dollar_tag = match.group(0)
                current.append(dollar_tag)
                i += len(dollar_tag)
                continue

        if ch == ";":
            current.append(ch)
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    return statements


def _apply_file(conn, sql_file: Path) -> int:
    statements = _split_sql(sql_file.read_text())
    with conn.cursor() as cur:
        for idx, statement in enumerate(statements, start=1):
            try:
                cur.execute(statement)
            except Exception as exc:
                preview = statement.replace("\n", " ")[:300]
                raise RuntimeError(f"{sql_file.name} statement {idx} failed: {preview}") from exc
    return len(statements)


def _apply_dir(conn, sql_dir: Path) -> list[dict]:
    applied = []
    for sql_file in sorted(sql_dir.glob("*.sql")):
        applied.append({"file": sql_file.name, "statements": _apply_file(conn, sql_file)})
    return applied


def handler(event=None, context=None):
    event = event or {}
    root = Path(__file__).resolve().parent
    seed = bool(event.get("seed"))

    with connect(_conninfo(), autocommit=True) as conn:
        schema = _apply_dir(conn, root / "schema")
        seed_files = _apply_dir(conn, root / "seed") if seed else []
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT enumlabel
                FROM pg_enum
                JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
                WHERE typname = 'deliverable_status'
                ORDER BY enumsortorder
                """
            )
            deliverable_status = [row[0] for row in cur.fetchall()]

    return {
        "ok": True,
        "schema": schema,
        "seed": seed_files,
        "checks": {"deliverable_status": deliverable_status},
    }


if __name__ == "__main__":
    print(json.dumps(handler({"seed": os.environ.get("ACME_SEED_DB") == "true"}), indent=2))
