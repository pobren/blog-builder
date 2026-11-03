/**
 * Blog Builder's own plugin for EmDash
 *
 * Adds a "Blog Builder" admin page and dashboard widget with help, updates
 * and the blog's theme, and the settings Blog Builder adds: the theme, the
 * "Made with Blog Builder" link in the footer (src/layouts/Base.astro reads
 * it with getPluginSetting("builder", "showPoweredBy")), sending old WordPress
 * addresses to their new pages (src/old-addresses.ts) and click-to-load
 * embeds (src/embeds.ts), both read in src/middleware.ts.
 *
 * The page and widget use Block Kit, so the plugin ships no React and needs
 * no dependencies beyond emdash itself.
 */

import { env } from "cloudflare:workers";
import { definePlugin } from "emdash";
import { currentTheme } from "../theme";
import { BLOG_THEMES } from "../themes-list";
import { ENDPOINT, KEY_PATH, indexNowKey, publishedUrl } from "../indexnow";

const PAGE = "/builder";
const WIDGET = "builder";
export const REPO_URL = "https://github.com/pobren/blog-builder";
/** The newest release, read from the repository (release.json at the top of main). */
const LATEST_URL = "https://raw.githubusercontent.com/pobren/blog-builder/main/release.json";

const LINKS = [
	{ icon: "help", label: "Help", about: "How to install, update and use Blog Builder.", url: `${REPO_URL}#readme` },
	{ icon: "updates", label: "What's new", about: "Every release and what changed.", url: `${REPO_URL}/releases` },
	{ icon: "support", label: "Questions", about: "Ask in Discussions, or report a bug in Issues.", url: `${REPO_URL}/discussions` },
];

const running = () => (env as { APP_VERSION?: string }).APP_VERSION ?? "";

/** Whether a newer release than this blog's is out. Quietly says no if GitHub can't be reached. */
async function newerRelease(fetcher: ((url: string) => Promise<Response>) | undefined): Promise<string | null> {
	const have = running();
	if (!fetcher || !have) return null;
	try {
		const res = await fetcher(LATEST_URL);
		if (!res.ok) return null;
		const latest = String(((await res.json()) as { version?: unknown }).version ?? "");
		const n = (v: string) => v.split(".").map((x) => Number.parseInt(x, 10) || 0);
		const [a, b] = [n(latest), n(have)];
		for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? latest : null;
		return null;
	} catch {
		return null;
	}
}

// Move from Ghost (src/pages/move-from-ghost.astro): brings a whole Ghost site across from its export file.
function moveBlocks(origin: string) {
	return [
		{ type: "section", text: "Moving from Ghost? Bring your posts, pages, tags, pictures and old links across in one go." },
		{ type: "actions", elements: [{ type: "link", label: "Move from Ghost", target: { kind: "external", url: `${origin}/move-from-ghost` } }] },
	];
}

// Block Kit links can't carry icons, so each link sits in its own column
// under a small icon image from public/builder/icons/.
async function renderPage(page: string, origin: string, newer: string | null) {
	const full = page === PAGE;
	const { theme } = await currentTheme();
	const version = running();
	return {
		blocks: [
			...(full ? [{ type: "header", text: "Blog Builder" }] : []),
			{ type: "section", text: `Your blog runs Blog Builder${version ? ` ${version}` : ""}, free and open source, on your own Cloudflare account.` },
			...(newer
				? [
						{ type: "banner", variant: "default", title: `Blog Builder ${newer} is out`, description: "Update with the same installer you used: your posts, pictures and settings are kept." },
						{ type: "actions", elements: [{ type: "link", label: "See what's new", target: { kind: "external", url: `${REPO_URL}/releases` } }] },
					]
				: []),
			...(full
				? [
						{ type: "section", text: `Your theme is ${theme.name}. Pick another under Settings on this plugin (the Theme setting).` },
						{ type: "context", text: "Your blog is yours. Download everything in it any time, as one file that loads into any SQLite database or another Blog Builder install. Your subscribers come as a CSV file from the Newsletter page." },
						{ type: "actions", elements: [{ type: "link", label: "Download my blog", target: { kind: "external", url: `${origin}/export/blog.sql` } }] },
						...moveBlocks(origin),
					]
				: []),
			{
				type: "columns",
				columns: LINKS.map((link) => [
					{ type: "image", url: `/builder/icons/${link.icon}.svg`, alt: "" },
					...(full ? [{ type: "context", text: link.about }] : []),
					{ type: "actions", elements: [{ type: "link", label: link.label, target: { kind: "external", url: link.url } }] },
				]),
			},
		],
	};
}

/**
 * Create the plugin instance.
 * Called by the virtual module system at runtime.
 */
