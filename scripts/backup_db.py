from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import sqlite3


BASE_DIR = Path(__file__).resolve().parents[1]


def backup_database(source: Path, output_dir: Path) -> Path:
    if not source.exists():
        raise FileNotFoundError(f"Database not found: {source}")

    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = output_dir / f"dash-{timestamp}.db"

    with sqlite3.connect(source) as source_conn, sqlite3.connect(destination) as destination_conn:
        source_conn.backup(destination_conn)

    with sqlite3.connect(destination) as verify_conn:
        result = verify_conn.execute("PRAGMA integrity_check").fetchone()
    if result != ("ok",):
        destination.unlink(missing_ok=True)
        raise RuntimeError(f"Backup integrity check failed: {destination}")

    return destination


def main() -> None:
    default_source = Path(os.getenv("DASH_DB_PATH", str(BASE_DIR / "data/dash.db"))).expanduser()
    parser = argparse.ArgumentParser(description="Create a consistent SQLite backup")
    parser.add_argument("--source", type=Path, default=default_source)
    parser.add_argument("--output-dir", type=Path, default=BASE_DIR / "backups")
    args = parser.parse_args()

    destination = backup_database(args.source, args.output_dir)
    print(f"Backup created: {destination}")


if __name__ == "__main__":
    main()
