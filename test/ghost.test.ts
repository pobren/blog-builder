// Move from Ghost (src/ghost.ts): run with `node --experimental-strip-types --test test/ghost.test.ts`.
// The card conversion needs a browser's DOMParser, so it is checked in a browser instead; these cover the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filesUsed, fixLinks, readGhostExport, readRedirects, siteOrigin, summary, toWxr } from "../overlay/src/ghost.ts";

const sample = JSON.parse(fs.readFileSync(new URL("./ghost-sample.json", import.meta.url), "utf8"));
const origin = "https://jo.ghost.io";

test("the site address is tidied to an origin", () => {
	assert.equal(siteOrigin("jo.ghost.io"), origin);
	assert.equal(siteOrigin(" https://www.myblog.com/blog/ "), "https://www.myblog.com");
	assert.equal(siteOrigin(""), "");
	assert.equal(siteOrigin("javascript:alert(1)"), "");
});

test("Ghost's own links point at the old site, and resized pictures at the original", () => {
	assert.equal(fixLinks('<a href="__GHOST_URL__/x/">', origin), '<a href="https://jo.ghost.io/x/">');
	assert.equal(fixLinks("__GHOST_URL__/content/images/size/w600/format/webp/2024/a.jpg", origin), "https://jo.ghost.io/content/images/2024/a.jpg");
});

test("an export is read: posts, pages, public tags, authors and search details", () => {
	const site = readGhostExport(sample, origin);
	assert.equal(site.version, "5.96.0");
	assert.equal(site.title, "Jo's Blog");
	const hello = site.posts.find((p) => p.slug === "hello")!;
	assert.equal(hello.type, "post");
	assert.equal(hello.status, "publish");
	assert.equal(hello.date, "2024-05-01T09:30:00.000Z");
	assert.deepEqual(hello.tags, ["news"], "internal (#) tags stay hidden");
	assert.deepEqual(hello.authors, ["jo"]);
	assert.equal(hello.seo.title, "SEO title");
	assert.equal(hello.seo.image, "https://jo.ghost.io/content/images/2024/05/og.jpg");
	assert.equal(site.posts.find((p) => p.slug === "about")!.type, "page");
	assert.equal(site.tags.length, 1);
	assert.ok(site.notes.some((n) => n.startsWith("1 post was for members")));
	assert.ok(site.notes.some((n) => n.includes("code injection")));
	assert.throws(() => readGhostExport({ hello: 1 }, origin), /Ghost content export/);
});

test("pictures and files come only from the old site", () => {
	const site = readGhostExport(sample, origin);
	site.posts[0]!.html += '<img src="https://elsewhere.com/content/images/x.jpg">';
	const files = filesUsed(site, origin);
	assert.equal(files.length, 5);
	assert.ok(files.every((f) => f.startsWith(`${origin}/content/images/`)));
	assert.equal(summary(site, files.length, 2), "2 posts, 1 page, 1 tag, 1 author, 5 pictures and files, 2 redirects");
});

test("the WordPress export file carries posts, attachments and the feature picture", () => {
	const site = readGhostExport(sample, origin);
	const files = filesUsed(site, origin);
	const xml = toWxr(site, origin, new Map([["p1", "<p>a ]]> b</p>"]]), files);
	assert.match(xml, /<wp:post_type>attachment<\/wp:post_type>/);
	assert.match(xml, /<wp:meta_key>_thumbnail_id<\/wp:meta_key><wp:meta_value>1<\/wp:meta_value>/);
	assert.match(xml, /<category domain="post_tag" nicename="news"><!\[CDATA\[News\]\]><\/category>/);
	assert.match(xml, /a \]\]\]\]><!\[CDATA\[> b/, "]]> inside a post can't end the CDATA early");
	assert.match(xml, /<wp:base_site_url>https:\/\/jo.ghost.io<\/wp:base_site_url>/);
});

test("redirects files: JSON and YAML, patterns left out", () => {
	const json = readRedirects('[{"from":"^/old/$","to":"/new/","permanent":true},{"from":"^/blog/(.*)","to":"/$1"},{"from":"/a","to":"https://jo.ghost.io/b/"}]', origin);
	assert.deepEqual(json.redirects, [{ from: "/old/", to: "/new/", permanent: true }, { from: "/a", to: "/b/", permanent: true }]);
	assert.equal(json.skipped, 1);
	const yaml = readRedirects("301:\n  /old-one/: /new-one/\n  '/two': 'https://example.com/'\n302:\n  /temp/: /later/\n", origin);
	assert.deepEqual(yaml.redirects, [
		{ from: "/old-one/", to: "/new-one/", permanent: true },
		{ from: "/two", to: "https://example.com/", permanent: true },
		{ from: "/temp/", to: "/later/", permanent: false },
	]);
});
