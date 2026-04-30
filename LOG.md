# dash.v 作業ログ

## 2026-03-10 — 初期セットアップ
- `bun init` でプロジェクト作成（bun-react-tailwind テンプレート）
- Hono + HTMX ベースのロードマップ（ROADMAP.md）を想定

## 2026-03-11 — ロードマップ作成
- ROADMAP.md を作成（Phase 1〜5 の開発計画）

## 2026-03-12 — 構成変更・API実装
- Hono + HTMX → Bun.serve + React に方針転換
- SQLite（bun:sqlite）でエントリーDB（`src/db.ts`）を作成
- API実装: `GET/POST /api/entries`, `DELETE /api/entries/:id`, `GET /api/stats`
- React フロントエンド（`src/App.tsx`）で入力フォーム・一覧・統計UIを構築
- ルートを `src/routes/` から `src/index.ts` にインライン化

## 2026-03-29 — リポジトリ整理・リモート設定
- GitHub リモートを `f42gh/dash.v` に変更し force push
- 不要ファイルを削除:
  - `build.ts` — Bun.serve の HTML imports で不要に
  - `bun-env.d.ts` — SVG/CSS module 宣言、未使用
  - `public/style.css` — 空ファイル
  - `views/index.html` — 空ファイル（Hono時代の名残）
  - `src/APITester.tsx`, `src/logo.svg`, `src/react.svg` — テンプレ残骸
  - `src/routes/entries.ts`, `src/routes/stats.ts` — index.ts にインライン化済み
- `hono` を dependencies から削除

### ホーム画面リニューアル
- レイアウトを3セクション構成に変更:
  1. **ヘッダー**: 今日の日付 + タスク進捗 + タスク追加フォーム
  2. **Eisenhower Matrix**: 2x2グリッド（Do First / Schedule / Delegate / Eliminate）
  3. **Analytics**: エントリー統計・週次チャート・カテゴリ別（スクロール表示）
- `tasks` テーブルを追加（urgent, important, done フラグ）
- Task API: `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`
- App.tsx をコンポーネント分割（EisenhowerMatrix, TaskInput, Analytics）

### Linear 連携
- Linear GraphQL API 接続（Personal API key、`.env` で管理）
- `src/linear.ts` — APIクライアント + Eisenhower マッピング
  - Priority 1(Urgent)→Q1, 2(High)→Q2, 3(Medium)→Q3, 4(Low)/0→Q4
- `/api/linear/issues` エンドポイント追加
- Eisenhower Matrix にローカルタスク + Linear issue を統合表示
  - ローカル: チェックボックス + 削除可
  - Linear: ◆マーク + identifier + state 表示（読み取り専用）
- Analytics に Linear サマリー追加（件数、Priority別・State別・Team別内訳、全issue一覧）

## 2026-04-30 — Python化とフロント方針の再決定
- Bun/React テンプレ由来の構成を整理し、Python中心に再編
- 実装方針を `uv` ベースへ統一（依存同期・実行導線）
- `effort_logs` を軸に、`date_key` と `hour_key` を分離保存するログモデルへ変更
- 入力ハードル最小化のため、入力項目を実質 `effort` 中心へ絞り、後編集前提の運用へ

### Reactフロント切り出し
- UI/UXの重要度を再評価し、フロントを `frontend/` に分離
- Python側は FastAPI API として責務を分離（`/api/time`, `/api/efforts`, `/api/stats`）
- リッチUI（KPI、チャート、インライン編集）を React で実装

### 重要な意思決定（Framework採用境界）
- 当面は Next.js / Bun の導入を見送る
- 理由:
  - 現段階は機能探索とUX検証フェーズで、配信最適化より実験速度を優先
  - 画面・状態管理の複雑度はまだ手動運用可能な範囲
- 将来の導入トリガー:
  - `project -> milestone -> issue/task` の3層UIが拡大し、ルーティング・キャッシュ・認証・SSR最適化が必要になった時

## 2026-05-01 — Phase 1 完了（TypeScript + Scroll Snap UI）
- フロントを TypeScript に移行し、`frontend/src/main.tsx` を中心に再構成
- 3セクションUIを確定:
  - `submit effort (home)`
  - `analysis`
  - `edit done`
- セクション遷移に `CSS Scroll Snap` を導入（磁石的に吸着するスクロール体験）
- 現在位置インジケーター（ドット）を実装し、クリックジャンプを追加
- effort運用基準（1〜5）を画面上で固定表示し、入力判断を統一
- `ROADMAP.md` の Phase 1 を完了状態へ更新

## 2026-05-01 — UX強化と編集ロック仕様の導入
- UIを高密度レイアウトへ調整し、islandを小分けして横並び最適化
- セクションインジケーターを下部固定に変更
- effort入力を `0-100` に拡張し、縦方向に積み上がる `pile-up` UIへ変更
- submit体験を強化（大型ボタン・押下時フィードバック強化）
- `impressive_tasks` を導入し、過去の高インパクトタスクを基準表示

### 編集ロック（Edit once）
- `effort_logs` に `edit_done`（0/1）を追加
- 1回編集したログは自動で `edit_done=1` に遷移し再編集不可
- 作成から7日経過したログは自動で `edit_done=1` に更新
- フロント側でも `edit_done=1` 行は入力・保存を無効化

### データ運用
- `DASH_DB_PATH` でDB切替可能にし、実データとテストデータを分離
- `scripts/generate_test_data.py` を追加して、数ヶ月分のテストデータ生成を自動化
- fixtureとして `fixtures/test_dash.db` を管理対象に追加
