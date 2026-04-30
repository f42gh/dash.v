import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type SectionKey = "home" | "analysis" | "edit";

type TimeResponse = { date_key: string; hour_key: number; updated_at: string };
type LatestDateResponse = { latest_date: string };
type EffortLog = {
  id: number;
  date_key: string;
  hour_key: number;
  effort: number;
  note: string | null;
  edit_done: number;
  created_at: string;
  updated_at: string;
};
type ImpressiveTask = {
  id: number;
  source_log_id: number | null;
  title: string;
  effort: number;
  note: string | null;
  created_at: string;
};
type StatsResponse = {
  day: { total: number; avg_effort: number | null };
  weekly: Array<{ date_key: string; count: number; avg_effort: number }>;
  by_hour: Array<{ hour_key: number; count: number; avg_effort: number }>;
};
type PlotlyLike = {
  react: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    Plotly?: PlotlyLike;
  }
}

const API = "";
const SECTION_ORDER: SectionKey[] = ["home", "analysis", "edit"];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function Plot(props: { series: unknown[]; layout: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && window.Plotly) {
      window.Plotly.react(ref.current, props.series, props.layout, { displayModeBar: false, responsive: true });
    }
  }, [props.series, props.layout]);
  return <div className="plot" ref={ref} />;
}

