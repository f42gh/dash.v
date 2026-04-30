# dash.xs 開発ロードマップ

> Bun + Hono + SQLite + HTMX による最小構成の個人ダッシュボード

---

## 2026-04-30 追記: Plotly Dash 移行プラン

> 方針: 現在の `dash.v`（Bun + React + SQLite）の機能を、TypeScript を使わず Python + Plotly Dash に段階移行する

### Phase A: 最小移植（読み取り中心）
1. Python 環境を用意し、`dash`, `plotly`, `pandas` を導入
2. 既存 SQLite（`data/dash.db`）をそのまま利用
3. Dash で以下を表示
- 日付選択
- エントリー一覧
- 今日の件数・平均スコア
- 過去7日ミニチャート
- カテゴリ別集計

### Phase B: 入力・更新機能の移植
1. エントリー追加フォーム（title/category/score/note）
2. エントリー削除
3. 保存後に統計と一覧を同時更新（Dash callback）

### Phase C: UX改善
1. レイアウト整理（ヘッダー、KPIカード、チャート、一覧）
2. カテゴリや期間のフィルタ追加
3. 見た目調整（テーマ、余白、可読性）

### Phase D: 運用整理
1. 実行コマンド統一（`python app.py` など）
2. README を現行構成に更新
3. 旧 Bun/React 実装の扱いを決定
- 並行運用（`src/` を保持）
- 置換運用（Dash に一本化）

### 先に決めておく事項
- DB スキーマは現状維持（`entries` テーブル再利用）
- API 層は作らず、Dash から SQLite を直接参照
- 初期は単一ユーザー前提（認証なし）

---

## Phase 1: 環境構築

### やること
1. Bun インストール
2. プロジェクト初期化
3. Hono インストール
4. ファイル構成を作る

### コマンド

```bash
# Bun インストール（未導入の場合）
curl -fsSL https://bun.sh/install | bash

# プロジェクト初期化
bun init

# 依存パッケージ
bun add hono
```

### ファイル構成

```
dash.xs/
├── src/
│   ├── index.ts          # サーバーエントリーポイント
│   ├── db.ts             # SQLite接続・テーブル定義
│   └── routes/
│       ├── entries.ts    # 記録のCRUD
│       └── stats.ts      # 集計・分析
├── public/
│   └── style.css
├── views/
│   └── index.html        # メインUI（HTMX）
└── data/
    └── dash.db           # SQLiteファイル（gitignoreに入れる）
```

### アドバイス
- `bun init` は TypeScript をデフォルトで使える。`index.ts` から始めるとよい
- `data/` ディレクトリは `.gitignore` に追加して DB ファイルをコミットしないようにする
- Hono は `hono/bun` アダプターを使う（後述）

---

## Phase 2: DB 設計

### やること
- SQLite のテーブル設計
- 起動時にテーブルがなければ自動作成する仕組み

### スキーマ例

```sql
CREATE TABLE IF NOT EXISTS entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL,         -- "2026-03-11" 形式
  title     TEXT NOT NULL,         -- やったこと
  category  TEXT,                  -- 仕事 / 学習 / 運動 など
  score     INTEGER DEFAULT 3,     -- 達成度 1〜5
  note      TEXT,                  -- 補足メモ（任意）
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### db.ts の基本形

```ts
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
```

### アドバイス
- `bun:sqlite` は外部パッケージ不要。Bun に組み込まれている
- `date` は `TEXT` 型で `"YYYY-MM-DD"` 文字列として保存するのがシンプル
- `score` は 1〜5 の整数にしておくと集計しやすい（0/1 のフラグより粒度がある）
- カテゴリはあとから増やせるよう `TEXT` にしておく。固定 ENUM にしないほうが楽

---

## Phase 3: API ルート実装

### やること
- 記録の追加・取得・削除
- 今日の集計取得

### エンドポイント一覧

| メソッド | パス | 内容 |
|---------|------|------|
| `GET`  | `/` | メイン画面（HTML返却） |
| `POST` | `/entries` | 記録を追加 |
| `GET`  | `/entries?date=today` | 指定日の一覧取得（HTML断片） |
| `DELETE` | `/entries/:id` | 記録削除 |
| `GET`  | `/stats` | 集計データ取得（HTML断片） |

### index.ts の基本形

```ts
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import entries from "./routes/entries";
import stats from "./routes/stats";

