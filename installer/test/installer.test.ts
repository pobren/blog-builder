// The installer's pure parts: run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BLOG_THEMES, DEFAULT_BLOG_THEME, themeStylesheet, themeToShow } from "../../overlay/src/themes-list.ts";
import { BLOG_SCRIPT, blogAssetManifest, blogHostname, blogMetadata, parseBlogChoice, setupLink, themeFromBindings } from "../deploy.ts";
import { blogConfigProblems, isBlogManifest, type BlogManifest } from "../release.ts";
import { UsageError, isNewer, parseArgs, subdomainOf } from "../core.ts";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

const manifest: BlogManifest = {
	schema: 1,
	product: "blog",
	version: "2.0.0",
	emdash: "abc",
	builtAt: "2026-11-03T00:00:00Z",
	worker: { mainModule: "entry.mjs", compatibilityDate: "2026-02-24", compatibilityFlags: ["nodejs_compat"], modules: ["entry.mjs"], crons: ["*/5 * * * *"] },
	headers: null,
	redirects: null,
	assets: [
		{ path: "/builder/themes/journal.css", hash: "a".repeat(32), size: 10, contentType: "text/css" },
		{ path: "/builder/themes/magazine.css", hash: "b".repeat(32), size: 10, contentType: "text/css" },
	],
};

test("every theme has its own id and a stylesheet in the overlay, except Notebook", () => {
	assert.equal(new Set(BLOG_THEMES.map((t) => t.id)).size, BLOG_THEMES.length);
	for (const t of BLOG_THEMES) {
		const sheet = themeStylesheet(t.id);
		if (t.id === DEFAULT_BLOG_THEME) assert.equal(sheet, null);
		else assert.ok(existsSync(new URL(`../../overlay/public${sheet}`, import.meta.url)), `${t.id} has no stylesheet`);
	}
});

test("every theme is free, and an unknown one shows as Notebook", () => {
	assert.equal(themeToShow("magazine").id, "magazine");
	assert.equal(themeToShow("nope").id, DEFAULT_BLOG_THEME);
	assert.equal(themeToShow(undefined).id, DEFAULT_BLOG_THEME);
});

test("every theme's stylesheet is uploaded, so the owner can switch in the admin", () => {
	assert.deepEqual(Object.keys(blogAssetManifest(manifest).manifest), ["/builder/themes/journal.css", "/builder/themes/magazine.css"]);
});

test("install choices: a domain, a trial, a theme and a place", () => {
	assert.deepEqual(parseBlogChoice({ accountId: ACCOUNT, domain: "Example.com", location: "weur" }), { accountId: ACCOUNT, domain: "example.com", subdomain: "blog", location: "weur" });
	assert.deepEqual(parseBlogChoice({ accountId: ACCOUNT, domain: "example.com", subdomain: "", theme: "journal", location: "enam" }), { accountId: ACCOUNT, domain: "example.com", subdomain: "", location: "enam", theme: "journal" });
	assert.deepEqual(parseBlogChoice({ accountId: ACCOUNT, domain: "" }), { accountId: ACCOUNT, domain: null, location: "weur" });
	assert.equal(parseBlogChoice({ accountId: ACCOUNT, domain: "example.com", theme: "nope" }), null);
	assert.equal(parseBlogChoice({ accountId: ACCOUNT, location: "mars" }), null);
	assert.equal(parseBlogChoice({ accountId: "short" }), null);
});

test("the blog's address", () => {
	assert.equal(blogHostname({ accountId: ACCOUNT, domain: "example.com", subdomain: "blog", location: "weur" }), "blog.example.com");
	assert.equal(blogHostname({ accountId: ACCOUNT, domain: "example.com", subdomain: "", location: "weur" }), "example.com");
	assert.equal(blogHostname({ accountId: ACCOUNT, domain: null, location: "weur" }, "pat"), `${BLOG_SCRIPT}.pat.workers.dev`);
});

test("the Worker gets its storage, version and starting theme, and keeps its secrets", () => {
	const m = blogMetadata(manifest, { databaseId: "db", sessionsId: "kv" }, { assetsJwt: "jwt", siteUrl: "https://blog.example.com", theme: "journal" });
	const bindings = m.bindings as { type: string; name: string; text?: string }[];
	assert.equal(bindings.find((b) => b.name === "APP_VERSION")?.text, "2.0.0");
	assert.equal(bindings.find((b) => b.name === "THEME")?.text, "journal");
	assert.equal(bindings.find((b) => b.name === "EMDASH_SITE_URL")?.text, "https://blog.example.com");
	assert.deepEqual(m.keep_bindings, ["secret_text"]);
	assert.equal(themeFromBindings(bindings), "journal");
	assert.equal(themeFromBindings([{ name: "THEME", type: "plain_text", text: "nope" }]), null);
});

test("the set-up link carries the one-time code", () => {
	assert.equal(setupLink("blog.example.com", "abc"), "https://blog.example.com/setup-link?setup=abc");
});

test("a build with other bindings is turned down", () => {
	const good = { main: "entry.mjs", compatibility_date: "2026-02-24", d1_databases: [{ binding: "DB" }], r2_buckets: [{ binding: "MEDIA" }], kv_namespaces: [{ binding: "SESSION" }], images: { binding: "IMAGES" }, assets: { binding: "ASSETS" } };
	assert.deepEqual(blogConfigProblems(good), []);
	assert.equal(blogConfigProblems({ ...good, r2_buckets: [] }).length, 1);
	assert.ok(isBlogManifest(manifest));
	assert.ok(!isBlogManifest({ ...manifest, version: "../x" }));
});

test("the command line", () => {
	assert.deepEqual(parseArgs(["setup", "--domain", "example.com", "--theme=journal", "-y"]), { command: "setup", yes: true, force: false, domain: "example.com", theme: "journal" });
	assert.equal(parseArgs(["setup", "--trial"]).domain, "");
	assert.equal(parseArgs(["update", "--force"]).force, true);
	assert.equal(parseArgs([]).command, "help");
	assert.throws(() => parseArgs(["setup", "--token", "x"]), UsageError);
	assert.throws(() => parseArgs(["launch"]), UsageError);
});

test("versions and addresses", () => {
	assert.ok(isNewer("2.0.1", "2.0.0"));
	assert.ok(!isNewer("2.0.0", "2.0.0"));
	assert.ok(isNewer("2.0.0", null));
	assert.equal(subdomainOf("blog.example.com", "example.com"), "blog");
	assert.equal(subdomainOf("example.com", "example.com"), null);
});
