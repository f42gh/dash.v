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

type Task = {
  id: number;
  date: string;
  title: string;
  urgent: number;
  important: number;
  done: number;
  created_at: string;
};

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  priorityLabel: string;
  dueDate: string | null;
  state: { name: string; type: string };
  labels: { nodes: { name: string; color: string }[] };
  project: { name: string } | null;
  team: { name: string; key: string };
  eisenhower: { urgent: boolean; important: boolean };
};

type Stats = {
  today: { total: number; avg_score: number | null };
  byCategory: { category: string; count: number; avg_score: number }[];
  weekly: { date: string; count: number; avg_score: number }[];
};

// Unified item for the matrix — either a local task or a Linear issue
type MatrixItem = {
  key: string;
  title: string;
  urgent: boolean;
  important: boolean;
  done: boolean;
  source: "local" | "linear";
  identifier?: string; // e.g. "MAB-5"
  priorityLabel?: string;
  state?: string;
  localTask?: Task;
};

const CATEGORIES = ["仕事", "学習", "運動", "生活", "趣味"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

const scoreColor = (s: number) => {
  const colors = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-lime-400", "text-green-400"];
  return colors[s] || "";
};

const priorityColor = (p: number) => {
  switch (p) {
    case 1: return "text-red-400";
    case 2: return "text-orange-400";
    case 3: return "text-yellow-400";
    default: return "text-zinc-500";
  }
};

// ─── Eisenhower Matrix ───────────────────────────────────────

const QUADRANTS = [
  { key: "q1", label: "Do First", urgent: true, important: true, color: "border-red-500/40", bg: "bg-red-500/5" },
  { key: "q2", label: "Schedule", urgent: false, important: true, color: "border-blue-500/40", bg: "bg-blue-500/5" },
  { key: "q3", label: "Delegate", urgent: true, important: false, color: "border-yellow-500/40", bg: "bg-yellow-500/5" },
  { key: "q4", label: "Eliminate", urgent: false, important: false, color: "border-zinc-600/40", bg: "bg-zinc-500/5" },
] as const;

function EisenhowerMatrix({
  items,
  onToggleDone,
  onDelete,
}: {
  items: MatrixItem[];
  onToggleDone: (item: MatrixItem) => void;
  onDelete: (item: MatrixItem) => void;
}) {
  const quadrantItems = (urgent: boolean, important: boolean) =>
    items.filter((t) => t.urgent === urgent && t.important === important);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex justify-center">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Urgent</span>
        <span className="mx-8 text-[10px] text-zinc-600">|</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Not Urgent</span>
      </div>
      {QUADRANTS.map((q) => {
        const qItems = quadrantItems(q.urgent, q.important);
        return (
          <div key={q.key} className={`rounded-lg border ${q.color} ${q.bg} p-3 min-h-[120px]`}>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">{q.label}</div>
            <div className="space-y-1.5">
              {qItems.map((item) => (
                <div key={item.key} className="flex items-start gap-2 group text-sm">
                  {item.source === "local" ? (
                    <button
                      onClick={() => onToggleDone(item)}
                      className={`w-4 h-4 mt-0.5 rounded border shrink-0 flex items-center justify-center text-[10px] transition-colors ${
                        item.done
                          ? "bg-green-600 border-green-600 text-white"
                          : "border-zinc-600 hover:border-zinc-400"
                      }`}
                    >
                      {item.done ? "✓" : ""}
                    </button>
                  ) : (
                    <span className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center text-[10px] text-indigo-400">◆</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={item.done ? "line-through text-zinc-600" : ""}>
                      {item.title}
                    </span>
                    {item.source === "linear" && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-indigo-400/70">{item.identifier}</span>
                        <span className="text-[10px] text-zinc-600">{item.state}</span>
                      </div>
                    )}
                  </div>
                  {item.source === "local" && (
                    <button
                      onClick={() => onDelete(item)}
                      className="ml-auto text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {qItems.length === 0 && (
                <p className="text-[11px] text-zinc-700 italic">empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Task Input ──────────────────────────────────────────────

function TaskInput({
  onAdd,
}: {
  onAdd: (title: string, urgent: boolean, important: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), urgent, important);
    setTitle("");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task..."
        required
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm placeholder-zinc-600"
      />
      <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="accent-red-500"
        />
        Urgent
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
          className="accent-blue-500"
        />
        Important
      </label>
      <button
        type="submit"
        className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
      >
        Add
      </button>
    </form>
  );
}

// ─── Linear Issues Summary (Analytics) ───────────────────────

function LinearSummary({ issues }: { issues: LinearIssue[] }) {
  if (issues.length === 0) return null;

  const byPriority = [1, 2, 3, 4, 0].map((p) => ({
    priority: p,
    label: ["No priority", "Urgent", "High", "Medium", "Low"][p],
    issues: issues.filter((i) => i.priority === p),
  })).filter((g) => g.issues.length > 0);

  const byTeam = Object.entries(
    issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.team.name] = (acc[i.team.name] || 0) + 1;
      return acc;
    }, {})
  );

  const byState = Object.entries(
    issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.state.name] = (acc[i.state.name] || 0) + 1;
      return acc;
    }, {})
  );

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-indigo-400 text-sm">◆</span>
          <span className="text-xs text-zinc-500">Linear Issues</span>
          <span className="ml-auto text-lg font-bold">{issues.length}</span>
        </div>

        {/* By priority */}
        <div className="space-y-1.5 mb-4">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Priority</div>
          {byPriority.map((g) => (
            <div key={g.priority} className="flex items-center gap-2 text-sm">
              <span className={`w-16 ${priorityColor(g.priority)}`}>{g.label}</span>
              <div className="flex-1 bg-zinc-900 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500/60 h-full rounded-full"
                  style={{ width: `${(g.issues.length / issues.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 w-6 text-right">{g.issues.length}</span>
            </div>
          ))}
        </div>

        {/* By state */}
        <div className="space-y-1.5 mb-4">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider">State</div>
          {byState.map(([state, count]) => (
            <div key={state} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{state}</span>
              <span className="text-xs text-zinc-500">{count}</span>
            </div>
          ))}
        </div>

        {/* By team */}
        {byTeam.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Team</div>
            {byTeam.map(([team, count]) => (
              <div key={team} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{team}</span>
                <span className="text-xs text-zinc-500">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full issue list */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">All Issues</div>
        <div className="space-y-2">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-center gap-3 text-sm">
              <span className={`text-xs font-mono ${priorityColor(issue.priority)}`}>
                {issue.identifier}
              </span>
              <span className="flex-1 truncate">{issue.title}</span>
              <span className="text-[10px] text-zinc-600">{issue.state.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Section ───────────────────────────────────────

function Analytics({
  date,
  entries,
  stats,
  linearIssues,
  onAddEntry,
  onDeleteEntry,
}: {
  date: string;
  entries: Entry[];
  stats: Stats | null;
  linearIssues: LinearIssue[];
  onAddEntry: (title: string, category: string, score: number, note: string) => void;
  onDeleteEntry: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [score, setScore] = useState(3);
  const [note, setNote] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddEntry(title.trim(), category, score, note.trim());
    setTitle("");
    setNote("");
    setScore(3);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-zinc-300">Analytics</h2>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="text-3xl font-bold">{stats.today.total}</div>
            <div className="text-xs text-zinc-500">Entries</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className={`text-3xl font-bold ${scoreColor(Math.round(stats.today.avg_score ?? 0))}`}>
              {stats.today.avg_score ?? "-"}
            </div>
            <div className="text-xs text-zinc-500">Avg Score</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="text-3xl font-bold text-indigo-400">{linearIssues.length}</div>
            <div className="text-xs text-zinc-500">Linear Issues</div>
          </div>
        </div>
      )}

      {/* Weekly chart */}
      {stats && stats.weekly.length > 0 && (
        <div className="mb-4 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="text-xs text-zinc-500 mb-3">Past 7 days</div>
          <div className="flex items-end gap-1 h-16">
            {stats.weekly.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-green-500/70 rounded-sm min-h-[2px]"
                  style={{ height: `${(d.count / Math.max(...stats.weekly.map((w) => w.count))) * 100}%` }}
                />
                <span className="text-[10px] text-zinc-600">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linear summary */}
      <div className="mb-4">
        <LinearSummary issues={linearIssues} />
      </div>

      {/* Add entry form */}
      <form onSubmit={submit} className="mb-4 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
        <div className="flex gap-2 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Activity..."
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
          <label className="text-xs text-zinc-500 shrink-0">Score</label>
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
            placeholder="Note (optional)"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm placeholder-zinc-600"
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </form>

      {/* Entry list */}
      <div className="space-y-2 mb-4">
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
              onClick={() => onDeleteEntry(entry.id)}
              className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      {stats && stats.byCategory.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="text-xs text-zinc-500 mb-3">By Category</div>
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
                <span className="text-xs text-zinc-500 w-16 text-right">{c.count} / {c.avg_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────

export function App() {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const [entriesRes, statsRes, tasksRes, linearRes] = await Promise.all([
      fetch(`/api/entries?date=${date}`),
      fetch(`/api/stats?date=${date}`),
      fetch(`/api/tasks?date=${date}`),
      fetch("/api/linear/issues"),
    ]);
    setEntries(await entriesRes.json());
    setStats(await statsRes.json());
    setTasks(await tasksRes.json());
    setLinearIssues(await linearRes.json());
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Build unified matrix items
  const matrixItems: MatrixItem[] = [
    ...tasks.map((t): MatrixItem => ({
      key: `local-${t.id}`,
      title: t.title,
      urgent: !!t.urgent,
      important: !!t.important,
      done: !!t.done,
      source: "local",
      localTask: t,
    })),
    ...linearIssues.map((i): MatrixItem => ({
      key: `linear-${i.id}`,
      title: i.title,
      urgent: i.eisenhower.urgent,
      important: i.eisenhower.important,
      done: false,
      source: "linear",
      identifier: i.identifier,
      priorityLabel: i.priorityLabel,
      state: i.state.name,
    })),
  ];

  const addTask = async (title: string, urgent: boolean, important: boolean) => {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, title, urgent, important }),
    });
    load();
  };

  const toggleItemDone = async (item: MatrixItem) => {
    if (item.source !== "local" || !item.localTask) return;
    await fetch(`/api/tasks/${item.localTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.localTask.done }),
    });
    load();
  };

  const deleteItem = async (item: MatrixItem) => {
    if (item.source !== "local" || !item.localTask) return;
    await fetch(`/api/tasks/${item.localTask.id}`, { method: "DELETE" });
    load();
  };

  const addEntry = async (title: string, category: string, score: number, note: string) => {
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, title, category, score, note: note || null }),
    });
    load();
  };

  const deleteEntry = async (id: number) => {
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
    load();
  };

  const localTasks = matrixItems.filter((i) => i.source === "local");
  const doneCount = localTasks.filter((t) => t.done).length;

  return (
    <div className="max-w-2xl mx-auto p-6 w-full">
      {/* ── Header: Date ── */}
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{formatDate(date)}</h1>
          <p className="text-xs text-zinc-500 mt-1">
            {localTasks.length > 0
              ? `${doneCount}/${localTasks.length} tasks done`
              : "No tasks yet"}
            {linearIssues.length > 0 && (
              <span className="text-indigo-400/70 ml-2">
                + {linearIssues.length} Linear issues
              </span>
            )}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-400"
        />
      </div>

      {/* ── Task Input ── */}
      <div className="mb-6">
        <TaskInput onAdd={addTask} />
      </div>

      {/* ── Eisenhower Matrix ── */}
      <div className="mb-8">
        <EisenhowerMatrix items={matrixItems} onToggleDone={toggleItemDone} onDelete={deleteItem} />
      </div>

      {/* ── Divider ── */}
      <hr className="border-zinc-800 mb-8" />

      {/* ── Analytics (scrolls below) ── */}
      <Analytics
        date={date}
        entries={entries}
        stats={stats}
        linearIssues={linearIssues}
        onAddEntry={addEntry}
        onDeleteEntry={deleteEntry}
      />
    </div>
  );
}

export default App;
