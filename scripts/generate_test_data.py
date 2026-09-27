"""Generate a sample items DB: uv run python scripts/generate_test_data.py"""
from __future__ import annotations

import argparse
from datetime import date
import os
from pathlib import Path
import sys

# (name, price, months ago purchased, lifespan months, tags, retired months ago)
SAMPLES = [
    ("MacBook Pro", 348_000, 20, 48, ["PC", "仕事"], None),
    ("外部モニター", 62_000, 30, 60, ["PC", "仕事"], None),
    ("iPhone", 159_800, 14, 36, ["スマホ"], None),
    ("旧iPhone", 124_800, 50, 36, ["スマホ"], 14),
    ("ワークチェア", 98_000, 70, 60, ["家具"], None),
    ("冷蔵庫", 145_000, 40, 120, ["家電"], None),
    ("ドラム式洗濯機", 238_000, 10, 96, ["家電"], None),
    ("ランニングシューズ", 18_700, 5, 8, ["衣類", "運動"], None),
    ("冬コート", 42_000, 22, 36, ["衣類"], None),
    ("電動歯ブラシ替え", 4_200, 1, 3, [], None),
]


def shift(months_ago: int) -> str:
    t = date.today()
    mi = t.year * 12 + t.month - 1 - months_ago
    return date(mi // 12, mi % 12 + 1, 1).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("fixtures/test_dash.db"))
    out = parser.parse_args().output
    out.unlink(missing_ok=True)
    os.environ["DASH_DB_PATH"] = str(out)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import app  # reads DASH_DB_PATH on import

    app.init_db()
    with app.get_conn() as conn:
        for name, price, ago, life, tags, retired in SAMPLES:
            app.save_item(conn, None, app.ItemIn(
                name=name, price=price, purchased_on=shift(ago), lifespan_months=life,
                retired_on=shift(retired) if retired is not None else None, tags=tags,
            ))
        for name, fee, ago, cycle in [("Netflix", 1_590, 18, 1), ("Amazonプライム", 5_900, 28, 12), ("iCloud+", 400, 30, 1)]:
            app.save_item(conn, None, app.ItemIn(
                name=name, price=fee, purchased_on=shift(ago), lifespan_months=cycle, tags=["サブスク"], recurring=True,
            ))
        conn.executemany("INSERT INTO budgets VALUES (?, ?)", [("PC", 9_000), ("スマホ", 3_000), ("家電", 3_000)])
    print(f"Generated {len(SAMPLES)} items into {out}")


if __name__ == "__main__":
    main()
