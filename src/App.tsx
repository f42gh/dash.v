import { useState, useEffect, useCallback } from "react";
import "./index.css";

type Entry = {
  id: number;
  date: string;
  title: string;
  category: string | null;
  score: number;
  note: string | null;
  created_at: string;
};

type Stats = {
  today: { total: number; avg_score: number | null };
  byCategory: { category: string; count: number; avg_score: number }[];
  weekly: { date: string; count: number; avg_score: number }[];
};

const CATEGORIES = ["仕事", "学習", "運動", "生活", "趣味"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [score, setScore] = useState(3);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [entriesRes, statsRes] = await Promise.all([
      fetch(`/api/entries?date=${date}`),
      fetch(`/api/stats?date=${date}`),
    ]);
    setEntries(await entriesRes.json());
    setStats(await statsRes.json());
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, title: title.trim(), category, score, note: note.trim() || null }),
    });
    setTitle("");
    setNote("");
    setScore(3);
    load();
  };

  const deleteEntry = async (id: number) => {
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
    load();
  };

  const scoreColor = (s: number) => {
    const colors = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-lime-400", "text-green-400"];
    return colors[s] || "";
  };

  return (
    <div className="max-w-2xl mx-auto p-6 w-full">
      <h1 className="text-3xl font-bold mb-1">dash.v</h1>
      <p className="text-sm text-zinc-500 mb-6">個人ダッシュボード</p>

      {/* Date picker */}
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-6 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm"
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="text-3xl font-bold">{stats.today.total}</div>
            <div className="text-xs text-zinc-500">エントリー</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className={`text-3xl font-bold ${scoreColor(Math.round(stats.today.avg_score ?? 0))}`}>
              {stats.today.avg_score ?? "-"}
            </div>
            <div className="text-xs text-zinc-500">平均スコア</div>
          </div>
        </div>
      )}

      {/* Weekly mini chart */}
      {stats && stats.weekly.length > 0 && (
        <div className="mb-6 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="text-xs text-zinc-500 mb-3">過去7日間</div>
          <div className="flex items-end gap-1 h-16">
            {stats.weekly.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-green-500/70 rounded-sm min-h-[2px]"
                  style={{ height: `${(d.count / Math.max(...stats.weekly.map(w => w.count))) * 100}%` }}
                />
                <span className="text-[10px] text-zinc-600">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={addEntry} className="mb-6 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
        <div className="flex gap-2 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="やったこと"
            required
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm placeholder-zinc-600"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <label className="text-xs text-zinc-500 shrink-0">達成度</label>
          <input
            type="range"
            min={1}
            max={5}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="flex-1"
          />
          <span className={`text-sm font-bold w-6 text-center ${scoreColor(score)}`}>{score}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモ（任意）"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm placeholder-zinc-600"
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            追加
          </button>
        </div>
      </form>

      {/* Entry list */}
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-8">まだエントリーがありません</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-4 py-3 border border-zinc-700/30 group"
          >
            <span className={`text-lg font-bold w-6 text-center ${scoreColor(entry.score)}`}>
              {entry.score}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{entry.title}</div>
              {entry.note && <div className="text-xs text-zinc-500 truncate">{entry.note}</div>}
            </div>
            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">{entry.category}</span>
            <button
              onClick={() => deleteEntry(entry.id)}
              className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      {stats && stats.byCategory.length > 0 && (
        <div className="mt-6 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="text-xs text-zinc-500 mb-3">カテゴリ別</div>
          <div className="space-y-2">
            {stats.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-zinc-500">{c.category}</span>
                <div className="flex-1 bg-zinc-900 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500/70 h-full rounded-full"
                    style={{ width: `${(c.avg_score / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500 w-16 text-right">{c.count}件 / {c.avg_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
