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

## DB切り替え（実データ / テストデータ）

- 実データ（デフォルト）: `data/dash.db`
- テストデータ: `fixtures/test_dash.db`（Git管理可能）

```bash
# テストデータ生成
uv run python scripts/generate_test_data.py --output fixtures/test_dash.db --months 6 --seed 42

# テストデータで起動
DASH_DB_PATH=fixtures/test_dash.db uv run uvicorn app:app --reload
```

`DASH_DB_PATH` を指定しない場合は `data/dash.db` を使用します。

## データ

- SQLite: `data/dash.db`
- テーブル: `effort_logs`（起動時に自動作成）
