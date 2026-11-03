// Blog Builder's set-up lock.
//
// Out of the box, whoever finishes EmDash's set-up wizard first becomes the
// blog's admin. The installer sets a one-time code in the SETUP_TOKEN secret
// and gives the owner a link to /setup-link?setup=<code>. Opening that link
// stores the code in a cookie (here) and sends them on to the admin
// (src/pages/setup-link.ts), and the set-up API refuses to change anything
// without it. The link has its own page because the admin page may be served
// as a plain file, which never reaches this code. Lax, not strict, so the
// cookie is still sent on the redirect after following the link from another
// site. Once set-up is done EmDash refuses further set-up anyway.
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getPluginSetting } from "emdash";
import { clickToLoad } from "./embeds";
import { oldAddress } from "./old-addresses";

const COOKIE = "blog_setup";
const SETUP_API = "/_emdash/api/setup";

function same(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

// EmDash names plugins declared in the config by their id ("builder") unless its
// plugin state row has a display name, which only marketplace installs get. So
// fill ours in once per Worker, the first time the admin lists its plugins.
const PLUGINS_API = "/_emdash/api/admin/plugins";
const PLUGIN_NAMES = [
	{ id: "builder", version: "0.1.0", name: "Blog Builder", about: "Help, updates and the switches Blog Builder adds to your blog." },
	{ id: "readercount", version: "0.1.0", name: "ReaderCount", about: "Cookie-free stats: see who reads your blog and where they come from." },
	{ id: "share", version: "0.2.0", name: "Share buttons and social profiles", about: "Simple share links under each post, with no tracking scripts, and your social profiles as icons in the footer." },
	{ id: "newsletter", version: "0.1.0", name: "Newsletter sign-up", about: "Collect readers' email addresses in your blog and download them any time." },
	{ id: "contact", version: "0.1.0", name: "Contact form", about: "A contact page that keeps spam out, with messages kept in your blog's admin." },
	{ id: "blocks", version: "0.2.0", name: "Sign-up, call-to-action and download blocks", about: "Type / in the editor to add a sign-up box, a call-to-action button or a members-only download anywhere in a post or page." },
	{ id: "checklist", version: "0.2.0", name: "Post checklist", about: "Checks each post's excerpt, title length, picture descriptions, links and affiliate disclosure before it goes live." },
];
let named = false;

async function namePlugins(): Promise<void> {
	const db = (env as { DB?: D1Database }).DB;
	if (named || !db) return;
	try {
		const now = new Date().toISOString();
		const upsert = db.prepare(
			`INSERT INTO _plugin_state (plugin_id, version, status, installed_at, activated_at, display_name, description)
			 VALUES (?1, ?2, 'active', ?3, ?3, ?4, ?5)
			 ON CONFLICT (plugin_id) DO UPDATE SET display_name = excluded.display_name, description = excluded.description`,
		);
		await db.batch(PLUGIN_NAMES.map((p) => upsert.bind(p.id, p.version, now, p.name, p.about)));
		named = true;
	} catch {
		// Tables not made yet (a brand-new blog): try again next time.
	}
}

/** A Blog Builder plugin switch, on unless the owner has turned it off. */
async function switchedOn(key: string): Promise<boolean> {
	try {
		return (await getPluginSetting<boolean>("builder", key)) ?? true;
	} catch {
		return true;
	}
}

// Public pages only: old WordPress addresses (src/old-addresses.ts) and
// click-to-load embeds (src/embeds.ts). The admin and the API are left alone.
async function publicPage(url: URL, method: string, response: Response, redirect: (to: string, status: 301) => Response): Promise<Response> {
	if ((method !== "GET" && method !== "HEAD") || url.pathname.startsWith("/_")) return response;

	if (response.status === 404 && url.pathname !== "/404" && (await switchedOn("oldAddresses"))) {
		const to = await oldAddress(url.pathname);
		if (to && to !== url.pathname) {
			// Let the "not found" page finish rendering before it's dropped (see EmDash's redirect middleware).
			await response.arrayBuffer().catch(() => undefined);
			return redirect(to + url.search, 301);
		}
	}

	const html = response.status === 200 && (response.headers.get("content-type") ?? "").includes("text/html");
	if (html && typeof HTMLRewriter !== "undefined" && (await switchedOn("clickToLoadEmbeds"))) return clickToLoad(response, url);
	return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
	if ((context.url.pathname === PLUGINS_API || context.url.pathname === `${PLUGINS_API}/`) && context.request.method === "GET") await namePlugins();

	const { url, cookies, request } = context;
	const token = (env as { SETUP_TOKEN?: string }).SETUP_TOKEN;
	const given = url.searchParams.get("setup");
	if (token && given && same(given, token)) {
		cookies.set(COOKIE, given, {
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			maxAge: 60 * 60 * 24,
		});
	}

	if (token && url.pathname.startsWith(SETUP_API) && request.method !== "GET") {
		const held = cookies.get(COOKIE)?.value ?? given ?? "";
		if (!same(held, token)) {
			return new Response(
				JSON.stringify({
					error: {
						code: "SETUP_LOCKED",
						message:
							"This blog is being set up by its owner. Open the set-up link the installer gave you to continue.",
					},
				}),
				{ status: 403, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	const response = await next();
	return publicPage(url, request.method, response, (to, status) => context.redirect(to, status));
});
