// Picture sizes (24 Oct 2026). astro.config.mjs points image.endpoint here.
//
// EmDash's image endpoint (@emdash-cms/cloudflare/image-endpoint) resizes a picture with Cloudflare Images each
// time a size is asked for, and Cloudflare charges for each different size made in a month.
//
// Here each size is made once: the first time, a copy goes in the blog's media bucket under sizes/ and from then
// on that copy is served. The copy's name includes the original's ETag, so "Replace
// original" in the media library makes fresh sizes.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GET as emdashImage } from "@emdash-cms/cloudflare/image-endpoint";
import { MUTABLE_MEDIA_CACHE_CONTROL, getTransformFingerprint, matchInternalMediaKey } from "emdash/media/image-endpoint";

export const prerender = false;

/** The kept copy's name: the picture's key and version plus the size settings. null when nothing is resized. */
export function sizeKey(mediaKey: string, etag: string, params: URLSearchParams): string | null {
	const fingerprint = getTransformFingerprint(params);
	if (!fingerprint) return null;
	const clean = (s: string) => s.replace(/[^a-zA-Z0-9=&._-]/g, "_");
	return `sizes/${mediaKey}/${clean(etag)}/${clean(fingerprint)}`;
}

function keptPicture(kept: R2ObjectBody, cacheControl = MUTABLE_MEDIA_CACHE_CONTROL): Response {
	return new Response(kept.body, {
		headers: {
			"Content-Type": kept.httpMetadata?.contentType ?? "image/webp",
			"Cache-Control": cacheControl,
			"X-Content-Type-Options": "nosniff",
			ETag: kept.httpEtag,
		},
	});
}

export const GET: APIRoute = async (ctx) => {
	const url = new URL(ctx.request.url);
	const vars = env as { MEDIA?: R2Bucket };
	const media = vars.MEDIA;
	const mediaKey = matchInternalMediaKey(url.searchParams.get("href"));
	if (!media || !mediaKey) return emdashImage(ctx);
	const original = await media.head(mediaKey).catch(() => null);
	const key = original ? sizeKey(mediaKey, original.etag, url.searchParams) : null;
	if (!key) return emdashImage(ctx);

	const kept = await media.get(key).catch(() => null);
	if (kept) return keptPicture(kept);

	const made = await emdashImage(ctx);
	const type = made.headers.get("Content-Type") ?? "";
	if (made.status !== 200 || !type.startsWith("image/") || !made.body) return made;
	const bytes = await made.arrayBuffer();
	await media.put(key, bytes, { httpMetadata: { contentType: type } }).catch((e) => console.error("[blog] keep picture size", e));
	return new Response(bytes, { status: 200, headers: made.headers });
};
