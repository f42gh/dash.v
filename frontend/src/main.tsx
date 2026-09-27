import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Status = "active" | "paid_off" | "retired";
type Item = {
  id: number;
  name: string;
  price: number;
  purchased_on: string;
  lifespan_months: number;
  retired_on: string | null;
  note: string | null;
  tags: string[];
  recurring: number;
  monthly_cost: number;
  ends_on: string | null;
  months_left: number | null;
  book_value: number;
  status: Status;
};
type Summary = {
  month: string;
  monthly_total: number;
  budget_total: number;
  book_value: number;
  active_count: number;
  paid_off_count: number;
  subscription_total: number;
  subscription_count: number;
  timeline: Array<{ month: string; cost: number }>;
  tags: Array<{ tag: string; cost: number; budget: number | null }>;
  ending_soon: Item[];
};
type Unit = "day" | "month" | "year";
type PlotlyLike = {
  react: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    Plotly?: PlotlyLike;
  }
}

const UNIT_LABEL: Record<Unit, string> = { day: "日", month: "月", year: "年" };
const PER_MONTH: Record<Unit, number> = { day: 12 / 365, month: 1, year: 12 };

const cycleLabel = (m: number) => (m === 1 ? "毎月" : m === 12 ? "毎年" : `${m}ヶ月ごと`);
const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function Plot(props: { data: unknown[]; layout: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && window.Plotly) {
      window.Plotly.react(ref.current, props.data, props.layout, { displayModeBar: false, responsive: true });
    }
  }, [props.data, props.layout]);
  return <div className="plot" ref={ref} />;
}

type Draft = {
  name: string;
  price: string;
  purchased_on: string;
  lifespan: string;
  lifespanUnit: "month" | "year";
  retired_on: string;
  tags: string;
  note: string;
  recurring: boolean;
};

const today = () => new Date().toLocaleDateString("sv-SE");
const emptyDraft = (): Draft => ({
  name: "", price: "", purchased_on: today(), lifespan: "", lifespanUnit: "year", retired_on: "", tags: "", note: "", recurring: false,
});
const toDraft = (i: Item): Draft => ({
  name: i.name,
  price: String(i.price),
  purchased_on: i.purchased_on,
  lifespan: i.lifespan_months % 12 === 0 ? String(i.lifespan_months / 12) : String(i.lifespan_months),
  lifespanUnit: i.lifespan_months % 12 === 0 ? "year" : "month",
  retired_on: i.retired_on ?? "",
  tags: i.tags.join(", "),
  note: i.note ?? "",
  recurring: !!i.recurring,
});

