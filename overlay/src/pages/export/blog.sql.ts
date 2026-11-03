// Everything in the blog as one SQL file, for the blog's admins only: posts, pages, tags, settings, subscribers and
// the media library's records (the pictures themselves stay at their addresses). It loads into any SQLite database,
// and over a new Blog Builder install on the owner's own Cloudflare account (rows replace what's there), so nothing
// keeps a writer here.
// Sign-in records (sessions, passkeys, API tokens) are left out: they only work on this blog.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const ADMIN = 50;
// Sign-in records, Cloudflare's own tables, and the search index (it builds itself again from the posts).
const SKIP = /^(sqlite_|_cf_|d1_)|_fts|session|token|passkey|credential|auth|challenge|rate|_lock$/i;

const literal = (v: unknown): string => {
	if (v === null || v === undefined) return "NULL";
	if (typeof v === "number" || typeof v === "bigint") return String(v);
	if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
		const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
		return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
	}
	return `'${String(v).replace(/'/g, "''")}'`;
};

export const GET: APIRoute = async ({ locals }) => {
	const user = (locals as { user?: { role?: number } }).user;
	if (!user || (user.role ?? 0) < ADMIN) return new Response("Please sign in to your blog's admin first.", { status: 403, headers: { "Cache-Control": "no-store" } });
	const db = (env as { DB: D1Database }).DB;
	const { results: tables } = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name").all<{ name: string; sql: string }>();
	const day = new Date().toISOString().slice(0, 10);
	const parts: string[] = [`-- Everything in this blog on ${day}. Sign-in records are left out.`, "PRAGMA foreign_keys = OFF;", "BEGIN TRANSACTION;"];
	for (const t of tables) {
		if (SKIP.test(t.name)) continue;
		parts.push(`${t.sql.replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")};`);
		const quoted = `"${t.name.replace(/"/g, '""')}"`;
		let offset = 0;
		for (;;) {
			const { results } = await db.prepare(`SELECT * FROM ${quoted} LIMIT 500 OFFSET ${offset}`).all<Record<string, unknown>>();
			for (const row of results) {
				const cols = Object.keys(row);
				parts.push(`INSERT OR REPLACE INTO ${quoted} (${cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ")}) VALUES (${cols.map((c) => literal(row[c])).join(", ")});`);
			}
			if (results.length < 500) break;
			offset += 500;
		}
	}
	parts.push("COMMIT;", "");
	return new Response(parts.join("\n"), {
		headers: {
			"Content-Type": "application/sql; charset=utf-8",
			"Content-Disposition": `attachment; filename="blog-${day}.sql"`,
			"Cache-Control": "no-store",
		},
	});
};
