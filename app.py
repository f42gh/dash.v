from __future__ import annotations

from datetime import date
import os
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DASH_DB_PATH", str(BASE_DIR / "data/dash.db"))).expanduser()
FRONTEND_DIR = BASE_DIR / "frontend"
UNTAGGED = "未分類"


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            DROP TABLE IF EXISTS effort_logs;
            DROP TABLE IF EXISTS impressive_tasks;
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price INTEGER NOT NULL CHECK(price >= 0),
                purchased_on TEXT NOT NULL,
                lifespan_months INTEGER NOT NULL CHECK(lifespan_months >= 1),
                retired_on TEXT,
                note TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS item_tags (
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                PRIMARY KEY (item_id, tag)
            );
            CREATE TABLE IF NOT EXISTS budgets (
                tag TEXT PRIMARY KEY,
                monthly_limit INTEGER NOT NULL CHECK(monthly_limit >= 0)
            );
            """
        )
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(items)")}
        if "recurring" not in cols:
            # recurring=1: subscription. price = fee per cycle, lifespan_months = billing cycle, retired_on = cancel date
            conn.execute("ALTER TABLE items ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0")


# --- amortization (straight-line, month granularity) ---

FOREVER = 10**9


def month_index(iso: str) -> int:
    d = date.fromisoformat(iso)
    return d.year * 12 + d.month - 1


def month_label(mi: int) -> str:
    return f"{mi // 12:04d}-{mi % 12 + 1:02d}"


def active_range(item: dict) -> tuple[int, int]:
    """[start, end) months during which the item costs money."""
    start = month_index(item["purchased_on"])
    end = FOREVER if item["recurring"] else start + item["lifespan_months"]
    if item["retired_on"]:
        end = min(end, month_index(item["retired_on"]) + 1)
    return start, end


def monthly_cost(item: dict) -> float:
    return item["price"] / item["lifespan_months"]


def cost_in_month(item: dict, mi: int) -> float:
    start, end = active_range(item)
    return monthly_cost(item) if start <= mi < end else 0.0


def enrich(item: dict, today_mi: int) -> dict:
    start, end = active_range(item)
    elapsed = min(max(today_mi - start + 1, 0), item["lifespan_months"])
    if item["retired_on"] and month_index(item["retired_on"]) <= today_mi:
        status = "retired"
    elif item["recurring"]:
        return {**item, "monthly_cost": round(monthly_cost(item)), "ends_on": None, "months_left": None, "book_value": 0, "status": "active"}
    elif today_mi >= start + item["lifespan_months"]:
        status = "paid_off"  # 償却済みだが使用中 = ボーナス期間
    else:
        status = "active"
    return {
        **item,
        "monthly_cost": round(monthly_cost(item)),
        "ends_on": month_label(start + item["lifespan_months"] - 1),
        "months_left": max(start + item["lifespan_months"] - today_mi - 1, 0),
        "book_value": 0 if status == "retired" else round(item["price"] - monthly_cost(item) * elapsed),
        "status": status,
    }


def load_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM items ORDER BY purchased_on DESC, id DESC").fetchall()
    tags: dict[int, list[str]] = {}
    for r in conn.execute("SELECT item_id, tag FROM item_tags ORDER BY tag"):
        tags.setdefault(r["item_id"], []).append(r["tag"])
    return [{**dict(r), "tags": tags.get(r["id"], [])} for r in rows]


def summarize(items: list[dict], budgets: dict[str, int], today_mi: int, back: int, ahead: int) -> dict:
    months = list(range(today_mi - back, today_mi + ahead + 1))
    timeline = [{"month": month_label(m), "cost": round(sum(cost_in_month(i, m) for i in items))} for m in months]

    by_tag: dict[str, float] = {}
    for i in items:
        c = cost_in_month(i, today_mi)
        for t in i["tags"] or [UNTAGGED]:
            by_tag[t] = by_tag.get(t, 0.0) + c
    tags = sorted(set(by_tag) | set(budgets), key=lambda t: -by_tag.get(t, 0))

    enriched = [enrich(i, today_mi) for i in items]
    return {
        "month": month_label(today_mi),
        "monthly_total": timeline[back]["cost"],
        "budget_total": sum(budgets.values()),
        "book_value": sum(i["book_value"] for i in enriched),
        "active_count": sum(i["status"] == "active" and not i["recurring"] for i in enriched),
        "subscription_total": round(sum(cost_in_month(i, today_mi) for i in items if i["recurring"])),
        "subscription_count": sum(i["status"] == "active" and bool(i["recurring"]) for i in enriched),
        "paid_off_count": sum(i["status"] == "paid_off" for i in enriched),
        "timeline": timeline,
        "tags": [{"tag": t, "cost": round(by_tag.get(t, 0)), "budget": budgets.get(t)} for t in tags],
        "ending_soon": sorted(
            (i for i in enriched if i["status"] == "active" and not i["recurring"] and i["months_left"] <= 3),
            key=lambda i: i["months_left"],
        ),
    }


# --- API ---

class ItemIn(BaseModel):
    name: str = Field(min_length=1)
    price: int = Field(ge=0)
    purchased_on: date
    lifespan_months: int = Field(ge=1, le=1200)
    retired_on: date | None = None
    note: str | None = None
    tags: list[str] = []
    recurring: bool = False


class BudgetIn(BaseModel):
    monthly_limit: int = Field(ge=0)


app = FastAPI(title="dash.v API")
allowed_origins = [
    origin.strip()
    for origin in os.getenv("DASH_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def root() -> HTMLResponse:
    # Cache-bust built assets: Cloudflare gives static files a 4h browser TTL.
    html = (FRONTEND_DIR / "index.html").read_text()
    for name in ("app.js", "styles.css"):
        version = int((FRONTEND_DIR / "dist" / name).stat().st_mtime)
        html = html.replace(f"/dist/{name}", f"/dist/{name}?v={version}")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


def save_item(conn: sqlite3.Connection, item_id: int | None, p: ItemIn) -> int:
    if p.retired_on and p.retired_on < p.purchased_on:
        raise HTTPException(status_code=422, detail="retired_on must be after purchased_on")
    values = [p.name.strip(), p.price, p.purchased_on.isoformat(), p.lifespan_months,
              p.retired_on.isoformat() if p.retired_on else None, p.note, int(p.recurring)]
    if item_id is None:
        item_id = conn.execute(
            "INSERT INTO items (name, price, purchased_on, lifespan_months, retired_on, note, recurring) VALUES (?, ?, ?, ?, ?, ?, ?)",
            values,
        ).lastrowid
    else:
        conn.execute(
            "UPDATE items SET name=?, price=?, purchased_on=?, lifespan_months=?, retired_on=?, note=?, recurring=? WHERE id=?",
            [*values, item_id],
        )
    conn.execute("DELETE FROM item_tags WHERE item_id = ?", [item_id])
    conn.executemany(
        "INSERT INTO item_tags (item_id, tag) VALUES (?, ?)",
        [(item_id, t) for t in {t.strip() for t in p.tags if t.strip()}],
    )
    return item_id


@app.get("/api/items")
def list_items() -> list[dict]:
    today_mi = month_index(date.today().isoformat())
    with get_conn() as conn:
        return [enrich(i, today_mi) for i in load_items(conn)]


@app.post("/api/items")
def create_item(payload: ItemIn) -> dict:
    with get_conn() as conn:
        return {"id": save_item(conn, None, payload)}


@app.put("/api/items/{item_id}")
def update_item(item_id: int, payload: ItemIn) -> dict:
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM items WHERE id = ?", [item_id]).fetchone():
            raise HTTPException(status_code=404, detail="Item not found")
        save_item(conn, item_id, payload)
    return {"id": item_id}


@app.delete("/api/items/{item_id}")
def delete_item(item_id: int) -> dict:
    with get_conn() as conn:
        if conn.execute("DELETE FROM items WHERE id = ?", [item_id]).rowcount == 0:
            raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@app.get("/api/budgets")
def list_budgets() -> dict[str, int]:
    with get_conn() as conn:
        return {r["tag"]: r["monthly_limit"] for r in conn.execute("SELECT * FROM budgets")}


@app.put("/api/budgets/{tag}")
def set_budget(tag: str, payload: BudgetIn) -> dict:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO budgets (tag, monthly_limit) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET monthly_limit = excluded.monthly_limit",
            [tag, payload.monthly_limit],
        )
    return {"tag": tag, "monthly_limit": payload.monthly_limit}


@app.delete("/api/budgets/{tag}")
def delete_budget(tag: str) -> dict:
    with get_conn() as conn:
        conn.execute("DELETE FROM budgets WHERE tag = ?", [tag])
    return {"ok": True}


@app.get("/api/summary")
def get_summary(back: int = 12, ahead: int = 12) -> dict:
    today_mi = month_index(date.today().isoformat())
    with get_conn() as conn:
        items = load_items(conn)
        budgets = {r["tag"]: r["monthly_limit"] for r in conn.execute("SELECT * FROM budgets")}
    return summarize(items, budgets, today_mi, max(back, 0), max(ahead, 0))
