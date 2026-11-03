// Move from Ghost (25 Oct 2026): turns a Ghost content export into a WordPress export file (WXR), so the blog
// engine's own WordPress import does the saving: posts, pages, tags, authors, pictures and their new addresses.
// It runs in the writer's browser on the /move-from-ghost page (src/pages/move-from-ghost.astro); nothing here reaches us.
//
// Based on an earlier Ghost importer: the same field mapping, the
// __GHOST_URL__ fix, Portal sign-up buttons, internal (#) tags and Ghost's picture sizes sent to the original.
// Each Ghost card becomes the matching editor block, written as WordPress block markup that the engine's converter
// reads (packages/gutenberg-to-portable-text). Anything it doesn't know stays an HTML block, so nothing is lost,
// with any <script> taken out so old code can't run by surprise.
//
// No imports, so the tests can load it with Node. The card conversion needs a DOMParser, which the page passes in.

export interface GhostPost {
	id: string;
	type: "post" | "page";
	title: string;
	slug: string;
	html: string;
	status: "publish" | "draft" | "future";
	date: string;
	updated: string;
	excerpt: string;
	featureImage: string;
	featured: boolean;
	visibility: string;
	emailOnly: boolean;
	authors: string[];
	tags: string[];
	seo: { title?: string; description?: string; image?: string; canonical?: string };
	codeInjection: boolean;
}

export interface GhostTag {
	slug: string;
	name: string;
	description: string;
}

export interface GhostAuthor {
	slug: string;
	name: string;
	email: string;
}

export interface GhostSite {
	version: string;
	title: string;
	posts: GhostPost[];
	tags: GhostTag[];
	authors: GhostAuthor[];
	/** Things that can't come across, in plain words, one line each. */
	notes: string[];
}

