"""Run: uv run python test_app.py"""
from app import enrich, month_index, summarize

TODAY = month_index("2026-09-15")


def item(**kw):
    base = {"id": 1, "name": "x", "price": 120_000, "purchased_on": "2026-01-10",
            "lifespan_months": 12, "retired_on": None, "note": None, "tags": ["PC"], "recurring": 0}
    return {**base, **kw}


def test():
    pc = enrich(item(), TODAY)
    assert pc["monthly_cost"] == 10_000
    assert pc["status"] == "active"
    assert pc["ends_on"] == "2026-12" and pc["months_left"] == 3
    assert pc["book_value"] == 30_000  # 9 of 12 months consumed (Jan..Sep)

    assert enrich(item(purchased_on="2024-01-01"), TODAY)["status"] == "paid_off"
    gone = enrich(item(retired_on="2026-05-01"), TODAY)
    assert gone["status"] == "retired" and gone["book_value"] == 0

    s = summarize([item(), item(id=2, tags=[], retired_on="2026-05-01")], {"PC": 8_000}, TODAY, 5, 4)
    assert [m["cost"] for m in s["timeline"]] == [20_000, 20_000] + [10_000] * 7 + [0]
    assert s["monthly_total"] == 10_000
    assert s["tags"][0] == {"tag": "PC", "cost": 10_000, "budget": 8_000}
    assert s["tags"][1] == {"tag": "未分類", "cost": 0, "budget": None}
    assert [i["id"] for i in s["ending_soon"]] == [1]

    # subscriptions: yearly ¥12,000 → ¥1,000 every month until cancelled, never "ending soon"
    sub = item(id=3, price=12_000, recurring=1, purchased_on="2020-01-01", tags=["サブスク"])
    cancelled = item(id=4, price=500, lifespan_months=1, recurring=1, purchased_on="2026-01-01", retired_on="2026-08-20")
    s = summarize([sub, cancelled], {}, TODAY, 1, 24)
    assert [m["cost"] for m in s["timeline"][:3]] == [1_500, 1_000, 1_000]  # Aug still billed, Sep cancelled
    assert s["timeline"][-1]["cost"] == 1_000
    assert s["subscription_total"] == 1_000 and s["subscription_count"] == 1
    assert s["ending_soon"] == [] and s["active_count"] == 0


if __name__ == "__main__":
    test()
    print("ok")