function ItemForm(props: { editing: Item | null; tags: string[]; onSaved: () => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(props.editing ? toDraft(props.editing) : emptyDraft());
  const [error, setError] = useState("");
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });

  useEffect(() => setD(props.editing ? toDraft(props.editing) : emptyDraft()), [props.editing]);

  const months = Math.round(Number(d.lifespan) * (d.lifespanUnit === "year" ? 12 : 1));
  const preview = Number(d.price) > 0 && months > 0 ? Number(d.price) / months : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = JSON.stringify({
      name: d.name,
      price: Number(d.price),
      purchased_on: d.purchased_on,
      lifespan_months: months,
      retired_on: d.retired_on || null,
      note: d.note || null,
      tags: d.tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean),
      recurring: d.recurring,
    });
    try {
      if (props.editing) await api(`/api/items/${props.editing.id}`, { method: "PUT", body });
      else await api("/api/items", { method: "POST", body });
      setError("");
      setD(emptyDraft());
      props.onSaved();
    } catch (err) {
      setError(`保存できませんでした: ${(err as Error).message}`);
    }
  }

  return (
    <details className="add" open={props.editing ? true : undefined}>
    <summary>{props.editing ? `編集中: ${props.editing.name}` : "物品を追加"}</summary>
    <form className="item-form" onSubmit={submit}>
      <div className="form-grid">
        <label>名前<input required value={d.name} onChange={set("name")} placeholder="MacBook Pro" /></label>
        <label>{d.recurring ? "料金（1回分・円）" : "価格（円）"}<input required type="number" min="0" value={d.price} onChange={set("price")} /></label>
        <label>{d.recurring ? "開始日" : "購入日"}<input required type="date" value={d.purchased_on} onChange={set("purchased_on")} /></label>
        <label>
          {d.recurring ? "課金周期" : "耐用期間"}
          <span className="inline">
            <input required type="number" min="1" step="1" value={d.lifespan} onChange={set("lifespan")} />
            <select value={d.lifespanUnit} onChange={set("lifespanUnit")}>
              <option value="year">年</option>
              <option value="month">ヶ月</option>
            </select>
          </span>
        </label>
        <label>
          タグ（カンマ区切り）
          <input list="tag-options" value={d.tags} onChange={set("tags")} placeholder="PC, 仕事" />
          <datalist id="tag-options">{props.tags.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label>{d.recurring ? "解約日（任意）" : "引退日（任意）"}<input type="date" value={d.retired_on} onChange={set("retired_on")} /></label>
        <label className="check">
          <input
            type="checkbox"
            checked={d.recurring}
            onChange={(e) => setD({ ...d, recurring: e.target.checked, ...(e.target.checked && !d.lifespan ? { lifespan: "1", lifespanUnit: "month" } : {}) })}
          />
          サブスク（解約するまで毎周期課金）
        </label>
        <label className="wide">メモ<input value={d.note} onChange={set("note")} /></label>
      </div>
      <div className="form-foot">
        <span className="muted">{preview !== null ? `→ 月 ${yen(preview)} / 日 ${yen(preview * 12 / 365)}` : ""}</span>
        {error && <span className="error">{error}</span>}
        {props.editing && <button type="button" onClick={props.onCancel}>キャンセル</button>}
        <button className="accent" type="submit">{props.editing ? "変更を保存" : "台帳に追加"}</button>
      </div>
    </form>
    </details>
  );
}

