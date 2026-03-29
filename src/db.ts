import { Database } from "bun:sqlite";

export const db = new Database("data/dash.db");

db.run(`
  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL,
    category   TEXT,
    score      INTEGER DEFAULT 3,
    note       TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL,
    urgent     INTEGER NOT NULL DEFAULT 0,
    important  INTEGER NOT NULL DEFAULT 0,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);
