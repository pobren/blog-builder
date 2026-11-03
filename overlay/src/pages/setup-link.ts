// The installer's set-up link lands here. src/middleware.ts has already stored the code
// from ?setup= in a cookie if it matched, so send the owner on to the admin.
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () =>
	new Response(null, { status: 302, headers: { Location: "/_emdash/admin", "Cache-Control": "no-store" } });
