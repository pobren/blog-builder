// The IndexNow key file (src/indexnow.ts): search engines fetch it to check a ping really came from this blog.
import type { APIRoute } from "astro";
import { indexNowKey } from "../indexnow";

export const prerender = false;

export const GET: APIRoute = async () =>
	new Response(await indexNowKey(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