export interface Redirect {
	from: string;
	to: string;
	permanent: boolean;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const rows = (data: Row, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const were = (n: number) => (n === 1 ? "was" : "were");

/** Ghost dates are "2024-05-01 09:30:00" (UTC) in older exports and ISO in newer ones. */
export function ghostDate(v: unknown): string {
	const s = str(v);
	if (!s) return "";
	const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** The site address as typed ("myblog.com", "https://www.myblog.com/"), as an origin, or "". */
export function siteOrigin(typed: string): string {
	const t = typed.trim();
	if (!t) return "";
	try {
		const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
		return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
	} catch {
		return "";
	}
}

/**
 * Ghost's links to itself, made into full addresses on the old site so pictures can be fetched from it:
 * __GHOST_URL__ becomes the site, Ghost's resized copies (/content/images/size/w600/...) point at the original.
 */
export function fixLinks(text: string, origin: string): string {
	if (!text) return text;
	return text
		.replaceAll("__GHOST_URL__", origin)
		.replace(/\/content\/images\/size\/[^/"'\s)]+\/(?:format\/[^/"'\s)]+\/)?/g, "/content/images/");
}

/** Reads a Ghost content export (Ghost 3 to 6). Throws a plain-words error when it isn't one. */
export function readGhostExport(json: unknown, origin: string): GhostSite {
	const root = json as Row;
	const db = Array.isArray(root?.db) ? (root.db as Row[])[0] : root;
	const data = (db?.data ?? null) as Row | null;
	if (!data || !Array.isArray(data.posts)) throw new Error("This doesn't look like a Ghost content export. In Ghost, go to Settings, then Import/Export, and press Export content.");
	const meta = (db?.meta ?? {}) as Row;

	const metaBy = new Map(rows(data, "posts_meta").map((m) => [str(m.post_id), m]));
	const tagsBy = new Map(rows(data, "tags").map((t) => [str(t.id), t]));
	const usersBy = new Map(rows(data, "users").map((u) => [str(u.id), u]));
	const tagLinks = rows(data, "posts_tags").sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
	const authorLinks = rows(data, "posts_authors").sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
	const internal = (t: Row | undefined) => !t || t.visibility === "internal" || str(t.name).startsWith("#");

	const notes: string[] = [];
	let noBody = 0, injected = 0, members = 0, emailOnly = 0;
	const posts: GhostPost[] = [];
	for (const p of rows(data, "posts")) {
		const id = str(p.id);
		const m = metaBy.get(id) ?? p; // Ghost 3 kept these on the post itself
		const type = p.type === "page" || p.page === true || p.page === 1 ? "page" : "post";
		const html = str(p.html);
		if (!html && (p.mobiledoc || p.lexical)) noBody++;
		const status = p.status === "published" ? "publish" : p.status === "scheduled" ? "future" : "draft";
		const visibility = str(p.visibility) || "public";
		if (visibility !== "public") members++;
		const isEmailOnly = !!m.email_only;
		if (isEmailOnly) emailOnly++;
		const hasInjection = !!(str(p.codeinjection_head).trim() || str(p.codeinjection_foot).trim());
		if (hasInjection) injected++;
		const authorIds = authorLinks.filter((a) => str(a.post_id) === id).map((a) => str(a.author_id));
		if (authorIds.length === 0 && p.author_id) authorIds.push(str(p.author_id));
		posts.push({
			id,
			type,
			title: str(p.title) || "Untitled",
			slug: str(p.slug),
			html: fixLinks(html, origin),
			status: isEmailOnly ? "draft" : status,
			date: ghostDate(p.published_at) || ghostDate(p.created_at),
			updated: ghostDate(p.updated_at),
			excerpt: str(p.custom_excerpt),
			featureImage: fixLinks(str(p.feature_image), origin),
			featured: p.featured === true || p.featured === 1,
			visibility,
			emailOnly: isEmailOnly,
			authors: authorIds.map((a) => str(usersBy.get(a)?.slug)).filter(Boolean),
			tags: tagLinks.filter((t) => str(t.post_id) === id).map((t) => tagsBy.get(str(t.tag_id))).filter((t) => !internal(t)).map((t) => str(t!.slug)),
			seo: {
				title: str(m.meta_title) || str(m.og_title) || undefined,
				description: str(m.meta_description) || str(m.og_description) || undefined,
				image: fixLinks(str(m.og_image) || str(m.twitter_image), origin) || undefined,
				canonical: str(p.canonical_url) || undefined,
			},
			codeInjection: hasInjection,
		});
	}
	if (noBody) notes.push(`${plural(noBody, "post")} had no readable text in the export and will arrive empty. Exporting again from a newer Ghost usually fixes this.`);
	if (members) notes.push(`${plural(members, "post")} ${were(members)} for members or paying members. They come across open to everyone until members are switched on for your blog.`);
	if (emailOnly) notes.push(`${plural(emailOnly, "post")} ${were(emailOnly)} sent by email only. They come across as drafts, so they don't appear on your blog.`);
	if (injected) notes.push(`${plural(injected, "post")} had code added in Ghost's code injection. It isn't brought across, so old scripts can't run by surprise. Add anything you still need again by hand.`);
	notes.push("Ghost themes, newsletter open and click stats and comments from Ghost(Pro) can't come across.");

	const tags = rows(data, "tags").filter((t) => !internal(t)).map((t) => ({ slug: str(t.slug), name: str(t.name), description: str(t.description) }));
	const used = new Set(posts.flatMap((p) => p.authors));
	const authors = rows(data, "users").filter((u) => used.has(str(u.slug))).map((u) => ({ slug: str(u.slug), name: str(u.name) || str(u.slug), email: str(u.email) }));
	const settings = rows(data, "settings");
	const title = str(settings.find((s) => s.key === "title")?.value);
	return { version: str(meta.version), title, posts, tags, authors, notes };
}

/** Every picture and file a post uses (feature image, social image, and in the body), on the old site only. */
export function filesUsed(site: GhostSite, origin: string): string[] {
	const found = new Set<string>();
	const add = (u: string | undefined) => {
		if (!u) return;
		try {
			const url = new URL(u, origin);
			if (url.origin === origin && /^\/content\/(images|media|files)\//.test(url.pathname)) found.add(url.origin + url.pathname);
		} catch {
			// Not an address.
		}
	};
	for (const p of site.posts) {
		add(p.featureImage);
		add(p.seo.image);
		for (const m of p.html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)) add(m[1]);
		for (const m of p.html.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1]!.split(",")) add(part.trim().split(/\s+/)[0]);
	}
	return [...found];
}

// --- Ghost cards to editor blocks ---------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const block = (name: string, inner: string, attrs?: Record<string, unknown>) =>
	`<!-- wp:${name}${attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : ""} -->\n${inner}\n<!-- /wp:${name} -->`;

/** Embedded players, back to the address the engine's embed block understands. */
export function embedUrl(src: string): string {
	try {
		const u = new URL(src, "https://example.com");
		const yt = /(?:youtube(?:-nocookie)?\.com\/embed\/)([\w-]{6,})/.exec(u.href);
		if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
		const vimeo = /player\.vimeo\.com\/video\/(\d+)/.exec(u.href);
		if (vimeo) return `https://vimeo.com/${vimeo[1]}`;
		const spotify = /open\.spotify\.com\/embed\/(.+)$/.exec(u.origin + u.pathname);
		if (spotify) return `https://open.spotify.com/${spotify[1]}`;
		return u.href;
	} catch {
		return src;
	}
}

function imageBlock(img: Element, caption: string, link?: string): string {
	const src = img.getAttribute("src") ?? "";
	const alt = img.getAttribute("alt") ?? "";
	const pic = `<img src="${esc(src)}" alt="${esc(alt)}"/>`;
	const inner = `<figure class="wp-block-image">${link ? `<a href="${esc(link)}">${pic}</a>` : pic}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
	return block("image", inner, { url: src, alt });
}

/** Raw HTML kept as an HTML block, with any script removed. Says so in `stripped`. */
function htmlBlock(html: string, stripped: { scripts: number }): string {
	const clean = html.replace(/<script\b[\s\S]*?<\/script>/gi, () => {
		stripped.scripts++;
		return "";
	});
	return clean.trim() ? block("html", clean.trim()) : "";
}

function cardToBlocks(el: Element, stripped: { scripts: number }): string[] {
	const tag = el.tagName.toLowerCase();
	const cls = el.getAttribute("class") ?? "";
	const html = el.outerHTML;

	if (/^h[1-6]$/.test(tag)) return [block("heading", `<${tag}>${el.innerHTML}</${tag}>`, { level: Number(tag[1]) })];
	if (tag === "p") return el.textContent?.trim() || el.querySelector("img") ? [block("paragraph", `<p>${el.innerHTML}</p>`)] : [];
	if (tag === "ul" || tag === "ol") {
		const items = [...el.children].filter((c) => c.tagName.toLowerCase() === "li").map((li) => block("list-item", `<li>${li.innerHTML}</li>`)).join("\n");
		return [block("list", `<${tag}>${items}</${tag}>`, tag === "ol" ? { ordered: true } : undefined)];
	}
	if (tag === "blockquote") return [block("quote", `<blockquote class="wp-block-quote"><p>${el.innerHTML}</p></blockquote>`)];
	if (tag === "pre") return [block("code", `<pre class="wp-block-code"><code>${el.querySelector("code")?.innerHTML ?? el.innerHTML}</code></pre>`)];
	if (tag === "hr" || cls.includes("kg-divider-card")) return [block("separator", '<hr class="wp-block-separator"/>')];
	if (tag === "table") return [block("table", `<figure class="wp-block-table">${html}</figure>`)];

	if (tag === "figure" && cls.includes("kg-gallery-card")) {
		const caption = el.querySelector("figcaption")?.innerHTML ?? "";
		const imgs = [...el.querySelectorAll("img")];
		return imgs.map((img, i) => imageBlock(img, i === imgs.length - 1 ? caption : ""));
	}
	if (tag === "figure" && el.querySelector("img") && !el.querySelector("iframe, video")) {
		const img = el.querySelector("img")!;
		const a = img.closest("a");
		return [imageBlock(img, el.querySelector("figcaption")?.innerHTML ?? "", a?.getAttribute("href") ?? undefined)];
	}
	if (cls.includes("kg-embed-card") || (tag === "figure" && el.querySelector("iframe"))) {
		const frame = el.querySelector("iframe");
		const tweet = el.querySelector("blockquote.twitter-tweet a[href*='/status/']");
		const url = frame ? embedUrl(frame.getAttribute("src") ?? "") : tweet ? tweet.getAttribute("href") ?? "" : "";
		if (url && /^https:\/\//.test(url)) return [block("embed", `<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">\n${esc(url)}\n</div></figure>`, { url })];
		return [htmlBlock(html, stripped)];
	}
	if (cls.includes("kg-button-card")) {
		const a = el.querySelector("a");
		if (a) return [block("paragraph", `<p><a href="${esc(a.getAttribute("href") ?? "")}">${a.textContent?.trim() ?? ""}</a></p>`)];
	}
	if (cls.includes("kg-bookmark-card")) {
		const a = el.querySelector("a.kg-bookmark-container, a");
		const title = el.querySelector(".kg-bookmark-title")?.textContent?.trim() || a?.getAttribute("href") || "";
		const about = el.querySelector(".kg-bookmark-description")?.textContent?.trim();
		if (a) return [block("paragraph", `<p><a href="${esc(a.getAttribute("href") ?? "")}">${esc(title)}</a>${about ? `<br>${esc(about)}` : ""}</p>`)];
	}
	if (cls.includes("kg-callout-card")) {
		const emoji = el.querySelector(".kg-callout-emoji")?.textContent?.trim();
		const text = el.querySelector(".kg-callout-text")?.innerHTML ?? el.innerHTML;
		return [block("quote", `<blockquote class="wp-block-quote"><p>${emoji ? `${emoji} ` : ""}${text}</p></blockquote>`)];
	}
	if (cls.includes("kg-toggle-card")) {
		const heading = el.querySelector(".kg-toggle-heading-text")?.innerHTML ?? "";
		const body = el.querySelector(".kg-toggle-content")?.innerHTML ?? "";
		return [block("heading", `<h3>${heading}</h3>`, { level: 3 }), block("paragraph", `<p>${body.replace(/<\/?p>/g, " ").trim()}</p>`)];
	}
	if (cls.includes("kg-header-card")) {
		const h = el.querySelector("h2, h3, .kg-header-card-header, .kg-header-card-heading")?.textContent?.trim();
		const sub = el.querySelector(".kg-header-card-subheader, .kg-header-card-subheading")?.textContent?.trim();
		return [h ? block("heading", `<h2>${esc(h)}</h2>`, { level: 2 }) : "", sub ? block("paragraph", `<p>${esc(sub)}</p>`) : ""].filter(Boolean);
	}
	if (cls.includes("kg-file-card")) {
		const a = el.querySelector("a");
		const name = el.querySelector(".kg-file-card-title")?.textContent?.trim() || "Download";
		if (a) return [block("file", `<div class="wp-block-file"><a href="${esc(a.getAttribute("href") ?? "")}">${esc(name)}</a></div>`, { href: a.getAttribute("href") })];
	}
	if (cls.includes("kg-video-card")) {
		const v = el.querySelector("video");
		if (v?.getAttribute("src")) return [block("video", `<figure class="wp-block-video"><video controls src="${esc(v.getAttribute("src")!)}"></video></figure>`)];
	}
	if (cls.includes("kg-audio-card")) {
		const a = el.querySelector("audio");
		if (a?.getAttribute("src")) return [block("audio", `<figure class="wp-block-audio"><audio controls src="${esc(a.getAttribute("src")!)}"></audio></figure>`)];
	}
	// Ghost's signup and product cards, and anything else: kept as HTML.
	return [htmlBlock(html, stripped)];
}

/** A post's Ghost HTML as editor blocks. `parse` is a DOMParser. */
export function ghostHtmlToBlocks(html: string, parse: { parseFromString(s: string, t: "text/html"): Document }): { content: string; scripts: number } {
	// Ghost's "Sign up" buttons open its Portal pop-up (#/portal/...). Ours go to the sign-up form.
	const portal = html.replace(/href="#\/portal\/[^"]*"/g, 'href="#subscribe"').replace(/\sdata-portal(="[^"]*")?/g, "");
	const doc = parse.parseFromString(`<body>${portal}</body>`, "text/html");
	const stripped = { scripts: 0 };
	const out: string[] = [];
	for (const node of [...doc.body.childNodes]) {
		if (node.nodeType === 8) continue; // <!--kg-card-begin: html--> markers
		if (node.nodeType === 3) {
			const text = node.textContent?.trim();
			if (text) out.push(block("paragraph", `<p>${esc(text)}</p>`));
			continue;
		}
		if (node.nodeType === 1) out.push(...cardToBlocks(node as Element, stripped));
	}
	return { content: out.filter(Boolean).join("\n\n"), scripts: stripped.scripts };
}

// --- The WordPress export file ------------------------------------------------------------------------------------

const cdata = (s: string) => `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
const wpDate = (iso: string) => (iso ? iso.slice(0, 19).replace("T", " ") : "");
const rfc = (iso: string) => (iso ? new Date(iso).toUTCString().replace("GMT", "+0000") : "");
const fileName = (url: string) => decodeURIComponent(url.split("/").pop() ?? "file");

/**
 * The WXR file the engine's WordPress import reads. `bodies` holds each post's editor blocks by Ghost id (from
 * ghostHtmlToBlocks); `files` the pictures and files to bring (filesUsed), which become attachments.
 */
export function toWxr(site: GhostSite, origin: string, bodies: Map<string, string>, files: string[]): string {
	let next = 1;
	const fileIds = new Map(files.map((f) => [f, next++]));
	const items: string[] = [];
	for (const f of files) {
		const id = fileIds.get(f)!;
		items.push(`<item><title>${cdata(fileName(f))}</title><wp:post_id>${id}</wp:post_id><wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:post_name>${cdata(`ghost-file-${id}`)}</wp:post_name><wp:attachment_url>${cdata(f)}</wp:attachment_url></item>`);
	}
	for (const p of site.posts) {
		const thumb = p.featureImage ? fileIds.get(p.featureImage.split("?")[0]!) : undefined;
		const cats = p.tags.map((slug) => {
			const t = site.tags.find((x) => x.slug === slug);
			return `<category domain="post_tag" nicename="${esc(slug)}">${cdata(t?.name ?? slug)}</category>`;
		});
		items.push(
			[
				"<item>",
				`<title>${cdata(p.title)}</title>`,
				`<link>${esc(`${origin}/${p.slug}/`)}</link>`,
				p.date ? `<pubDate>${rfc(p.date)}</pubDate>` : "",
				`<dc:creator>${cdata(p.authors[0] ?? "")}</dc:creator>`,
				`<guid isPermaLink="false">ghost-${esc(p.id)}</guid>`,
				`<content:encoded>${cdata(bodies.get(p.id) ?? "")}</content:encoded>`,
				`<excerpt:encoded>${cdata(p.excerpt)}</excerpt:encoded>`,
				`<wp:post_id>${next++}</wp:post_id>`,
				`<wp:post_date>${wpDate(p.date)}</wp:post_date>`,
				`<wp:post_date_gmt>${wpDate(p.date)}</wp:post_date_gmt>`,
				`<wp:post_modified_gmt>${wpDate(p.updated)}</wp:post_modified_gmt>`,
				`<wp:status>${p.status}</wp:status>`,
				`<wp:post_type>${p.type}</wp:post_type>`,
				`<wp:post_name>${cdata(p.slug)}</wp:post_name>`,
				`<wp:is_sticky>${p.featured ? 1 : 0}</wp:is_sticky>`,
				...cats,
				thumb ? `<wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>${thumb}</wp:meta_value></wp:postmeta>` : "",
				"</item>",
			].join(""),
		);
	}
	const authors = site.authors.map(
		(a, i) => `<wp:author><wp:author_id>${i + 1}</wp:author_id><wp:author_login>${cdata(a.slug)}</wp:author_login><wp:author_email>${cdata(a.email)}</wp:author_email><wp:author_display_name>${cdata(a.name)}</wp:author_display_name></wp:author>`,
	);
	const tags = site.tags.map((t, i) => `<wp:tag><wp:term_id>${i + 1}</wp:term_id><wp:tag_slug>${cdata(t.slug)}</wp:tag_slug><wp:tag_name>${cdata(t.name)}</wp:tag_name><wp:tag_description>${cdata(t.description)}</wp:tag_description></wp:tag>`);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">',
		"<channel>",
		`<title>${cdata(site.title || "Ghost blog")}</title>`,
		`<link>${esc(origin)}</link>`,
		"<wp:wxr_version>1.2</wp:wxr_version>",
		`<wp:base_site_url>${esc(origin)}</wp:base_site_url>`,
		`<wp:base_blog_url>${esc(origin)}</wp:base_blog_url>`,
		...authors,
		...tags,
		...items,
		"</channel>",
		"</rss>",
	].join("\n");
}

// --- Redirects ----------------------------------------------------------------------------------------------------

/** "^/old-post/?$" -> "/old-post/", or null when it's a real pattern that a plain redirect can't match. */
function plainPath(from: string): string | null {
	const p = from.replace(/^\^/, "").replace(/\/\?\$?$/, "/").replace(/\$$/, "");
	if (!p.startsWith("/") || /[()[\]*+?|\\{}^$]/.test(p)) return null;
	return p;
}

/**
 * Ghost's redirects file: redirects.json ([{from, to, permanent}]) or redirects.yaml (301:/302: lists of
 * "from: to"). Pattern redirects can't be matched one to one and are left out (counted in `skipped`).
 */
export function readRedirects(text: string, origin: string): { redirects: Redirect[]; skipped: number } {
	const out: Redirect[] = [];
	let skipped = 0;
	const add = (from: string, to: string, permanent: boolean) => {
		const path = plainPath(from.trim());
		let dest = to.trim();
		if (origin && dest.startsWith(origin)) dest = dest.slice(origin.length) || "/";
		if (!path || !dest || (!dest.startsWith("/") && !/^https?:\/\//.test(dest)) || /\$\d/.test(dest)) {
			skipped++;
			return;
		}
		out.push({ from: path, to: dest, permanent });
	};
	const t = text.trim();
	if (t.startsWith("[")) {
		for (const r of JSON.parse(t) as Row[]) add(str(r.from), str(r.to), r.permanent !== false);
		return { redirects: out, skipped };
	}
	let permanent = true;
	for (const raw of t.split(/\r?\n/)) {
		const line = raw.replace(/\s+#.*$/, "");
		if (!line.trim()) continue;
		const head = /^(30[12]):\s*$/.exec(line);
		if (head) {
			permanent = head[1] === "301";
			continue;
		}
		const pair = /^\s+(["']?)(.+?)\1:\s+(["']?)(.+?)\3\s*$/.exec(line);
		if (pair) add(pair[2]!, pair[4]!, permanent);
	}
	return { redirects: out, skipped };
}

/** One line for the preview: "212 posts, 9 pages, 31 tags, 3 authors, 1,400 pictures and files". */
export function summary(site: GhostSite, files: number, redirects: number): string {
	const posts = site.posts.filter((p) => p.type === "post").length;
	const pages = site.posts.length - posts;
	const parts = [plural(posts, "post"), plural(pages, "page"), plural(site.tags.length, "tag"), plural(site.authors.length, "author"), plural(files, "picture or file", "pictures and files")];
	if (redirects) parts.push(plural(redirects, "redirect"));
	return parts.join(", ");
}
