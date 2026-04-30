from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


DB_PATH = Path(os.getenv("DASH_DB_PATH", "data/dash.db"))
FRONTEND_DIR = Path("frontend")


def now_keys() -> tuple[str, int]:
    now = datetime.now()
    return now.strftime("%Y-%m-%d"), now.hour


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS effort_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_key TEXT NOT NULL,
                hour_key INTEGER NOT NULL,
                effort INTEGER NOT NULL CHECK(effort BETWEEN 0 AND 100),
                note TEXT,
                edit_done INTEGER NOT NULL DEFAULT 0 CHECK(edit_done IN (0, 1)),
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
            """
        )
        ensure_effort_logs_columns(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS impressive_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_log_id INTEGER,
                title TEXT NOT NULL,
                effort INTEGER NOT NULL CHECK(effort BETWEEN 0 AND 100),
                note TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
            """
        )
        seed_impressive_tasks(conn)
        auto_close_stale_edits(conn)


def ensure_effort_logs_columns(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(effort_logs)").fetchall()}
    if "edit_done" not in cols:
        conn.execute(
            """
            ALTER TABLE effort_logs
            ADD COLUMN edit_done INTEGER NOT NULL DEFAULT 0 CHECK(edit_done IN (0, 1))
            """
        )


def auto_close_stale_edits(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE effort_logs
        SET edit_done = 1, updated_at = datetime('now', 'localtime')
        WHERE edit_done = 0
          AND datetime(created_at) <= datetime('now', '-7 days')
        """
    )


def seed_impressive_tasks(conn: sqlite3.Connection) -> None:
    exists = conn.execute("SELECT COUNT(*) AS c FROM impressive_tasks").fetchone()["c"]
    if exists > 0:
        return
    rows = conn.execute(
        """
        SELECT id, effort, note, date_key, hour_key
        FROM effort_logs
        ORDER BY effort DESC, date_key DESC, hour_key DESC
        LIMIT 3
        """
    ).fetchall()
    for row in rows:
        title = f"Past Win {row['date_key']} {int(row['hour_key']):02d}:00"
        conn.execute(
            """
            INSERT INTO impressive_tasks (source_log_id, title, effort, note)
            VALUES (?, ?, ?, ?)
            """,
            [row["id"], title, row["effort"], row["note"]],
        )


class CreateEffortLog(BaseModel):
    effort: int = Field(ge=0, le=100)
    note: str | None = None


class UpdateEffortLog(BaseModel):
    date_key: str
    hour_key: int = Field(ge=0, le=23)
    effort: int = Field(ge=0, le=100)
    note: str | None = None


app = FastAPI(title="dash.v API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def root() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/time")
def get_time() -> dict:
    date_key, hour_key = now_keys()
    return {"date_key": date_key, "hour_key": hour_key, "updated_at": datetime.now().isoformat()}


@app.get("/api/latest-date")
def get_latest_date() -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT COALESCE(MAX(date_key), date('now','localtime')) AS latest_date FROM effort_logs").fetchone()
    return {"latest_date": row["latest_date"]}


@app.post("/api/efforts")
def create_effort(payload: CreateEffortLog) -> dict:
    date_key, hour_key = now_keys()
    with get_conn() as conn:
        result = conn.execute(
            """
            INSERT INTO effort_logs (date_key, hour_key, effort, note)
            VALUES (?, ?, ?, ?)
            """,
            [date_key, hour_key, payload.effort, payload.note],
        )
        inserted = conn.execute("SELECT * FROM effort_logs WHERE id = ?", [result.lastrowid]).fetchone()
    return dict(inserted)


@app.get("/api/efforts")
def list_efforts(date: str) -> list[dict]:
    with get_conn() as conn:
        auto_close_stale_edits(conn)
        rows = conn.execute(
            """
            SELECT id, date_key, hour_key, effort, note, edit_done, created_at, updated_at
            FROM effort_logs
            WHERE date_key = ?
            ORDER BY hour_key DESC, id DESC
            """,
            [date],
        ).fetchall()
    return [dict(row) for row in rows]


@app.patch("/api/efforts/{log_id}")
def update_effort(log_id: int, payload: UpdateEffortLog) -> dict:
    with get_conn() as conn:
        auto_close_stale_edits(conn)
        exists = conn.execute("SELECT id, edit_done FROM effort_logs WHERE id = ?", [log_id]).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Log not found")
        if int(exists["edit_done"]) == 1:
            raise HTTPException(status_code=403, detail="Edit is locked for this log")
        conn.execute(
            """
            UPDATE effort_logs
            SET date_key = ?, hour_key = ?, effort = ?, note = ?, edit_done = 1, updated_at = datetime('now', 'localtime')
            WHERE id = ?
            """,
            [payload.date_key, payload.hour_key, payload.effort, payload.note, log_id],
        )
        updated = conn.execute("SELECT * FROM effort_logs WHERE id = ?", [log_id]).fetchone()
    return dict(updated)


@app.delete("/api/efforts/{log_id}")
def remove_effort(log_id: int) -> dict:
    with get_conn() as conn:
        deleted = conn.execute("DELETE FROM effort_logs WHERE id = ?", [log_id]).rowcount
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"ok": True, "id": log_id}


@app.get("/api/stats")
def get_stats(date: str) -> dict:
    with get_conn() as conn:
        auto_close_stale_edits(conn)
        day = conn.execute(
            """
            SELECT COUNT(*) AS total, ROUND(AVG(effort), 2) AS avg_effort
            FROM effort_logs
            WHERE date_key = ?
            """,
            [date],
        ).fetchone()
        weekly = conn.execute(
            """
            SELECT date_key, COUNT(*) AS count, ROUND(AVG(effort), 2) AS avg_effort
            FROM effort_logs
            WHERE date_key >= date(?, '-6 days') AND date_key <= ?
            GROUP BY date_key
            ORDER BY date_key
            """,
            [date, date],
        ).fetchall()
        by_hour = conn.execute(
            """
            SELECT hour_key, COUNT(*) AS count, ROUND(AVG(effort), 2) AS avg_effort
            FROM effort_logs
            WHERE date_key = ?
            GROUP BY hour_key
            ORDER BY hour_key
            """,
            [date],
        ).fetchall()
    return {
        "day": dict(day),
        "weekly": [dict(row) for row in weekly],
        "by_hour": [dict(row) for row in by_hour],
    }


@app.get("/api/impressive-tasks")
def list_impressive_tasks() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, source_log_id, title, effort, note, created_at
            FROM impressive_tasks
            ORDER BY effort DESC, id DESC
            LIMIT 5
            """
        ).fetchall()
    return [dict(row) for row in rows]
