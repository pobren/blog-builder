// The writer's own look on top of their theme (26 Oct 2026): their colour, a pair of fonts, light or dark, and a
// reading bar on posts. Chosen in the Blog Builder plugin's settings, and drawn by src/layouts/Base.astro as a few CSS variables.
//
// The Design tab's live preview opens the blog with ?bb-preview=1 and the unsaved choices in the address
// (bb-accent, bb-font, bb-scheme, bb-bar). Only well-formed values count, and they only change the page for
// whoever opened that address. No imports, so tests can load it with `node --experimental-strip-types`.

export type FontPair = "theme" | "modern" | "classic" | "bookish";
export type Scheme = "auto" | "light" | "dark";

export interface Design {
	/** "#ea580c", or "" for the theme's own colour. */
	accent: string;
	font: FontPair;
	scheme: Scheme;
	/** A thin bar at the top of a post that fills as you read. */
	bar: boolean;
}

export const DEFAULT_DESIGN: Design = { accent: "", font: "theme", scheme: "auto", bar: false };

const FONTS: FontPair[] = ["theme", "modern", "classic", "bookish"];
const SCHEMES: Scheme[] = ["auto", "light", "dark"];

export const isAccent = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const fontOf = (v: unknown): FontPair | undefined => (FONTS.includes(v as FontPair) ? (v as FontPair) : undefined);
const schemeOf = (v: unknown): Scheme | undefined => (SCHEMES.includes(v as Scheme) ? (v as Scheme) : undefined);

/** The saved design, from the Blog Builder plugin's settings (whatever's missing or odd falls back to the default). */
export function designFrom(saved: { accent?: unknown; fontPair?: unknown; scheme?: unknown; readingBar?: unknown }): Design {
	return {
		accent: isAccent(saved.accent) ? saved.accent.toLowerCase() : "",
		font: fontOf(saved.fontPair) ?? "theme",
		scheme: schemeOf(saved.scheme) ?? "auto",
		bar: saved.readingBar === true,
	};
}

/** The Design tab's unsaved choices from a preview address, laid over the saved design. */
export function withPreview(d: Design, params: URLSearchParams): Design {
	if (params.get("bb-preview") !== "1") return d;
	const accent = params.get("bb-accent");
	const bar = params.get("bb-bar");
	return {
		accent: accent === "" ? "" : isAccent(accent) ? accent.toLowerCase() : d.accent,
		font: fontOf(params.get("bb-font")) ?? d.font,
		scheme: schemeOf(params.get("bb-scheme")) ?? d.scheme,
		bar: bar === "1" ? true : bar === "0" ? false : d.bar,
	};
}

/** Black or white text, whichever reads better on the colour. */
export function inkOn(hex: string): string {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	// Contrast with white against contrast with near-black.
	return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0539) ? "#ffffff" : "#0a0a0a";
}

/** The web fonts a design needs on top of the theme's own: "serif" and/or "display". */
export function fontsFor(d: Design): ("serif" | "display")[] {
	return d.font === "modern" ? ["display"] : d.font === "classic" || d.font === "bookish" ? ["serif"] : [];
}

/** The CSS that puts the design on the page, or "" when it's all the theme's own. */
export function designCss(d: Design): string {
	const out: string[] = [];
	if (d.accent) {
		// In dark mode a lighter mix of the colour, so it still stands out on a dark page.
		const dark = `color-mix(in srgb, ${d.accent} 72%, white)`;
		out.push(
			`--color-brand:${d.accent};`,
			`--color-brand-hover:color-mix(in srgb, ${d.accent} 82%, black);`,
			`--color-on-brand:${inkOn(d.accent)};`,
			`--color-brand-ring:color-mix(in srgb, ${d.accent} 18%, transparent);`,
		);
		const vars = out.join("");
		out.length = 0;
		out.push(`:root:root{${vars}}`);
		out.push(`@supports (color: light-dark(#000, #fff)){:root:root{--color-brand:light-dark(${d.accent}, ${dark});--color-brand-hover:light-dark(color-mix(in srgb, ${d.accent} 82%, black), ${d.accent});--color-on-brand:light-dark(${inkOn(d.accent)}, #0a0a0a);}}`);
	}
	if (d.font === "modern") out.push(`:root:root{--font-heading:var(--font-display), system-ui, sans-serif;}`);
	if (d.font === "classic") out.push(`:root:root{--font-heading:var(--font-serif), Georgia, serif;}`);
	if (d.font === "bookish") out.push(`:root:root{--font-heading:var(--font-serif), Georgia, serif;}[data-post-content]{font-family:var(--font-serif);}`);
	if (d.bar) out.push(`.bb-readbar{position:fixed;inset:0 0 auto;height:3px;z-index:80;background:var(--color-brand);transform-origin:0 50%;transform:scaleX(0);pointer-events:none}`);
	return out.join("\n");
}
