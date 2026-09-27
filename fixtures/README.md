# Test Data Fixtures

このディレクトリは、共有可能なテストデータを置く場所です。

- `test_dash.db`: サンプル物品10件とタグ予算が入ったSQLite

生成コマンド:

```bash
uv run python scripts/generate_test_data.py --output fixtures/test_dash.db
```

起動切り替え:

```bash
DASH_DB_PATH=fixtures/test_dash.db uv run uvicorn app:app --reload
```

実データはデフォルトの `data/dash.db` を使います。
