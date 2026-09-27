-- recurring=1: subscription. price = fee per cycle, lifespan_months = billing cycle, retired_on = cancel date
CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK(price >= 0),
    purchased_on TEXT NOT NULL,
    lifespan_months INTEGER NOT NULL CHECK(lifespan_months >= 1),
    retired_on TEXT,
    note TEXT,
    recurring INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (item_id, tag)
);
CREATE TABLE budgets (
    tag TEXT PRIMARY KEY,
    monthly_limit INTEGER NOT NULL CHECK(monthly_limit >= 0)
);