function BudgetRow(props: { row: Summary["tags"][number]; unit: Unit; active: boolean; onPick: () => void; onSaved: () => void }) {
  const { row, unit } = props;
  const [value, setValue] = useState(row.budget === null ? "" : String(row.budget));
  useEffect(() => setValue(row.budget === null ? "" : String(row.budget)), [row.budget]);
  const ratio = row.budget ? row.cost / row.budget : null;
  const state = ratio === null ? "none" : ratio > 1 ? "over" : ratio > 0.8 ? "near" : "ok";

  async function save() {
    if (value === "") await api(`/api/budgets/${encodeURIComponent(row.tag)}`, { method: "DELETE" });
    else await api(`/api/budgets/${encodeURIComponent(row.tag)}`, { method: "PUT", body: JSON.stringify({ monthly_limit: Number(value) }) });
    props.onSaved();
  }

  return (
    <div className={`budget-row ${props.active ? "picked" : ""}`}>
      <button type="button" className="tag-name" onClick={props.onPick} title="このタグで絞り込む">{row.tag}</button>
      <div className="meter" aria-label={`${row.tag} 予算消化率`}>
        <div className={`fill ${state}`} style={{ width: `${Math.min((ratio ?? 0) * 100, 100)}%` }} />
      </div>
      <span className="num">{yen(row.cost * PER_MONTH[unit])}</span>
      <span className={`badge ${state}`}>
        {state === "over" ? "▲ 超過" : state === "near" ? "● 80%超" : state === "ok" ? `${Math.round((ratio ?? 0) * 100)}%` : "予算なし"}
      </span>
      <input
        className="budget-input"
        type="number"
        min="0"
        placeholder="月予算"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== (row.budget === null ? "" : String(row.budget)) && save()}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [unit, setUnit] = useState<Unit>("month");
  const [editing, setEditing] = useState<Item | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const [s, i] = await Promise.all([api<Summary>("/api/summary"), api<Item[]>("/api/items")]);
      setSummary(s);
      setItems(i);
      setError("");
    } catch (err) {
      setError(`読み込みに失敗しました: ${(err as Error).message}`);
    }
  }
  useEffect(() => void reload(), []);

  async function remove(item: Item) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    await api(`/api/items/${item.id}`, { method: "DELETE" });
    if (editing?.id === item.id) setEditing(null);
    reload();
  }

  const f = PER_MONTH[unit];
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const visible = items.filter(
    (i) => (showRetired || i.status !== "retired") && (!tagFilter || (tagFilter === "未分類" ? i.tags.length === 0 : i.tags.includes(tagFilter))),
  );

  const chart = useMemo(() => {
    if (!summary) return null;
    const css = getComputedStyle(document.documentElement);
    const token = (n: string) => css.getPropertyValue(n).trim();
    const [ink, muted, rule, accent] = ["--ink", "--muted", "--rule", "--accent"].map(token);
    const x = summary.timeline.map((t) => t.month);
    const data: unknown[] = [
      {
        type: "bar",
        x,
        y: summary.timeline.map((t) => t.cost * f),
        marker: { color: accent, opacity: x.map((m) => (m > summary.month ? 0.3 : 1)) },
        hovertemplate: `%{x}<br>¥%{y:,.0f} / ${UNIT_LABEL[unit]}<extra></extra>`,
      },
    ];
    const shapes: unknown[] = [
      { type: "line", xref: "x", yref: "paper", x0: summary.month, x1: summary.month, y0: 0, y1: 1, line: { color: muted, width: 1, dash: "dot" } },
    ];
    const annotations: unknown[] = [
      { x: summary.month, y: 1, xref: "x", yref: "paper", text: "今月", showarrow: false, yanchor: "bottom", font: { color: muted, size: 11 } },
    ];
    if (summary.budget_total > 0) {
      const y = summary.budget_total * f;
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: y, y1: y, line: { color: ink, width: 1, dash: "dash" } });
      annotations.push({ x: 1, xref: "paper", y, text: "予算合計", showarrow: false, xanchor: "right", yanchor: "bottom", font: { color: ink, size: 11 } });
    }
    const layout = {
      height: 280,
      margin: { l: 64, r: 32, t: 20, b: 32 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: muted, family: token("--font") },
      xaxis: { type: "category", gridcolor: "rgba(0,0,0,0)", tickangle: 0, nticks: Math.max(3, Math.min(9, Math.floor(window.innerWidth / 130))) },
      yaxis: { gridcolor: rule, zerolinecolor: rule, tickprefix: "¥", tickformat: ",.0f" },
      bargap: 0.25,
      shapes,
      annotations,
    };
    return { data, layout };
  }, [summary, f, unit]);

  const hasHistory = summary?.timeline.some((t) => t.cost > 0);

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">dash.v <span className="muted">持ち物台帳</span></span>
      </header>

      {error && <p className="alert" role="alert">{error} <button onClick={reload}>再試行</button></p>}
      {!summary && !error && <p className="muted">読み込み中…</p>}

      {summary && (
        <>
          <section className="total" aria-label="今の負担">
            <p className="total-label">{summary.month} 時点で、持ち物の負担は</p>
            <p className="total-figure">
              {yen(summary.monthly_total * f)}
              <span className="per">
                {" / "}
                <select className="unit-select" aria-label="表示単位" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </span>
            </p>
            <dl className="facts">
              {summary.budget_total > 0 && (
                <div className={summary.monthly_total > summary.budget_total ? "over" : ""}>
                  <dt>予算合計</dt>
                  <dd>{yen(summary.budget_total * f)}{summary.monthly_total > summary.budget_total && " ▲超過"}</dd>
                </div>
              )}
              <div><dt>サブスク</dt><dd>{yen(summary.subscription_total * f)} <span className="muted">（{summary.subscription_count}件）</span></dd></div>
              <div><dt>残り簿価</dt><dd>{yen(summary.book_value)}</dd></div>
              <div><dt>償却中</dt><dd>{summary.active_count}点</dd></div>
              <div><dt>償却済・使用中</dt><dd>{summary.paid_off_count}点</dd></div>
            </dl>
          </section>

          <div className="split">
            <section>
              <h2>負担の推移 <span className="muted">過去12ヶ月・先12ヶ月</span></h2>
              {hasHistory && chart ? <Plot data={chart.data} layout={chart.layout} /> : <p className="muted">物品を登録すると、ここに月ごとの負担が並びます。</p>}
            </section>
            <section>
              <h2>タグ別予算 <span className="muted">月額・Enterで保存</span></h2>
              {summary.tags.length === 0 && <p className="muted">タグを付けた物品を登録すると、ここで予算を設定できます。</p>}
              {summary.tags.map((row) => (
                <BudgetRow
                  key={row.tag}
                  row={row}
                  unit={unit}
                  active={tagFilter === row.tag}
                  onPick={() => setTagFilter(tagFilter === row.tag ? null : row.tag)}
                  onSaved={reload}
                />
              ))}
              {summary.tags.length > 0 && <p className="muted small">複数タグの物品は各タグに全額計上しています。</p>}
            </section>
          </div>

          {summary.ending_soon.length > 0 && (
            <section className="soon">
              <h2>3ヶ月以内に償却終了</h2>
              <ul>
                {summary.ending_soon.map((i) => (
                  <li key={i.id}>
                    <strong>{i.name}</strong> <span className="muted">{i.ends_on}まで（残り{i.months_left}ヶ月）・買い替え積立の目安 {yen(i.monthly_cost)}/月</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="ledger">
        <div className="list-head">
          <h2>
            台帳 <span className="muted">{visible.length}点</span>
            {tagFilter && <button className="chip on" aria-label={`${tagFilter}の絞り込みを解除`} onClick={() => setTagFilter(null)}>{tagFilter} ×</button>}
          </h2>
          <label className="muted small"><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> 引退済みも表示</label>
        </div>

        <ItemForm editing={editing} tags={allTags} onSaved={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名前</th><th>タグ</th><th className="r">価格</th><th>購入</th><th className="r">耐用</th>
                <th className="r">/{UNIT_LABEL[unit]}</th><th className="wear-col">使い込み・残り簿価</th><th><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const used = i.price > 0 ? 1 - i.book_value / i.price : 1;
                return (
                  <tr key={i.id} className={i.status}>
                    <td>{i.name}{i.note && <div className="muted small">{i.note}</div>}</td>
                    <td>{i.tags.map((t) => <button key={t} className="chip" onClick={() => setTagFilter(t)}>{t}</button>)}</td>
                    <td className="r">{yen(i.price)}</td>
                    <td className="num">{i.purchased_on.slice(0, 7)}</td>
                    <td className="r">{i.recurring ? cycleLabel(i.lifespan_months) : i.lifespan_months % 12 === 0 ? `${i.lifespan_months / 12}年` : `${i.lifespan_months}ヶ月`}</td>
                    <td className="r">{i.status === "active" ? yen(i.monthly_cost * f) : "—"}</td>
                    <td className="wear-col">
                      {i.status === "retired" ? (
                        <span className="muted small">{i.recurring ? "解約" : "引退"} {i.retired_on?.slice(0, 7)}</span>
                      ) : i.recurring ? (
                        <span className="small sub">サブスク・継続中{i.retired_on && <span className="muted"> 〜{i.retired_on.slice(0, 7)}に解約</span>}</span>
                      ) : (
                        <>
                          <div className="wear" role="img" aria-label={`${Math.round(used * 100)}%使用`}>
                            <div style={{ width: `${used * 100}%` }} />
                          </div>
                          <span className="small">
                            {i.status === "paid_off" ? <span className="paid">償却済・使用中</span> : <>{yen(i.book_value)} <span className="muted">〜{i.ends_on}</span></>}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="actions">
                      <button onClick={() => { setEditing(i); requestAnimationFrame(() => document.querySelector(".add")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>編集</button>
                      <button className="danger" onClick={() => remove(i)}>削除</button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={8} className="muted">{tagFilter ? "このタグの物品はありません。" : "まだ何もありません。「物品を追加」から最初の1点を登録してください。"}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
