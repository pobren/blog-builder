// The blog's default tab icon (src/favicon.ts): its first letter, until the writer adds a Site icon in Settings.
import type { APIRoute } from "astro";
import { getSiteSettings } from "emdash";
import { faviconSvg } from "../favicon";

export const prerender = false;

export const GET: APIRoute = async () => {
	const title = ((await getSiteSettings().catch(() => null)) as { title?: string } | null)?.title;
	return new Response(faviconSvg(title), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
};
