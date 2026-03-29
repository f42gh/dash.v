import { serve } from "bun";
import index from "./index.html";
import { db } from "./db";
import { fetchMyIssues, toEisenhower } from "./linear";

const server = serve({
  routes: {
    "/*": index,

    "/api/entries": {
      async GET(req) {
        const url = new URL(req.url);
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        const rows = db.query("SELECT * FROM entries WHERE date = ? ORDER BY created_at DESC").all(date);
        return Response.json(rows);
      },
      async POST(req) {
        const body = await req.json();
        const date = body.date || new Date().toISOString().slice(0, 10);
        const stmt = db.prepare(
          "INSERT INTO entries (date, title, category, score, note) VALUES (?, ?, ?, ?, ?)"
        );
        const result = stmt.run(date, body.title, body.category || null, body.score ?? 3, body.note || null);
        const entry = db.query("SELECT * FROM entries WHERE id = ?").get(result.lastInsertRowid);
        return Response.json(entry, { status: 201 });
      },
    },

    "/api/entries/:id": {
      async DELETE(req) {
        db.run("DELETE FROM entries WHERE id = ?", [req.params.id]);
        return Response.json({ ok: true });
      },
    },

    "/api/tasks": {
      async GET(req) {
        const url = new URL(req.url);
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        const rows = db.query("SELECT * FROM tasks WHERE date = ? ORDER BY created_at ASC").all(date);
        return Response.json(rows);
      },
      async POST(req) {
        const body = await req.json();
        const date = body.date || new Date().toISOString().slice(0, 10);
        const stmt = db.prepare(
          "INSERT INTO tasks (date, title, urgent, important) VALUES (?, ?, ?, ?)"
        );
        const result = stmt.run(date, body.title, body.urgent ? 1 : 0, body.important ? 1 : 0);
        const task = db.query("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
        return Response.json(task, { status: 201 });
      },
    },

    "/api/tasks/:id": {
      async PATCH(req) {
        const body = await req.json();
        const fields: string[] = [];
        const values: any[] = [];
        for (const key of ["title", "urgent", "important", "done"] as const) {
          if (key in body) {
            fields.push(`${key} = ?`);
            values.push(typeof body[key] === "boolean" ? (body[key] ? 1 : 0) : body[key]);
          }
        }
        if (fields.length > 0) {
          values.push(req.params.id);
          db.run(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);
        }
        const task = db.query("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
        return Response.json(task);
      },
      async DELETE(req) {
        db.run("DELETE FROM tasks WHERE id = ?", [req.params.id]);
        return Response.json({ ok: true });
      },
    },

    "/api/linear/issues": {
      async GET() {
        const issues = await fetchMyIssues();
        const mapped = issues.map((issue) => ({
          ...issue,
          eisenhower: toEisenhower(issue.priority),
        }));
        return Response.json(mapped);
      },
    },

    "/api/stats": {
      async GET(req) {
        const url = new URL(req.url);
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

        const today = db.query(`
          SELECT COUNT(*) as total, ROUND(AVG(score), 1) as avg_score
          FROM entries WHERE date = ?
        `).get(date) as any;

        const byCategory = db.query(`
          SELECT category, COUNT(*) as count, ROUND(AVG(score), 1) as avg_score
          FROM entries WHERE date = ?
          GROUP BY category
        `).all(date);

        const weekly = db.query(`
          SELECT date, COUNT(*) as count, ROUND(AVG(score), 1) as avg_score
          FROM entries
          WHERE date >= date(?, '-6 days')
          GROUP BY date
          ORDER BY date
        `).all(date);

        return Response.json({ today, byCategory, weekly });
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
