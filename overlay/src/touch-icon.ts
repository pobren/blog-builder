// The blog's home screen icon (26 Oct 2026). iPhones ignore the SVG tab icon and draw a plain grey letter tile
// instead, so /apple-touch-icon.png (and the -precomposed name some iPhones ask for) is the same first letter and
// colour as the tab icon (favicon.ts), as a square 180 by 180 PNG with no see-through pixels. The drawing is in
// src/icon/.
import { getSiteSettings } from "emdash";
import { faviconRgb, touchIconLetter } from "./favicon";
import { letterIconPng } from "./icon/letter-icon";

export async function touchIconResponse(): Promise<Response> {
	const title = ((await getSiteSettings().catch(() => null)) as { title?: string } | null)?.title;
	const body = await letterIconPng(touchIconLetter(title), faviconRgb(title), [255, 255, 255], 180, "full");
	return new Response(body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}
