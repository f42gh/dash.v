# dash.v Roadmap

最終更新: 2026-04-30

## 1. 目的
- 個人の行動ログを毎日残し、振り返りをすぐ見られるダッシュボードを育てる
- まずは「入力が速い」「見返しやすい」「壊れにくい」を優先する
- `dash` のコア価値として、走ってきた軌跡（進捗の時系列）を可視化する

## 1.1 プロダクト軸（新）
- メイン機能: プロジェクトの入れ子管理
- 構造: `Project -> Milestone -> Issue/Task`
- 特に `Milestone` を時間軸の中心として扱う
- 目標: 「今どこを走っているか」と「どこを走ってきたか」を一目で把握できること

## 2. 現在の構成（As-Is）
- Runtime: Python (`uv`)
- App: Plotly Dash（`app.py`）
- Data: SQLite（`data/dash.db`）
- 主機能:
- 日付選択
- エントリー追加（title/category/score/note）
- エントリー削除
- 日次KPI（件数・平均スコア）
- 7日チャート
- カテゴリ内訳

## 3. 直近方針（MVP First）
- 方針: 最小完成版を維持しつつ、機能を小さく追加して検証する
- 開発サイクル:
1. 機能を 1 つ選ぶ
2. 小さく実装する
3. 実運用で使って改善点を出す
4. 次の 1 つへ進む

## 4. フェーズ計画（To-Be）

### Phase 0: Baseline 固定（完了）
- [x] Bun/React 構成を廃止
- [x] Python + Dash + SQLite へ統一
- [x] `uv` で依存管理と実行を統一

### Phase 1: 入力体験の改善（次）
- [ ] Enter で追加しやすいフォーム動線
- [ ] 追加直後のフォーカス制御（title に戻す）
- [ ] バリデーション文言の整理
- [ ] カテゴリのカスタム追加（固定値+自由入力の検討）

### Phase 1.5: 入れ子モデル導入（最優先）
- [ ] DBスキーマ追加: `projects`, `milestones`, `issues`
- [ ] 関係定義:
- `projects.id -> milestones.project_id`
- `milestones.id -> issues.milestone_id`
- [ ] Milestone に時間情報を持たせる:
- `start_date`, `target_date`, `status`
- [ ] MVP画面:
- Project一覧
- 選択ProjectのMilestoneタイムライン
- 選択MilestoneのIssue/Task一覧
- [ ] 進捗メトリクス:
- Milestoneごとの完了率
- 期限との差分（日数）
- 週次の消化トレンド

### Phase 2: 分析の実用化
- [ ] 期間フィルタ（7日/30日/任意）
- [ ] 曜日別の傾向表示
- [ ] スコア分布（ヒストグラム）
- [ ] 連続記録日数（streak）

### Phase 3: 運用性・保守性
- [ ] データのバックアップ導線（SQLiteコピー）
- [ ] 最低限のテスト追加（DB関数、集計関数）
- [ ] 例外時のメッセージ改善
- [ ] README を機能追加に合わせて更新

## 5. これから追加する機能の置き場（Idea Inbox）
- 使い方:
1. 思いついた機能をここへ 1 行で追記
2. 優先度を `H/M/L` で仮置き
3. 実装時に該当フェーズへ移動

| ID | Priority | Idea | Notes |
|---|---|---|---|
| I-001 | H | Project > Milestone > Issue の3層ナビゲーション | まずは閲覧と追加を最小実装 |
| I-002 | H | Milestone タイムライン表示 | ガント風まではやらず時系列カードで開始 |
| I-003 | H | Milestone 完了率（Issue消化率） | `done / total` で算出 |
| I-004 | M | 軌跡ビュー（過去に閉じたMilestoneの履歴） | 「一緒に走った軌跡」を見返す画面 |
| I-005 | M | Milestone 期限アラート | 期限超過/直近を強調 |

## 6. 実装ルール（軽量）
- 1 PR = 1 テーマ（大きくしすぎない）
- 先に動くものを作ってから見た目を磨く
- 迷ったら「入力の速さ」と「継続利用しやすさ」を優先する
- UI/UX は必要十分に洗練され、リッチであることを必須要件として扱う
