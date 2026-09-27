import { expect, test } from "bun:test";
import { enrich, monthIndex, parseItem, summarize, type ItemRow } from "./index";

const TODAY = monthIndex("2026-09-15");
const item = (kw: Partial<ItemRow> = {}): ItemRow => ({
  id: 1, name: "x", price: 120_000, purchased_on: "2026-01-10", lifespan_months: 12,
  retired_on: null, note: null, recurring: 0, tags: ["PC"], ...kw,
});

test("amortization", () => {
  const pc = enrich(item(), TODAY);
  expect(pc.monthly_cost).toBe(10_000);
  expect(pc.status).toBe("active");
  expect([pc.ends_on, pc.months_left]).toEqual(["2026-12", 3]);
  expect(pc.book_value).toBe(30_000); // 9 of 12 months consumed (Jan..Sep)

  expect(enrich(item({ purchased_on: "2024-01-01" }), TODAY).status).toBe("paid_off");
  const gone = enrich(item({ retired_on: "2026-05-01" }), TODAY);
  expect([gone.status, gone.book_value]).toEqual(["retired", 0]);

  const s = summarize([item(), item({ id: 2, tags: [], retired_on: "2026-05-01" })], { PC: 8_000 }, TODAY, 5, 4);
  expect(s.timeline.map((m) => m.cost)).toEqual([20_000, 20_000, ...Array(7).fill(10_000), 0]);
  expect(s.monthly_total).toBe(10_000);
  expect(s.tags).toEqual([{ tag: "PC", cost: 10_000, budget: 8_000 }, { tag: "未分類", cost: 0, budget: null }]);
  expect(s.ending_soon.map((i) => i.id)).toEqual([1]);
});

test("subscriptions: yearly ¥12,000 → ¥1,000/month until cancelled, never ending soon", () => {
  const sub = item({ id: 3, price: 12_000, recurring: 1, purchased_on: "2020-01-01", tags: ["サブスク"] });
  const cancelled = item({ id: 4, price: 500, lifespan_months: 1, recurring: 1, purchased_on: "2026-01-01", retired_on: "2026-08-20" });
  const s = summarize([sub, cancelled], {}, TODAY, 1, 24);
  expect(s.timeline.slice(0, 3).map((m) => m.cost)).toEqual([1_500, 1_000, 1_000]); // Aug still billed, Sep cancelled
  expect(s.timeline.at(-1)!.cost).toBe(1_000);
  expect([s.subscription_total, s.subscription_count]).toEqual([1_000, 1]);
  expect([s.ending_soon, s.active_count]).toEqual([[], 0]);
});

test("input validation", () => {
  const ok = { name: " Mac ", price: 1, purchased_on: "2026-05-01", lifespan_months: 12, tags: ["a", " a ", ""] };
  expect(parseItem(ok)).toMatchObject({ name: "Mac", tags: ["a"], retired_on: null, recurring: false });
  expect(parseItem({ ...ok, retired_on: "2026-01-01" })).toBe("retired_on must be after purchased_on");
  expect(parseItem({ ...ok, price: -1 })).toBeTypeOf("string");
  expect(parseItem({ ...ok, lifespan_months: 0 })).toBeTypeOf("string");
  expect(parseItem(null)).toBeTypeOf("string");
});
