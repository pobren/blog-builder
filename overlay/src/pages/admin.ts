// A short, easy-to-remember address for the blog's admin: yourblog/admin opens EmDash's /_emdash/admin.
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () =>
	new Response(null, { status: 302, headers: { Location: "/_emdash/admin", "Cache-Control": "no-store" } });
