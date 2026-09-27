-- Sample data for local dev: bunx wrangler d1 execute dash-v --local --file fixtures/seed.sql
INSERT INTO items (id, name, price, purchased_on, lifespan_months, retired_on, recurring) VALUES
  (1, 'MacBook Pro', 348000, '2025-01-01', 48, NULL, 0),
  (2, '外部モニター', 62000, '2024-03-01', 60, NULL, 0),
  (3, 'iPhone', 159800, '2025-07-01', 36, NULL, 0),
  (4, '旧iPhone', 124800, '2022-07-01', 36, '2025-07-01', 0),
  (5, 'ワークチェア', 98000, '2020-11-01', 60, NULL, 0),
  (6, '冷蔵庫', 145000, '2023-05-01', 120, NULL, 0),
  (7, 'ドラム式洗濯機', 238000, '2025-11-01', 96, NULL, 0),
  (8, 'ランニングシューズ', 18700, '2026-04-01', 8, NULL, 0),
  (9, '冬コート', 42000, '2024-11-01', 36, NULL, 0),
  (10, 'Netflix', 1590, '2025-03-01', 1, NULL, 1),
  (11, 'Amazonプライム', 5900, '2024-05-01', 12, NULL, 1),
  (12, 'iCloud+', 400, '2024-03-01', 1, NULL, 1);
INSERT INTO item_tags (item_id, tag) VALUES
  (1, 'PC'), (1, '仕事'), (2, 'PC'), (2, '仕事'), (3, 'スマホ'), (4, 'スマホ'), (5, '家具'),
  (6, '家電'), (7, '家電'), (8, '衣類'), (8, '運動'), (9, '衣類'),
  (10, 'サブスク'), (11, 'サブスク'), (12, 'サブスク');
INSERT INTO budgets (tag, monthly_limit) VALUES ('PC', 9000), ('スマホ', 3000), ('家電', 3000);