export function createPlugin() {
	return definePlugin({
		id: "builder",
		version: "0.1.0",
		// For IndexNow pings (src/indexnow.ts) and the new-release check on GitHub.
		capabilities: ["network:request", "content:read"],
		allowedHosts: ["api.indexnow.org", "raw.githubusercontent.com"],

		hooks: {
			"content:afterPublish": async (event, ctx) => {
				if ((await ctx.settings.get<boolean>("indexNow")) === false || !ctx.http) return;
				const site = ctx.site.url;
				const url = site ? publishedUrl(site, event.collection, event.content) : null;
				if (!url) return;
				const host = new URL(site).host;
				const key = await indexNowKey();
				await ctx.http
					.fetch(ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json; charset=utf-8" },
						body: JSON.stringify({ host, key, keyLocation: `${site.replace(/\/$/, "")}${KEY_PATH}`, urlList: [url] }),
					})
					.catch((e) => ctx.log.warn(`IndexNow ping failed: ${String(e)}`));
			},
		},

		routes: {
			// Block Kit interactions for the page and the dashboard widget.
			admin: {
				permission: "plugins:read",
				handler: async (ctx) => {
					const input = ctx.input as { page?: unknown } | null | undefined;
					const page = typeof input?.page === "string" ? input.page : PAGE;
					const origin = new URL(ctx.request.url).origin;
					const newer = await newerRelease(ctx.http ? (url) => ctx.http!.fetch(url) : undefined);
					return renderPage(page, origin, newer);
				},
			},
		},

		admin: {
			pages: [{ path: PAGE, label: "Blog Builder", icon: "lifebuoy" }],
			widgets: [{ id: WIDGET, title: "Blog Builder", size: "third" }],
			settingsSchema: {
				theme: {
					type: "select",
					label: "Theme",
					description: "Your blog's look. Your posts, pictures and settings stay as they are when you switch.",
					options: [{ value: "", label: "The one picked when installing" }, ...BLOG_THEMES.map((t) => ({ value: t.id, label: `${t.name}: ${t.for}` }))],
					default: "",
				},
				bannerText: {
					type: "string",
					label: "Promo banner across the top of every page",
					description: "Such as \"Spring sale: 20% off everything this week\". Leave empty for no banner. Readers can close it; it comes back for them when you change the words.",
				},
				bannerLink: {
					type: "string",
					label: "Promo banner link",
					description: "Where the banner's link goes: a page on your blog (like /pages/about) or a full https:// address. Leave empty for no link.",
				},
				bannerButton: {
					type: "string",
					label: "Promo banner link text",
					description: "Leave empty for \"Find out more\".",
				},
				// The writer's own look on top of the theme (src/design.ts).
				accent: {
					type: "string",
					label: "Your colour",
					description: "For buttons, links and highlights, such as #ea580c. Leave empty for the theme's own colour.",
					default: "",
				},
				fontPair: {
					type: "select",
					label: "Fonts",
					options: [
						{ value: "theme", label: "The theme's own" },
						{ value: "modern", label: "Modern: bold headings" },
						{ value: "classic", label: "Classic: serif headings" },
						{ value: "bookish", label: "Bookish: serif throughout" },
					],
					default: "theme",
				},
				scheme: {
					type: "select",
					label: "Light or dark",
					options: [
						{ value: "auto", label: "Follow each reader's device" },
						{ value: "light", label: "Always light" },
						{ value: "dark", label: "Always dark" },
					],
					default: "auto",
				},
				readingBar: {
					type: "boolean",
					label: "Show a reading bar at the top of posts",
					default: false,
				},
				showPoweredBy: {
					type: "boolean",
					label: "Show 'Made with Blog Builder' in the footer",
					default: true,
				},
				oldAddresses: {
					type: "boolean",
					label: "Send old WordPress and Ghost addresses to the new pages",
					description: "After a move from WordPress or Ghost, links to your old post addresses (such as /2024/05/my-post/ or /my-post/) go straight to the post here, so shared links and Google rankings keep working.",
					default: true,
				},
				// Shown on the home page by themes made for businesses (Practice, Local): src/components/BlogBusiness.astro.
				businessPhone: {
					type: "string",
					label: "Business phone number",
					description: "Business themes such as Practice and Local show your contact details on the home page. Leave these empty to hide them.",
					default: "",
				},
				businessEmail: {
					type: "string",
					label: "Business email address",
					default: "",
				},
				businessAddress: {
					type: "string",
					label: "Business address",
					multiline: true,
					default: "",
				},
				openingHours: {
					type: "string",
					label: "Opening hours",
					description: "One line per day or group of days, such as \"Monday to Friday: 9am to 5.30pm\".",
					multiline: true,
					default: "",
				},
				// The main button on some themes' home pages, such as SaaS: src/components/homes/.
				buttonText: {
					type: "string",
					label: "Main button text",
					description: "Some themes, such as SaaS, show a big button on the home page, such as \"Start your free trial\". Leave empty to hide it.",
					default: "",
				},
				buttonLink: {
					type: "string",
					label: "Main button link",
					description: "Where the button goes, such as https://app.example.com/signup.",
					default: "",
				},
				indexNow: {
					type: "boolean",
					label: "Tell search engines about new posts straight away (IndexNow)",
					description: "When you publish, Bing and other IndexNow search engines hear about it at once, so new posts show up in search sooner.",
					default: true,
				},
				clickToLoadEmbeds: {
					type: "boolean",
					label: "Load videos and maps only when a reader clicks",
					description: "YouTube and Vimeo videos, maps and other embeds wait for a click, so nothing from those sites loads when someone opens a page.",
					default: true,
				},
			},
		},
	});
}

export default createPlugin;
