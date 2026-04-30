from __future__ import annotations

from datetime import date
import sqlite3
from pathlib import Path

import pandas as pd
from dash import Dash, Input, Output, State, callback_context, dash_table, dcc, html
import plotly.express as px


DB_PATH = Path("data/dash.db")
CATEGORIES = ["仕事", "学習", "運動", "生活", "趣味"]


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT,
                score INTEGER DEFAULT 3,
                note TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
            """
        )


def load_entries(target_date: str) -> pd.DataFrame:
    with get_conn() as conn:
        query = """
        SELECT id, date, title, category, score, note, created_at
        FROM entries
        WHERE date = ?
        ORDER BY created_at DESC, id DESC
        """
        return pd.read_sql_query(query, conn, params=[target_date])


def load_stats(target_date: str) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    with get_conn() as conn:
        today = conn.execute(
            """
            SELECT COUNT(*) AS total, ROUND(AVG(score), 1) AS avg_score
            FROM entries
            WHERE date = ?
            """,
            [target_date],
        ).fetchone()

        by_category = pd.read_sql_query(
            """
            SELECT category, COUNT(*) AS count, ROUND(AVG(score), 1) AS avg_score
            FROM entries
            WHERE date = ?
            GROUP BY category
            ORDER BY count DESC
            """,
            conn,
            params=[target_date],
        )

        weekly = pd.read_sql_query(
            """
            SELECT date, COUNT(*) AS count, ROUND(AVG(score), 1) AS avg_score
            FROM entries
            WHERE date >= date(?, '-6 days') AND date <= ?
            GROUP BY date
            ORDER BY date
            """,
            conn,
            params=[target_date, target_date],
        )

    return {"total": today["total"], "avg_score": today["avg_score"]}, by_category, weekly


def add_entry(target_date: str, title: str, category: str, score: int, note: str | None) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO entries (date, title, category, score, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            [target_date, title, category, score, note],
        )


def delete_entry(entry_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM entries WHERE id = ?", [entry_id])


def build_kpi(today_stats: dict) -> html.Div:
    avg_text = "-" if today_stats["avg_score"] is None else str(today_stats["avg_score"])
    return html.Div(
        [
            html.Div([html.H3(f"{today_stats['total']}"), html.P("エントリー件数")], className="kpi-card"),
            html.Div([html.H3(avg_text), html.P("平均スコア")], className="kpi-card"),
        ],
        className="kpi-grid",
    )


init_db()
app = Dash(__name__)
app.title = "dash.v"

app.layout = html.Div(
    [
        html.H1("dash.v"),
        html.P("Python + Plotly Dash + SQLite", className="subtitle"),
        dcc.Store(id="refresh-token", data=0),
        html.Div(
            [
                dcc.DatePickerSingle(
                    id="date-picker",
                    date=date.today().isoformat(),
                    display_format="YYYY-MM-DD",
                )
            ],
            className="section",
        ),
        html.Div(
            [
                dcc.Input(id="title-input", type="text", placeholder="やったこと", debounce=True),
                dcc.Dropdown(
                    id="category-input",
                    options=[{"label": c, "value": c} for c in CATEGORIES],
                    value=CATEGORIES[0],
                    clearable=False,
                ),
                dcc.Slider(id="score-input", min=1, max=5, step=1, value=3, marks={i: str(i) for i in range(1, 6)}),
                dcc.Input(id="note-input", type="text", placeholder="メモ（任意）", debounce=True),
                html.Button("追加", id="add-button", n_clicks=0, className="primary"),
                html.Div(id="form-message", className="form-message"),
            ],
            className="section form-grid",
        ),
        html.Div(id="kpi-container", className="section"),
        html.Div(
            [
                dcc.Graph(id="weekly-chart"),
                dcc.Graph(id="category-chart"),
            ],
            className="section chart-grid",
        ),
        html.Div(
            [
                dash_table.DataTable(
                    id="entries-table",
                    columns=[
                        {"name": "ID", "id": "id"},
                        {"name": "Title", "id": "title"},
                        {"name": "Category", "id": "category"},
                        {"name": "Score", "id": "score"},
                        {"name": "Note", "id": "note"},
                        {"name": "Created", "id": "created_at"},
                    ],
                    data=[],
                    page_size=12,
                    style_table={"overflowX": "auto"},
                    style_cell={"textAlign": "left", "padding": "8px"},
                ),
                dcc.Dropdown(id="delete-id-dropdown", placeholder="削除するIDを選択"),
                html.Button("選択IDを削除", id="delete-button", n_clicks=0, className="danger"),
                html.Div(id="delete-message", className="form-message"),
            ],
            className="section",
        ),
    ],
    className="container",
)


@app.callback(
    Output("refresh-token", "data"),
    Output("title-input", "value"),
    Output("note-input", "value"),
    Output("score-input", "value"),
    Output("form-message", "children"),
    Input("add-button", "n_clicks"),
    State("date-picker", "date"),
    State("title-input", "value"),
    State("category-input", "value"),
    State("score-input", "value"),
    State("note-input", "value"),
    State("refresh-token", "data"),
    prevent_initial_call=True,
)
def on_add(n_clicks: int, target_date: str, title: str, category: str, score: int, note: str, token: int):
    if not n_clicks:
        return token, title, note, score, ""
    if not title or not title.strip():
        return token, title, note, score, "タイトルは必須です。"
    add_entry(target_date, title.strip(), category, int(score), (note or "").strip() or None)
    return token + 1, "", "", 3, "追加しました。"


@app.callback(
    Output("refresh-token", "data", allow_duplicate=True),
    Output("delete-message", "children"),
    Input("delete-button", "n_clicks"),
    State("delete-id-dropdown", "value"),
    State("refresh-token", "data"),
    prevent_initial_call=True,
)
def on_delete(n_clicks: int, entry_id: int | None, token: int):
    if not n_clicks:
        return token, ""
    if entry_id is None:
        return token, "削除するIDを選択してください。"
    delete_entry(int(entry_id))
    return token + 1, f"ID {entry_id} を削除しました。"


@app.callback(
    Output("kpi-container", "children"),
    Output("entries-table", "data"),
    Output("delete-id-dropdown", "options"),
    Output("weekly-chart", "figure"),
    Output("category-chart", "figure"),
    Input("date-picker", "date"),
    Input("refresh-token", "data"),
)
def refresh_view(target_date: str, _token: int):
    entries = load_entries(target_date)
    today_stats, by_category, weekly = load_stats(target_date)

    if weekly.empty:
        weekly_fig = px.bar(title="過去7日間の記録件数")
    else:
        weekly_fig = px.bar(weekly, x="date", y="count", title="過去7日間の記録件数", text_auto=True)
    weekly_fig.update_layout(margin=dict(l=20, r=20, t=50, b=20))

    if by_category.empty:
        category_fig = px.pie(title="カテゴリ別内訳")
    else:
        category_fig = px.pie(by_category, names="category", values="count", title="カテゴリ別内訳")
    category_fig.update_layout(margin=dict(l=20, r=20, t=50, b=20))

    delete_options = [{"label": f"{row.id}: {row.title}", "value": int(row.id)} for row in entries.itertuples()]

    return (
        build_kpi(today_stats),
        entries.to_dict("records"),
        delete_options,
        weekly_fig,
        category_fig,
    )


app.index_string = """
<!DOCTYPE html>
<html>
  <head>
    {%metas%}
    <title>{%title%}</title>
    {%favicon%}
    {%css%}
    <style>
      body { margin: 0; font-family: sans-serif; background: #f7f8fa; color: #1f2937; }
      .container { max-width: 1080px; margin: 0 auto; padding: 24px; }
      h1 { margin-bottom: 6px; }
      .subtitle { color: #6b7280; margin-top: 0; }
      .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .kpi-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
      .kpi-card h3 { margin: 0; font-size: 28px; }
      .kpi-card p { margin: 4px 0 0; color: #6b7280; }
      .form-grid { display: grid; gap: 12px; }
      .chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .primary, .danger { border: none; border-radius: 8px; padding: 10px 14px; color: #fff; cursor: pointer; width: fit-content; }
      .primary { background: #16a34a; }
      .danger { background: #dc2626; margin-top: 10px; }
      .form-message { color: #374151; font-size: 14px; min-height: 18px; }
      @media (max-width: 900px) {
        .kpi-grid, .chart-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    {%app_entry%}
    <footer>
      {%config%}
      {%scripts%}
      {%renderer%}
    </footer>
  </body>
</html>
"""


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=8050)
