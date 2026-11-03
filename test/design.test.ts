// The writer's own look (Design tab): run with `node --experimental-strip-types --test test/design.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DESIGN, designCss, designFrom, fontsFor, inkOn, withPreview } from "../overlay/src/design.ts";

test("saved settings: odd values fall back to the theme's own look", () => {
	assert.deepEqual(designFrom({}), DEFAULT_DESIGN);
	assert.deepEqual(designFrom({ accent: "red", fontPair: "comic", scheme: "dim", readingBar: "yes" }), DEFAULT_DESIGN);
	assert.deepEqual(designFrom({ accent: "#EA580C", fontPair: "classic", scheme: "dark", readingBar: true }), { accent: "#ea580c", font: "classic", scheme: "dark", bar: true });
});

test("the preview's address only counts with bb-preview=1, and only well-formed values", () => {
	const saved = designFrom({ accent: "#2563eb", fontPair: "modern" });
	assert.deepEqual(withPreview(saved, new URLSearchParams("bb-accent=%23dc2626")), saved);
	const p = withPreview(saved, new URLSearchParams("bb-preview=1&bb-accent=%23DC2626&bb-font=bookish&bb-scheme=light&bb-bar=1"));
	assert.deepEqual(p, { accent: "#dc2626", font: "bookish", scheme: "light", bar: true });
	// Empty accent means the theme's own; nonsense keeps the saved one.
	assert.equal(withPreview(saved, new URLSearchParams("bb-preview=1&bb-accent=")).accent, "");
	assert.equal(withPreview(saved, new URLSearchParams("bb-preview=1&bb-accent=%3Cscript%3E")).accent, "#2563eb");
});

test("text on the colour: white on dark colours, near-black on light ones", () => {
	assert.equal(inkOn("#171717"), "#ffffff");
	assert.equal(inkOn("#2563eb"), "#ffffff");
	assert.equal(inkOn("#facc15"), "#0a0a0a");
});

test("the CSS: nothing for the theme's own look, variables for a colour and fonts", () => {
	assert.equal(designCss(DEFAULT_DESIGN), "");
	const css = designCss({ accent: "#0d9488", font: "classic", scheme: "auto", bar: true });
	assert.match(css, /--color-brand:#0d9488/);
	assert.match(css, /--font-heading:var\(--font-serif\)/);
	assert.match(css, /\.bb-readbar/);
	assert.deepEqual(fontsFor({ ...DEFAULT_DESIGN, font: "modern" }), ["display"]);
	assert.deepEqual(fontsFor({ ...DEFAULT_DESIGN, font: "bookish" }), ["serif"]);
});
