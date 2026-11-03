// The blog's default icon in the browser tab (26 Oct 2026), until the writer adds their own Site icon in Settings:
// the first letter of the blog's name on a rounded square, in one of a few colours picked by the name, so each
// blog looks its own. pages/favicon.svg.ts serves it; the blog (layouts/Base.astro) and its admin
// (patch-emdash.mjs) both use it. No imports, so the tests can load it with Node.

const COLOURS = ["#c2410c", "#b91c1c", "#7c3aed", "#1d4ed8", "#0f766e", "#15803d", "#be185d", "#334155"];

/** The letter on the icon: the first letter or number of the name, or "B" for a blog with no name yet. */
export function faviconLetter(title: string | undefined): string {
	const m = /[\p{L}\p{N}]/u.exec((title ?? "").replace(/^the\s+/i, ""));
	return m ? m[0].toLocaleUpperCase("en-GB") : "B";
}

/** The same colour every time for the same name. */
export function faviconColour(title: string | undefined): string {
	let h = 0;
	for (const ch of (title ?? "").trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
	return COLOURS[h % COLOURS.length];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function faviconSvg(title: string | undefined): string {
	const c = faviconColour(title);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".82"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><text x="32" y="44" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700" fill="#fff">${esc(faviconLetter(title))}</text></svg>`;
}

/** The letter for the home screen icon (touch-icon.ts), which can only draw A-Z and 0-9: "É" is "E", and a
 * name in another script gets the colour with no letter. */
export function touchIconLetter(title: string | undefined): string {
	return faviconLetter(title).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "").slice(0, 1);
}

/** The colour as red, green and blue. */
export function faviconRgb(title: string | undefined): [number, number, number] {
	const c = faviconColour(title);
	return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}
