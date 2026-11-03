// The newsletter sign-ups as a CSV file, for the blog's admins only
// (the "newsletter" plugin, src/extras/newsletter.ts).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const ADMIN = 50;

// Quoted where needed, and never starting with = + - @, which spreadsheets would run as a formula.
const cell = (raw: string) => {
	const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
	return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export const GET: APIRoute = async ({ locals }) => {
	const user = (locals as { user?: { role?: number } }).user;
	if (!user || (user.role ?? 0) < ADMIN) return new Response("Please sign in to your blog's admin first.", { status: 403, headers: { "Cache-Control": "no-store" } });
	const db = (env as { DB: D1Database }).DB;
	const { results } = await db
		.prepare("SELECT data FROM _plugin_storage WHERE plugin_id = 'newsletter' AND collection = 'subscribers'")
		.all<{ data: string }>();
	const rows = results
		.map((r) => JSON.parse(r.data) as { email?: string; name?: string; createdAt?: string; from?: string })
		.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
	const csv = ["email,name,signed_up,page", ...rows.map((r) => [r.email ?? "", r.name ?? "", r.createdAt ?? "", r.from ?? ""].map(cell).join(","))].join("\r\n");
	return new Response(`${csv}\r\n`, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": 'attachment; filename="subscribers.csv"',
			"Cache-Control": "no-store",
		},
	});
};
