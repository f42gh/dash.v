import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type SectionKey = "home" | "analysis" | "edit";

type TimeResponse = {
  date_key: string;
  hour_key: number;
  updated_at: string;
};

type EffortLog = {
  id: number;
  date_key: string;
  hour_key: number;
  effort: number;
  note: string | null;
  created_at: string;
  updated_at: string;
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
const EFFORT_GUIDE = [
  "1: 着手だけ。開始はしたが進捗はほぼ出ていない",
  "2: 軽く進めた。確認や小タスクを完了",
  "3: 1ブロック進捗。明確な1タスクを終えた",
  "4: 明確に前進。難所突破または複数タスク完了",
  "5: 節目を突破。マイルストーンを1つ前進",
];

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

function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [clock, setClock] = useState("");
  const [effort, setEffort] = useState(3);
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState<EffortLog[]>([]);
  const [stats, setStats] = useState<StatsResponse>({ day: { total: 0, avg_effort: null }, weekly: [], by_hour: [] });
  const [message, setMessage] = useState("");
  const [editRows, setEditRows] = useState<Record<number, Partial<EffortLog>>>({});
  const [activeSection, setActiveSection] = useState<SectionKey>("home");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const snapContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({ home: null, analysis: null, edit: null });

  async function refresh() {
    const [timeRes, logsRes, statsRes] = await Promise.all([
      fetch(`${API}/api/time`),
      fetch(`${API}/api/efforts?date=${dateKey}`),
      fetch(`${API}/api/stats?date=${dateKey}`),
    ]);
    const time = (await timeRes.json()) as TimeResponse;
    setClock(`${time.date_key} ${String(time.hour_key).padStart(2, "0")}:00`);
    setLogs((await logsRes.json()) as EffortLog[]);
    setStats((await statsRes.json()) as StatsResponse);
  }

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
        const inView = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (inView.length === 0) return;
        const sectionName = inView[0].target.getAttribute("data-section") as SectionKey | null;
        if (sectionName) setActiveSection(sectionName);
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
    const node = sectionRefs.current[section];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setMessage(res.ok ? `ID ${id} を更新しました` : `ID ${id} の更新に失敗しました`);
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

      <nav className="section-indicator" aria-label="section navigation">
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

      <div className="snap-container" ref={snapContainerRef}>
        <section
          className="snap-section"
          data-section="home"
          ref={(node) => {
            sectionRefs.current.home = node;
          }}
        >
          <div className="panel input-panel">
            <div className="field">
              <label>記録日</label>
              <input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} />
            </div>
            <div className="field grow">
              <label>Effort (1-5)</label>
              <input type="range" min="1" max="5" value={effort} onChange={(event) => setEffort(Number(event.target.value))} />
              <div className="effort-value">{effort}</div>
            </div>
            <div className="field grow">
              <label>メモ（任意）</label>
              <input
                ref={noteInputRef}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={onQuickSubmit}
                placeholder="あとで見返す一言（Enterで記録）"
              />
            </div>
            <button className="accent" onClick={addLog}>
              今の努力量を記録
            </button>
          </div>
          <div className="panel effort-guide">
            <h3>Effort運用基準（固定）</h3>
            <ul>
              {EFFORT_GUIDE.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="snap-section"
          data-section="analysis"
          ref={(node) => {
            sectionRefs.current.analysis = node;
          }}
        >
          <div className="panel kpi-grid">
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

          <div className="panel chart-grid">
            <Plot
              series={[
                {
                  type: "bar",
                  x: stats.weekly.map((row) => row.date_key),
                  y: stats.weekly.map((row) => row.count),
                  marker: { color: "#1fbf75" },
                },
              ]}
              layout={{ title: "過去7日ログ数", paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#c6d1de" } }}
            />
            <Plot
              series={[
                {
                  type: "scatter",
                  mode: "lines+markers",
                  x: stats.by_hour.map((row) => row.hour_key),
                  y: stats.by_hour.map((row) => row.avg_effort),
                  line: { color: "#67d6ff", width: 3 },
                },
              ]}
              layout={{
                title: "時間帯別 average effort",
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                font: { color: "#c6d1de" },
              }}
            />
          </div>
        </section>

        <section
          className="snap-section"
          data-section="edit"
          ref={(node) => {
            sectionRefs.current.edit = node;
          }}
        >
          <div className="panel">
            <h3>ログ一覧（edit done）</h3>
            <p className="msg">{message}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>Hour</th>
                    <th>Effort</th>
                    <th>Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>
                        <input
                          defaultValue={row.date_key}
                          onChange={(event) =>
                            setEditRows((prev) => ({ ...prev, [row.id]: { ...prev[row.id], date_key: event.target.value } }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          defaultValue={row.hour_key}
                          onChange={(event) =>
                            setEditRows((prev) => ({ ...prev, [row.id]: { ...prev[row.id], hour_key: Number(event.target.value) } }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          defaultValue={row.effort}
                          onChange={(event) =>
                            setEditRows((prev) => ({ ...prev, [row.id]: { ...prev[row.id], effort: Number(event.target.value) } }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          defaultValue={row.note ?? ""}
                          onChange={(event) =>
                            setEditRows((prev) => ({ ...prev, [row.id]: { ...prev[row.id], note: event.target.value } }))
                          }
                        />
                      </td>
                      <td className="actions">
                        <button onClick={() => saveRow(row.id)}>保存</button>
                        <button className="ghost" onClick={() => deleteRow(row.id)}>
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
