from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


DB_PATH = Path("data/dash.db")
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
                effort INTEGER NOT NULL CHECK(effort BETWEEN 1 AND 5),
                note TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
            """
        )


class CreateEffortLog(BaseModel):
    effort: int = Field(ge=1, le=5)
    note: str | None = None


class UpdateEffortLog(BaseModel):
    date_key: str
    hour_key: int = Field(ge=0, le=23)
    effort: int = Field(ge=1, le=5)
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
        rows = conn.execute(
            """
            SELECT id, date_key, hour_key, effort, note, created_at, updated_at
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
        exists = conn.execute("SELECT id FROM effort_logs WHERE id = ?", [log_id]).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Log not found")
        conn.execute(
            """
            UPDATE effort_logs
            SET date_key = ?, hour_key = ?, effort = ?, note = ?, updated_at = datetime('now', 'localtime')
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
