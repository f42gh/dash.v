// dash.v API on Cloudflare Workers + D1. Static frontend is served by Workers Static Assets.

export interface Env {
  DB: D1Database;
}

export type ItemRow = {
  id: number;
  name: string;
  price: number;
  purchased_on: string;
  lifespan_months: number;
  retired_on: string | null;
  note: string | null;
  recurring: number;
  tags: string[];
};

const UNTAGGED = "未分類";
const FOREVER = 1e9;

// --- amortization (straight-line, month granularity) ---

export const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
export const monthLabel = (mi: number) => `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, "0")}`;
// ponytail: fixed to JST, the only user's timezone; make it a var if that changes
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** [start, end) months during which the item costs money. */
function activeRange(item: ItemRow): [number, number] {
  const start = monthIndex(item.purchased_on);
  let end = item.recurring ? FOREVER : start + item.lifespan_months;
  if (item.retired_on) end = Math.min(end, monthIndex(item.retired_on) + 1);
  return [start, end];
}

const monthlyCost = (item: ItemRow) => item.price / item.lifespan_months;

function costInMonth(item: ItemRow, mi: number) {
  const [start, end] = activeRange(item);
  return start <= mi && mi < end ? monthlyCost(item) : 0;
}

export function enrich(item: ItemRow, todayMi: number) {
  const start = monthIndex(item.purchased_on);
  const monthly_cost = Math.round(monthlyCost(item));
  if (item.retired_on && monthIndex(item.retired_on) <= todayMi) {
    return { ...item, monthly_cost, ends_on: null, months_left: null, book_value: 0, status: "retired" as const };
  }
  if (item.recurring) {
    return { ...item, monthly_cost, ends_on: null, months_left: null, book_value: 0, status: "active" as const };
  }
  const end = start + item.lifespan_months;
  const elapsed = Math.min(Math.max(todayMi - start + 1, 0), item.lifespan_months);
  return {
    ...item,
    monthly_cost,
    ends_on: monthLabel(end - 1),
    months_left: Math.max(end - todayMi - 1, 0),
    book_value: Math.round(item.price - monthlyCost(item) * elapsed),
    status: todayMi >= end ? ("paid_off" as const) : ("active" as const), // paid_off = 償却済みだが使用中
  };
}

export function summarize(items: ItemRow[], budgets: Record<string, number>, todayMi: number, back: number, ahead: number) {
  const timeline = [];
  for (let m = todayMi - back; m <= todayMi + ahead; m++) {
    timeline.push({ month: monthLabel(m), cost: Math.round(items.reduce((s, i) => s + costInMonth(i, m), 0)) });
  }

  const byTag: Record<string, number> = {};
  for (const i of items) {
    const c = costInMonth(i, todayMi);
    for (const t of i.tags.length ? i.tags : [UNTAGGED]) byTag[t] = (byTag[t] ?? 0) + c;
  }
  const tags = [...new Set([...Object.keys(byTag), ...Object.keys(budgets)])].sort((a, b) => (byTag[b] ?? 0) - (byTag[a] ?? 0));

  const enriched = items.map((i) => enrich(i, todayMi));
  return {
    month: monthLabel(todayMi),
    monthly_total: timeline[back].cost,
    budget_total: Object.values(budgets).reduce((a, b) => a + b, 0),
    book_value: enriched.reduce((s, i) => s + i.book_value, 0),
    active_count: enriched.filter((i) => i.status === "active" && !i.recurring).length,
    subscription_total: Math.round(items.filter((i) => i.recurring).reduce((s, i) => s + costInMonth(i, todayMi), 0)),
    subscription_count: enriched.filter((i) => i.status === "active" && i.recurring).length,
    paid_off_count: enriched.filter((i) => i.status === "paid_off").length,
    timeline,
    tags: tags.map((t) => ({ tag: t, cost: Math.round(byTag[t] ?? 0), budget: (budgets[t] as number | undefined) ?? null })),
    ending_soon: enriched
      .filter((i) => i.status === "active" && !i.recurring && i.months_left! <= 3)
      .sort((a, b) => a.months_left! - b.months_left!),
  };
}

// --- DB ---

async function loadItems(db: D1Database): Promise<ItemRow[]> {
  const [items, tags] = await db.batch([
    db.prepare("SELECT id, name, price, purchased_on, lifespan_months, retired_on, note, recurring FROM items ORDER BY purchased_on DESC, id DESC"),
    db.prepare("SELECT item_id, tag FROM item_tags ORDER BY tag"),
  ]);
  const byItem = new Map<number, string[]>();
  for (const r of tags.results as { item_id: number; tag: string }[]) {
    byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r.tag]);
  }
  return (items.results as Omit<ItemRow, "tags">[]).map((r) => ({ ...r, tags: byItem.get(r.id) ?? [] }));
}

async function loadBudgets(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT tag, monthly_limit FROM budgets").all<{ tag: string; monthly_limit: number }>();
  return Object.fromEntries(results.map((r) => [r.tag, r.monthly_limit]));
}

