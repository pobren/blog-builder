// Video thumbnails for click-to-load embeds (src/embeds.ts), fetched by
// the blog so that readers' browsers never contact YouTube or Vimeo before
// they press play. Kept in Cloudflare's cache for a week.
import type { APIRoute } from "astro";

export const prerender = false;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_IMAGES = /(^|\.)vimeocdn\.com$/;

async function imageUrl(provider: string, id: string): Promise<string | null> {
	if (provider === "youtube" && YOUTUBE_ID.test(id)) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
	if (provider === "vimeo" && VIMEO_ID.test(id)) {
		const res = await fetch(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(`https://vimeo.com/${id}`)}`);
		if (!res.ok) return null;
		const { thumbnail_url: thumb } = (await res.json()) as { thumbnail_url?: unknown };
		if (typeof thumb !== "string") return null;
		const url = new URL(thumb);
		return url.protocol === "https:" && VIMEO_IMAGES.test(url.hostname) ? url.href : null;
	}
	return null;
}

export const GET: APIRoute = async ({ params, request }) => {
	const cache = typeof caches === "undefined" ? undefined : (caches as unknown as { default: Cache }).default;
	const hit = await cache?.match(request);
	if (hit) return hit;

	const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
	let source: string | null = null;
	try {
		source = await imageUrl(params.provider ?? "", params.id ?? "");
	} catch {
		source = null;
	}
	if (!source) return missing();

	const image = await fetch(source);
	const type = image.headers.get("content-type") ?? "";
	if (!image.ok || !type.startsWith("image/")) return missing();

	const res = new Response(image.body, {
		headers: {
			"Content-Type": type,
			"Cache-Control": "public, max-age=604800",
			"X-Content-Type-Options": "nosniff",
		},
	});
	await cache?.put(request, res.clone());
	return res;
};
