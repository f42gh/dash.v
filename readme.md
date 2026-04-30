# dash.v (Python MVP)

Plotly Dash + SQLite で作る個人ダッシュボードです。  
最小完成版として、エントリー追加・削除・日次統計・カテゴリ統計・7日チャートを提供します。

## セットアップ

```bash
uv sync
```

## 起動

```bash
uv run python app.py
```

ブラウザで `http://127.0.0.1:8050` を開いて利用します。

## データ

- SQLite: `data/dash.db`
- テーブル: `entries`（起動時に自動作成）