function EffortPile(props: { value: number; onChange: (v: number) => void }) {
  const steps = 10;
  const active = Math.round(props.value / 10);
  return (
    <div className="pile-wrap">
      <div className="pile-number">{props.value}</div>
      <div className="pile" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={props.value}>
        {Array.from({ length: steps }).map((_, i) => {
          const level = steps - i;
          const fill = level <= active;
          return (
            <button
              key={level}
              type="button"
              className={fill ? "pile-block on" : "pile-block"}
              onClick={() => props.onChange(level * 10)}
              title={`${level * 10}`}
            />
          );
        })}
      </div>
      <input type="range" min="0" max="100" step="1" value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [clock, setClock] = useState("");
  const [effort, setEffort] = useState(60);
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState<EffortLog[]>([]);
  const [impressive, setImpressive] = useState<ImpressiveTask[]>([]);
  const [stats, setStats] = useState<StatsResponse>({ day: { total: 0, avg_effort: null }, weekly: [], by_hour: [] });
  const [message, setMessage] = useState("");
  const [editRows, setEditRows] = useState<Record<number, Partial<EffortLog>>>({});
  const [activeSection, setActiveSection] = useState<SectionKey>("home");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const snapContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({ home: null, analysis: null, edit: null });
  const initializedDateRef = useRef(false);

  const nearestImpressive = useMemo(() => {
    if (impressive.length === 0) return null;
    const sorted = [...impressive].sort((a, b) => Math.abs(a.effort - effort) - Math.abs(b.effort - effort));
    return sorted[0];
  }, [impressive, effort]);

  async function refresh() {
    const [timeRes, logsRes, statsRes, impressiveRes] = await Promise.all([
      fetch(`${API}/api/time`),
      fetch(`${API}/api/efforts?date=${dateKey}`),
      fetch(`${API}/api/stats?date=${dateKey}`),
      fetch(`${API}/api/impressive-tasks`),
    ]);
    const time = (await timeRes.json()) as TimeResponse;
    setClock(`${time.date_key} ${String(time.hour_key).padStart(2, "0")}:00`);
    setLogs((await logsRes.json()) as EffortLog[]);
    setStats((await statsRes.json()) as StatsResponse);
    setImpressive((await impressiveRes.json()) as ImpressiveTask[]);
  }

  async function bootstrapDate() {
    if (initializedDateRef.current) return;
    initializedDateRef.current = true;
    const res = await fetch(`${API}/api/latest-date`);
    if (!res.ok) return;
    const data = (await res.json()) as LatestDateResponse;
    if (data.latest_date && data.latest_date !== dateKey) {
      setDateKey(data.latest_date);
    }
  }

  useEffect(() => {
    bootstrapDate();
  }, []);

  useEffect(() => {
    refresh();
  }, [dateKey]);

  useEffect(() => {
    const timer = setInterval(refresh, 600000);
    return () => clearInterval(timer);
  }, [dateKey]);

  useEffect(() => {
    const root = snapContainerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (inView.length === 0) return;
        const name = inView[0].target.getAttribute("data-section") as SectionKey | null;
        if (name) setActiveSection(name);
      },
      { root, threshold: [0.55, 0.75] },
    );
    SECTION_ORDER.forEach((key) => {
      const node = sectionRefs.current[key];
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  function jumpToSection(section: SectionKey) {
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function addLog() {
    const res = await fetch(`${API}/api/efforts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effort, note: note.trim() || null }),
    });
    setMessage(res.ok ? "記録しました。必要なら下で編集してください。" : "記録に失敗しました。時間をおいて再試行してください。");
    if (res.ok) {
      setNote("");
      await refresh();
      noteInputRef.current?.focus();
    }
  }

  async function saveRow(id: number) {
    const patch = editRows[id];
    if (!patch) return;
    const row = logs.find((item) => item.id === id);
    if (!row) return;
    if (row.edit_done === 1) {
      setMessage(`ID ${id} は編集ロック済みです`);
      return;
    }
    const body = {
      date_key: patch.date_key ?? row.date_key,
      hour_key: Number(patch.hour_key ?? row.hour_key),
      effort: Number(patch.effort ?? row.effort),
      note: patch.note ?? row.note,
    };
    const res = await fetch(`${API}/api/efforts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 403) {
      setMessage(`ID ${id} は編集可能期間を過ぎたためロックされています`);
      await refresh();
      return;
    }
    setMessage(res.ok ? `ID ${id} を更新しました（このログは編集完了になりました）` : `ID ${id} の更新に失敗しました`);
    if (res.ok) {
      setEditRows((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refresh();
    }
  }

  async function deleteRow(id: number) {
    const res = await fetch(`${API}/api/efforts/${id}`, { method: "DELETE" });
    setMessage(res.ok ? `ID ${id} を削除しました` : `ID ${id} の削除に失敗しました`);
    if (res.ok) await refresh();
  }

  async function onQuickSubmit(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await addLog();
  }

  const avg = stats.day.avg_effort == null ? "-" : stats.day.avg_effort;

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>dash.v</h1>
          <p className="sub">Track the trail, not just the result.</p>
        </div>
        <div className="clock">{clock} / 10分ごと自動更新</div>
      </header>

      <div className="snap-container" ref={snapContainerRef}>
        <section
          className="snap-section"
          data-section="home"
          ref={(node) => {
            sectionRefs.current.home = node;
          }}
        >
          <div className="islands">
            <div className="panel island island-compact input-stack">
              <div className="field">
                <label>記録日</label>
                <input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} />
              </div>
              <div className="field">
                <label>メモ（任意）</label>
                <input
                  ref={noteInputRef}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={onQuickSubmit}
                  placeholder="あとで見返す一言（Enterで記録）"
                />
              </div>
              <button className="accent dopamine-submit" onClick={addLog}>
                Stack This Effort
              </button>
            </div>

            <div className="panel island island-compact effort-field">
              <label>Effort (0-100)</label>
              <EffortPile value={effort} onChange={setEffort} />
            </div>

            <div className="panel island impressive-panel">
              <h3>Impressive Baseline</h3>
              <p className="muted">過去の impressive task を基準に、今日の effort をチューニングする</p>
              {nearestImpressive ? (
                <div className="impressive-focus">
                  <strong>{nearestImpressive.title}</strong>
                  <span>{nearestImpressive.effort} / 100</span>
                  <p>{nearestImpressive.note ?? "記録なし"}</p>
                </div>
              ) : (
                <p className="muted">impressive task がまだありません。</p>
              )}
              <div className="impressive-list">
                {impressive.map((task) => (
                  <article key={task.id} className="impressive-card">
                    <header>
                      <strong>{task.title}</strong>
                      <span>{task.effort}</span>
                    </header>
                    <p>{task.note ?? "記録なし"}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="snap-section"
          data-section="analysis"
          ref={(node) => {
            sectionRefs.current.analysis = node;
          }}
        >
          <div className="islands">
            <div className="panel island kpi-grid">
              <article className="kpi">
                <h2>{stats.day.total}</h2>
                <p>当日ログ数</p>
              </article>
              <article className="kpi">
                <h2>{avg}</h2>
                <p>平均 Effort</p>
              </article>
              <article className="guide">
                <p>時系列で負荷を追い、次のマイルストーン配分を決める</p>
              </article>
            </div>
            <div className="panel island wide chart-grid">
              <Plot
                series={[{ type: "bar", x: stats.weekly.map((r) => r.date_key), y: stats.weekly.map((r) => r.count), marker: { color: "#1fbf75" } }]}
                layout={{ title: "過去7日ログ数", paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#c6d1de" } }}
              />
              <Plot
                series={[
                  {
                    type: "scatter",
                    mode: "lines+markers",
                    x: stats.by_hour.map((r) => r.hour_key),
                    y: stats.by_hour.map((r) => r.avg_effort),
                    line: { color: "#67d6ff", width: 3 },
                  },
                ]}
                layout={{ title: "時間帯別 average effort", paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#c6d1de" } }}
              />
            </div>
          </div>
        </section>

        <section
          className="snap-section"
          data-section="edit"
          ref={(node) => {
            sectionRefs.current.edit = node;
          }}
        >
          <div className="panel island wide">
            <h3>ログ一覧（edit done）</h3>
            <p className="msg">{message}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ID</th><th>Date</th><th>Hour</th><th>Effort</th><th>Note</th><th>Edit</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td><input disabled={row.edit_done === 1} defaultValue={row.date_key} onChange={(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], date_key: e.target.value } }))} /></td>
                      <td><input disabled={row.edit_done === 1} type="number" min="0" max="23" defaultValue={row.hour_key} onChange={(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], hour_key: Number(e.target.value) } }))} /></td>
                      <td><input disabled={row.edit_done === 1} type="number" min="0" max="100" defaultValue={row.effort} onChange={(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], effort: Number(e.target.value) } }))} /></td>
                      <td><input disabled={row.edit_done === 1} defaultValue={row.note ?? ""} onChange={(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], note: e.target.value } }))} /></td>
                      <td>{row.edit_done === 1 ? "done" : "before"}</td>
                      <td className="actions">
                        <button disabled={row.edit_done === 1} onClick={() => saveRow(row.id)}>保存</button>
                        <button className="ghost" onClick={() => deleteRow(row.id)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <nav className="section-indicator bottom" aria-label="section navigation">
        {SECTION_ORDER.map((section) => (
          <button
            key={section}
            className={activeSection === section ? "dot active" : "dot"}
            onClick={() => jumpToSection(section)}
            title={section}
            aria-label={section}
          />
        ))}
      </nav>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
