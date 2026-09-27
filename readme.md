# dash.v

持ち物とサブスクを「月あたりいくら」で見る個人用の台帳です。
FastAPI + SQLite + React（Bunでビルド）で動きます。

- **減価償却**: 価格と耐用期間から、購入月以降に毎月 `価格 / 耐用月数` を計上（定額・月単位）。引退日を入れるとその月で打ち切り
- **サブスク**: 1回の料金と課金周期（毎月・毎年など）を登録すると、解約日まで月額に均して計上
- **タグと予算**: 物品に複数タグを付け、タグごとに月予算を設定（複数タグの物品は各タグに全額計上）
- **分析**: 今の負担額、残り簿価、過去12ヶ月〜先12ヶ月の推移、3ヶ月以内に償却が終わる物品
- 表示単位は 日 / 月 / 年 で切り替え可能

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

ブラウザで `http://127.0.0.1:8000` を開きます。

Cloudflare Tunnel + Access で自分限定公開する手順は [`deploy/README.md`](deploy/README.md) を参照してください。

## テストデータ

- 実データ（デフォルト）: `data/dash.db`（Git管理外）
- テストデータ: `fixtures/test_dash.db`（架空のサンプル物品とサブスク）

```bash
# テストデータ生成
uv run python scripts/generate_test_data.py

# テストデータで起動
DASH_DB_PATH=fixtures/test_dash.db uv run uvicorn app:app --reload
```

## API

| Method | Path | 内容 |
|---|---|---|
| GET | `/api/items` | 物品・サブスク一覧（月額・残り簿価・状態つき） |
| POST / PUT / DELETE | `/api/items`, `/api/items/{id}` | 追加・更新・削除 |
| GET | `/api/budgets` | タグ別の月予算 |
| PUT / DELETE | `/api/budgets/{tag}` | 予算の設定・削除 |
| GET | `/api/summary` | 合計・タグ別・推移・償却終了間近 |

## データと運用

- テーブル: `items`, `item_tags`, `budgets`（起動時に自動作成・移行）
- 計算ロジックの確認: `uv run python test_app.py`
- バックアップ: `uv run python scripts/backup_db.py`