const app = new Hono();

app.use("/public/*", serveStatic({ root: "./" }));

app.route("/entries", entries);
app.route("/stats", stats);

app.get("/", (c) => {
  return c.html(Bun.file("views/index.html").text());
});

export default {
  port: 3000,
  fetch: app.fetch,
};
```

### アドバイス
- `serveStatic` で `public/` を静的配信するとCSSや画像を置ける
- Hono はルートを `app.route()` で分割できるので、最初から分けておくと後で追加しやすい
- HTMX との組み合わせでは、POST後に**HTML断片を返す**のが基本パターン（JSONではなくHTML）

---

## Phase 4: UI 実装（HTMX）

### やること
- 記録入力フォーム
- 今日のエントリー一覧
- 達成度の表示

### HTMX の基本パターン

```html
<!-- フォーム送信後、#entry-list の中身を差し替える -->
<form hx-post="/entries" hx-target="#entry-list" hx-swap="beforeend">
  <input name="title" placeholder="今日やったこと" required />
  <select name="category">
    <option value="仕事">仕事</option>
    <option value="学習">学習</option>
    <option value="運動">運動</option>
  </select>
  <input type="range" name="score" min="1" max="5" value="3" />
  <button type="submit">追加</button>
</form>

<ul id="entry-list"
    hx-get="/entries?date=today"
    hx-trigger="load">
</ul>
```

### アドバイス
- HTMX は CDN から1行で読み込める。ビルド不要
  ```html
  <script src="https://unpkg.com/htmx.org@2.0.0"></script>
  ```
- `hx-swap="beforeend"` で追加、`outerHTML` で要素ごと差し替えなど、swap方法は用途で選ぶ
- サーバーは HTML断片を返す。たとえば `POST /entries` は追加された `<li>...</li>` を返すだけでよい
- 削除ボタンには `hx-delete="/entries/{{id}}" hx-target="closest li" hx-swap="outerHTML"` が便利

---

## Phase 5: 分析機能

### やること
- 今日の達成度の平均・件数
- カテゴリ別の集計
- 週次のふりかえりビュー（余裕があれば）

### 集計クエリ例

```sql
-- 今日のサマリー
SELECT
  COUNT(*) as total,
  AVG(score) as avg_score,
  category
FROM entries
WHERE date = '2026-03-11'
GROUP BY category;

-- 過去7日間の推移
SELECT date, COUNT(*) as count, AVG(score) as avg_score
FROM entries
WHERE date >= date('now', '-7 days')
GROUP BY date
ORDER BY date;
```

### アドバイス
- 分析はシンプルに**テキストで表示するだけ**から始める。グラフは後回しでよい
- 「今日できたこと N件 / 平均達成度 X.X」だけでも十分に価値がある
- どうしてもグラフが欲しくなったら、CSS だけで作れるバーが一番軽い
  ```css
  /* スコアをバーで表現 */
  .bar { width: calc(var(--score) * 20%); background: #4ade80; height: 8px; }
  ```
- 週次ビューは別ページにせず、同じページの `<details>` タグで折りたたんでおくとシンプル

---

## 参考リンク

- [Hono 公式ドキュメント](https://hono.dev)
- [HTMX 公式ドキュメント](https://htmx.org/docs/)
- [Bun SQLite ドキュメント](https://bun.sh/docs/api/sqlite)

---

## 開発の進め方ヒント

- **Phase 1〜2 を先に固める**。DBスキーマが後で変わると手戻りが多い
- 動くものを早く作る。見た目は最後でよい
- 詰まったら `console.log` とブラウザのネットワークタブが最初の武器
- HTMX のデバッグは `htmx.logAll()` をコンソールで実行すると通信が全部見える
