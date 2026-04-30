import React, { useEffect, useRef, useState } from "https://esm.sh/react@19.1.0";
import { createRoot } from "https://esm.sh/react-dom@19.1.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API = "";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function Plot({ series, layout }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.Plotly) {
      window.Plotly.react(ref.current, series, layout, { displayModeBar: false, responsive: true });
    }
  }, [series, layout]);
  return html`<div className="plot" ref=${ref}></div>`;
}

function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [clock, setClock] = useState("");
  const [effort, setEffort] = useState(3);
  const [note, setNote] = useState("");
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ day: { total: 0, avg_effort: null }, weekly: [], by_hour: [] });
  const [message, setMessage] = useState("");
  const [editRows, setEditRows] = useState({});

  async function refresh() {
    const [timeRes, logsRes, statsRes] = await Promise.all([
      fetch(`${API}/api/time`),
      fetch(`${API}/api/efforts?date=${dateKey}`),
      fetch(`${API}/api/stats?date=${dateKey}`),
    ]);
    const time = await timeRes.json();
    setClock(`${time.date_key} ${String(time.hour_key).padStart(2, "0")}:00`);
    setLogs(await logsRes.json());
    setStats(await statsRes.json());
  }

  useEffect(() => { refresh(); }, [dateKey]);
  useEffect(() => {
    const t = setInterval(refresh, 600000);
    return () => clearInterval(t);
  }, [dateKey]);

  async function addLog() {
    const res = await fetch(`${API}/api/efforts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effort, note: note.trim() || null }),
    });
    setMessage(res.ok ? "記録しました。必要なら下で編集してください。" : "記録に失敗しました");
    if (res.ok) {
      setNote("");
      await refresh();
    }
  }

  async function saveRow(id) {
    const patch = editRows[id];
    if (!patch) return;
    const row = logs.find((r) => r.id === id);
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

  async function deleteRow(id) {
    const res = await fetch(`${API}/api/efforts/${id}`, { method: "DELETE" });
    setMessage(res.ok ? `ID ${id} を削除しました` : `ID ${id} の削除に失敗しました`);
    if (res.ok) await refresh();
  }

  const avg = stats.day.avg_effort == null ? "-" : stats.day.avg_effort;

  return html`
    <main className="page">
      <header className="hero">
        <div>
          <h1>dash.v</h1>
          <p className="sub">Track the trail, not just the result.</p>
        </div>
        <div className="clock">${clock} / 10分ごと自動更新</div>
      </header>

      <section className="panel input-panel">
        <div className="field">
          <label>記録日</label>
          <input type="date" value=${dateKey} onChange=${(e) => setDateKey(e.target.value)} />
        </div>
        <div className="field grow">
          <label>Effort (1-5)</label>
          <input type="range" min="1" max="5" value=${effort} onChange=${(e) => setEffort(Number(e.target.value))} />
          <div className="effort-value">${effort}</div>
        </div>
        <div className="field grow">
          <label>メモ（任意）</label>
          <input value=${note} onChange=${(e) => setNote(e.target.value)} placeholder="あとで見返す一言" />
        </div>
        <button className="accent" onClick=${addLog}>今の努力量を記録</button>
      </section>

      <section className="panel kpi-grid">
        <article className="kpi"><h2>${stats.day.total}</h2><p>当日ログ数</p></article>
        <article className="kpi"><h2>${avg}</h2><p>平均 Effort</p></article>
        <article className="guide"><p>Effort基準: 1 着手 / 3 1ブロック完了 / 5 節目突破</p></article>
      </section>

      <section className="panel chart-grid">
        <${Plot}
          series=${[{ type: "bar", x: stats.weekly.map((r) => r.date_key), y: stats.weekly.map((r) => r.count), marker: { color: "#1fbf75" } }]}
          layout=${{ title: "過去7日ログ数", paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#c6d1de" } }}
        />
        <${Plot}
          series=${[{ type: "scatter", mode: "lines+markers", x: stats.by_hour.map((r) => r.hour_key), y: stats.by_hour.map((r) => r.avg_effort), line: { color: "#67d6ff", width: 3 } }]}
          layout=${{ title: "時間帯別 average effort", paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#c6d1de" } }}
        />
      </section>

      <section className="panel">
        <h3>ログ一覧（編集デフォルト）</h3>
        <p className="msg">${message}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Date</th><th>Hour</th><th>Effort</th><th>Note</th><th>Action</th></tr></thead>
            <tbody>
              ${logs.map((row) => html`
                <tr key=${row.id}>
                  <td>${row.id}</td>
                  <td><input defaultValue=${row.date_key} onChange=${(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], date_key: e.target.value } }))} /></td>
                  <td><input type="number" min="0" max="23" defaultValue=${row.hour_key} onChange=${(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], hour_key: e.target.value } }))} /></td>
                  <td><input type="number" min="1" max="5" defaultValue=${row.effort} onChange=${(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], effort: e.target.value } }))} /></td>
                  <td><input defaultValue=${row.note || ""} onChange=${(e) => setEditRows((p) => ({ ...p, [row.id]: { ...p[row.id], note: e.target.value } }))} /></td>
                  <td className="actions">
                    <button onClick=${() => saveRow(row.id)}>保存</button>
                    <button className="ghost" onClick=${() => deleteRow(row.id)}>削除</button>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
