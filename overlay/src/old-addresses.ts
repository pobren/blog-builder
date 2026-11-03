// Old WordPress and Ghost addresses keep working (21 Oct 2026; Ghost's added 25 Oct).
//
// EmDash's WordPress import keeps each post's slug but not its old address, so
// a link to /2024/05/my-post/ would land on "not found" after the move. When a
// public page isn't found, src/middleware.ts asks here whether the address
// looks like a WordPress one, and if a post or page with that slug exists,
// sends the reader there with a permanent (301) redirect, which also tells
// Google where the post now lives.
//
// It only ever runs on a 404, so it never hides a real page, and redirects
// the owner adds under Redirects in the admin run before it.
import { decodeSlug, getEmDashEntry } from "emdash";

// The template's own routes. A miss under one of these is a real miss.
const OWN_ROUTES = new Set(["posts", "pages", "search", "_emdash", "_image", "_astro", "builder", "setup-link", "embed", "export", "favicon.svg", "move-from-ghost", "import-subscribers", "indexnow-key.txt"]);
// Trailing parts WordPress adds after a post's slug: /my-post/amp/, /my-post/embed/, /my-post/2/ (page 2).
const SUFFIX = /^(amp|embed|\d{1,3})$/;
const HTML = /\.html?$/i;
const FILE = /\.\w{1,10}$/;

/** Where an old WordPress address now lives, or null. */
export async function oldAddress(pathname: string): Promise<string | null> {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0 || parts.length > 6 || OWN_ROUTES.has(parts[0])) return null;

	// /feed/, /category/news/feed/, /my-post/feed/ (WordPress) and /rss/, /tag/news/rss/ (Ghost): the blog has one feed.
	if (parts.at(-1) === "feed" || parts.at(-1) === "rss" || (parts[0] === "comments" && parts[1] === "feed")) return "/rss.xml";
	// Ghost's author pages (/author/jo/): the blog has no author pages, so readers go to the home page.
	if (parts[0] === "author" && parts.length <= 3) return "/";
	// Old category and tag addresses already match (/category/news); nested ones don't.
	if (parts[0] === "category" || parts[0] === "tag") return null;

	if (parts.length > 1 && SUFFIX.test(parts.at(-1)!)) parts.pop();
	const last = parts.at(-1)!;
	// /my-post.html is a WordPress address; /logo.png is not.
	if (FILE.test(last) && !HTML.test(last)) return null;
	const slug = decodeSlug(last.replace(HTML, ""))?.toLowerCase();
	if (!slug) return null;

	for (const [collection, base] of [["posts", "/posts/"], ["pages", "/pages/"]] as const) {
		try {
			const { entry } = await getEmDashEntry(collection, slug);
			if (entry) return base + encodeURIComponent(entry.id);
		} catch {
			// A blog without that collection: try the next one.
		}
	}
	return null;
}
