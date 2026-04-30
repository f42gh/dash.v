from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
import random
import sqlite3


EFFORT_NOTES = {
    "low": ["着手だけ", "準備中心", "小さく開始"],
    "mid": ["軽く進めた", "確認系を消化", "細かいタスクを実施"],
    "high": ["難所を突破", "複数タスク完了", "かなり進んだ日"],
    "peak": ["節目突破", "マイルストーン前進", "大きな進捗を達成"],
}


@dataclass
class Config:
    output: Path
    months: int
    seed: int


def init_db(conn: sqlite3.Connection) -> None:
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


def weighted_effort(weekday: int) -> int:
    if weekday >= 5:
        return random.choices([15, 25, 35, 45, 55, 65], weights=[20, 25, 20, 16, 12, 7], k=1)[0]
    return random.choices([20, 35, 45, 55, 65, 75, 85, 95], weights=[6, 10, 16, 22, 20, 14, 8, 4], k=1)[0]


def logs_for_day(day: date) -> int:
    if day.weekday() >= 5:
        return random.randint(0, 5)
    return random.randint(3, 12)


def note_for_effort(effort: int) -> str:
    if effort < 35:
        return random.choice(EFFORT_NOTES["low"])
    if effort < 60:
        return random.choice(EFFORT_NOTES["mid"])
    if effort < 85:
        return random.choice(EFFORT_NOTES["high"])
    return random.choice(EFFORT_NOTES["peak"])


def insert_synthetic_data(conn: sqlite3.Connection, months: int) -> int:
    today = date.today()
    start = today - timedelta(days=months * 30)
    total = 0

    d = start
    while d <= today:
        n = logs_for_day(d)
        hours = sorted(random.sample(range(7, 24), k=min(n, 17)))
        for hour in hours:
            effort = weighted_effort(d.weekday())
            note = note_for_effort(effort)
            created_at = datetime(d.year, d.month, d.day, hour, random.randint(0, 59), random.randint(0, 59))
            edit_done = 1 if created_at < (datetime.now() - timedelta(days=7)) else 0
            conn.execute(
                """
                INSERT INTO effort_logs (date_key, hour_key, effort, note, edit_done, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    d.isoformat(),
                    hour,
                    effort,
                    note,
                    edit_done,
                    created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ],
            )
            total += 1
        d += timedelta(days=1)

    return total


def parse_args() -> Config:
    parser = argparse.ArgumentParser(description="Generate synthetic effort log test data.")
    parser.add_argument("--output", type=Path, default=Path("fixtures/test_dash.db"))
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    return Config(output=args.output, months=args.months, seed=args.seed)


def main() -> None:
    config = parse_args()
    random.seed(config.seed)

    config.output.parent.mkdir(parents=True, exist_ok=True)
    if config.output.exists():
        config.output.unlink()

    conn = sqlite3.connect(config.output)
    try:
        init_db(conn)
        rows = insert_synthetic_data(conn, config.months)
        conn.commit()
    finally:
        conn.close()

    print(f"Generated {rows} logs into {config.output}")


if __name__ == "__main__":
    main()
