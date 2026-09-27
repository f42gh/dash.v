# dash.v

持ち物とサブスクを「月あたりいくら」で見る個人用の台帳です。
Cloudflare Workers + D1 で動き、画面は React（Bun でビルド）です。

- **減価償却**: 価格と耐用期間から、購入月以降に毎月 `価格 / 耐用月数` を計上（定額・月単位）。引退日を入れるとその月で打ち切り
- **サブスク**: 1回の料金と課金周期（毎月・毎年など）を登録すると、解約日まで月額に均して計上
- **タグと予算**: 物品に複数タグを付け、タグごとに月予算を設定（複数タグの物品は各タグに全額計上）
- **分析**: 今の負担額、残り簿価、過去12ヶ月〜先12ヶ月の推移、3ヶ月以内に償却が終わる物品
- 表示単位は 日 / 月 / 年 で切り替え可能

## 開発

```bash
bun install
bun run dev        # ローカルD1にマイグレーションを当てて http://localhost:8787 で起動
bun test           # 償却・サブスク・入力チェックのテスト
bun run typecheck
```

サンプルデータを入れる:

```bash
bunx wrangler d1 execute dash-v --local --file fixtures/seed.sql
```

## デプロイ

```bash
bun run deploy     # 本番D1にマイグレーションを当ててから wrangler deploy
```

- `dash.candv.dev` にカスタムドメインで配信（`workers.dev` とプレビューURLは無効）
- Cloudflare Zero Trust の Access アプリケーションで `dash.candv.dev` を自分のメールアドレスのみに制限
- スキーマ変更は `migrations/` に連番SQLを追加（`bunx wrangler d1 migrations create dash-v <name>`）
- バックアップ: `bunx wrangler d1 export dash-v --remote --output backups/dash.sql`

## API

| Method | Path | 内容 |
|---|---|---|
| GET | `/api/items` | 物品・サブスク一覧（月額・残り簿価・状態つき） |
| POST / PUT / DELETE | `/api/items`, `/api/items/{id}` | 追加・更新・削除 |
| GET | `/api/budgets` | タグ別の月予算 |
| PUT / DELETE | `/api/budgets/{tag}` | 予算の設定・削除 |
| GET | `/api/summary` | 合計・タグ別・推移・償却終了間近 |
