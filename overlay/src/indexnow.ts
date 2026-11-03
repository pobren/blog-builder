// IndexNow (24 Oct 2026): when a post or page is published, tell Bing, Yandex, Seznam, Naver and the other
// IndexNow search engines straight away, instead of waiting for them to crawl. The key is made from settings
// only this blog has, and served at /indexnow-key.txt (src/pages/indexnow-key.txt.ts) so the engines can check it.
import { env } from "cloudflare:workers";

export const KEY_PATH = "/indexnow-key.txt";
export const ENDPOINT = "https://api.indexnow.org/indexnow";

export async function indexNowKey(): Promise<string> {
	const vars = env as { EMDASH_SITE_URL?: string; SETUP_TOKEN?: string };
	const seed = `indexnow:${vars.EMDASH_SITE_URL ?? ""}:${vars.SETUP_TOKEN ?? "blog"}`;
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
	return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The public address of a published post or page, or null for anything else. */
export function publishedUrl(site: string, collection: string, content: Record<string, unknown>): string | null {
	const slug = typeof content.slug === "string" ? content.slug : "";
	if (!slug || (collection !== "posts" && collection !== "pages")) return null;
	return `${site.replace(/\/$/, "")}/${collection}/${encodeURIComponent(slug)}`;
}