type ItemIn = Omit<ItemRow, "id" | "tags" | "recurring"> & { tags: string[]; recurring: boolean };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Returns the validated item, or an error message. */
export function parseItem(b: any): ItemIn | string {
  if (typeof b?.name !== "string" || !b.name.trim()) return "name is required";
  if (!isInt(b.price, 0)) return "price must be a non-negative integer";
  if (!isDate(b.purchased_on)) return "purchased_on must be YYYY-MM-DD";
  if (!isInt(b.lifespan_months, 1, 1200)) return "lifespan_months must be 1..1200";
  if (b.retired_on != null && !isDate(b.retired_on)) return "retired_on must be YYYY-MM-DD";
  if (b.retired_on && b.retired_on < b.purchased_on) return "retired_on must be after purchased_on";
  if (b.tags != null && (!Array.isArray(b.tags) || !b.tags.every((t: unknown) => typeof t === "string"))) return "tags must be strings";
  return {
    name: b.name.trim(),
    price: b.price,
    purchased_on: b.purchased_on,
    lifespan_months: b.lifespan_months,
    retired_on: b.retired_on || null,
    note: typeof b.note === "string" && b.note ? b.note : null,
    tags: [...new Set<string>((b.tags ?? []).map((t: string) => t.trim()).filter(Boolean))],
    recurring: !!b.recurring,
  };
}

function tagStatements(db: D1Database, id: number, tags: string[]) {
  return [
    db.prepare("DELETE FROM item_tags WHERE item_id = ?").bind(id),
    ...tags.map((t) => db.prepare("INSERT INTO item_tags (item_id, tag) VALUES (?, ?)").bind(id, t)),
  ];
}

// --- HTTP ---

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (status: number, detail: string) => json({ detail }, status);

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const db = env.DB;
  const path = url.pathname;
  const todayMi = monthIndex(todayIso());
  let m: RegExpMatchArray | null;

  if (path === "/api/summary" && req.method === "GET") {
    const back = Math.max(Number(url.searchParams.get("back") ?? 12) || 0, 0);
    const ahead = Math.max(Number(url.searchParams.get("ahead") ?? 12) || 0, 0);
    const [items, budgets] = await Promise.all([loadItems(db), loadBudgets(db)]);
    return json(summarize(items, budgets, todayMi, back, ahead));
  }

  if (path === "/api/items") {
    if (req.method === "GET") return json((await loadItems(db)).map((i) => enrich(i, todayMi)));
    if (req.method === "POST") {
      const p = parseItem(await req.json().catch(() => null));
      if (typeof p === "string") return fail(422, p);
      const row = await db
        .prepare("INSERT INTO items (name, price, purchased_on, lifespan_months, retired_on, note, recurring) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
        .bind(p.name, p.price, p.purchased_on, p.lifespan_months, p.retired_on, p.note, Number(p.recurring))
        .first<{ id: number }>();
      await db.batch(tagStatements(db, row!.id, p.tags));
      return json({ id: row!.id });
    }
  }

  if ((m = path.match(/^\/api\/items\/(\d+)$/))) {
    const id = Number(m[1]);
    if (req.method === "PUT") {
      const p = parseItem(await req.json().catch(() => null));
      if (typeof p === "string") return fail(422, p);
      if (!(await db.prepare("SELECT 1 FROM items WHERE id = ?").bind(id).first())) return fail(404, "Item not found");
      await db.batch([
        db.prepare("UPDATE items SET name=?, price=?, purchased_on=?, lifespan_months=?, retired_on=?, note=?, recurring=? WHERE id=?")
          .bind(p.name, p.price, p.purchased_on, p.lifespan_months, p.retired_on, p.note, Number(p.recurring), id),
        ...tagStatements(db, id, p.tags),
      ]);
      return json({ id });
    }
    if (req.method === "DELETE") {
      const { meta } = await db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
      return meta.changes ? json({ ok: true }) : fail(404, "Item not found");
    }
  }

  if (path === "/api/budgets" && req.method === "GET") return json(await loadBudgets(db));

  if ((m = path.match(/^\/api\/budgets\/(.+)$/))) {
    const tag = decodeURIComponent(m[1]);
    if (req.method === "PUT") {
      const limit = (await req.json().catch(() => null) as any)?.monthly_limit;
      if (!isInt(limit, 0)) return fail(422, "monthly_limit must be a non-negative integer");
      await db.prepare("INSERT INTO budgets (tag, monthly_limit) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET monthly_limit = excluded.monthly_limit").bind(tag, limit).run();
      return json({ tag, monthly_limit: limit });
    }
    if (req.method === "DELETE") {
      await db.prepare("DELETE FROM budgets WHERE tag = ?").bind(tag).run();
      return json({ ok: true });
    }
  }

  return fail(404, "Not found");
}

export default { fetch: handle } satisfies ExportedHandler<Env>;
