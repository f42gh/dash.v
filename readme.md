# dash.v (FastAPI + React)

FastAPI API + React UI + SQLite で構成した個人ダッシュボードです。  
入力ハードルを下げつつ、分析と編集体験をリッチに保てる構成にしています。

## セットアップ

```bash
uv sync
cd frontend
bun install
bun run build
```

## 起動

```bash
uv run uvicorn app:app --reload
```

ブラウザで `http://127.0.0.1:8000` を開いて利用します。

## データ

- SQLite: `data/dash.db`
- テーブル: `effort_logs`（起動時に自動作成）
