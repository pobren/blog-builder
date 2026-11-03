/**
 * Newsletter sign-up for EmDash
 *
 * A sign-up box under each post (and on the home page if the owner wants),
 * drawn by src/components/BlogSignup.astro. Addresses are kept in the blog's
 * own database, never sent anywhere. The owner sees them on the plugin's page
 * and can download them as a CSV file (src/pages/export/subscribers.csv.ts)
 * to use with whichever newsletter tool they like.
 *
 * Subscribers from another service come in on /import-subscribers (pages/import-subscribers.astro), which calls the "import"
 * route here 50 at a time.
 */

import { definePlugin, type PluginContext } from "emdash";
import { TURNSTILE_SETTINGS, cleanEmail, guard, sha256, tidyRates, ukDateTime } from "./guard";
import { askNameOf, cleanName } from "./member-name";

const PAGE = "/newsletter";

export interface Subscriber {
	email: string;
	/** What they typed in the sign-up box's name field (if the owner asks for it). */
	name?: string;
	createdAt: string;
	/** The page they signed up on, or "import" when the owner brought them in from another service. */
	from: string;
}

type Ctx = PluginContext & { input?: unknown; request: Request; requestMeta?: { ip: string | null }; site?: { url?: string; name?: string } };

async function subscribe(ctx: Ctx) {
	if (!(await ctx.settings.get<boolean>("enabled"))) return { ok: false, message: "Sign-ups are closed." };
	const input = (ctx.input ?? {}) as { email?: unknown; name?: unknown; from?: unknown; website?: unknown; shown?: unknown; turnstile?: unknown };
	const checked = await guard(ctx, "newsletter", input, ctx.requestMeta?.ip ?? null);
	if (!checked.ok) return checked.quiet ? { ok: true } : { ok: false, message: checked.message };
	const email = cleanEmail(input.email);
	if (!email) return { ok: false, message: "Please check your email address." };
	// A form with a name box sends "name"; it's only required when the owner says so (a form without one still works).
	const ask = askNameOf(await ctx.settings.get<string>("askName"));
	const name = ask === "off" ? "" : cleanName(input.name);
	if (ask === "required" && "name" in input && !name) return { ok: false, message: "Please add your name." };
	const id = (await sha256(email)).slice(0, 32);
	const subscribers = ctx.storage.subscribers;
	const from = typeof input.from === "string" && input.from.startsWith("/") ? input.from.slice(0, 200) : "/";
	// Signing up twice is fine: say thanks and keep the first date.
	if (!(await subscribers.exists(id))) await subscribers.put(id, { email, ...(name ? { name } : {}), createdAt: new Date().toISOString(), from } satisfies Subscriber);
	return { ok: true };
}

// -- Bringing subscribers in (pages/import-subscribers.astro) ------------------------

/** Most addresses one call to the import route takes. */
const IMPORT_BATCH = 50;

/**
 * check: how many subscribers there are. Otherwise {emails, consent}: adds them. Anyone already on the list is
 * left as they are.
 */
async function importSubscribers(ctx: Ctx) {
	const input = (ctx.input ?? {}) as { check?: unknown; emails?: unknown; consent?: unknown };
	const subscribers = ctx.storage.subscribers;
	if (input.check) return { ok: true, subscribers: await subscribers.count() };
	if (input.consent !== true) return { ok: false, message: "Please confirm these people agreed to get emails from you." };
	if (!Array.isArray(input.emails) || input.emails.length > IMPORT_BATCH) return { ok: false, message: "Send at most 50 addresses at a time." };
	let added = 0;
	let already = 0;
	const now = new Date().toISOString();
	for (const raw of input.emails) {
		const email = cleanEmail(raw);
		if (!email) continue;
		const id = (await sha256(email)).slice(0, 32);
		if (await subscribers.exists(id)) {
			already++;
			continue;
		}
		await subscribers.put(id, { email, createdAt: now, from: "import" } satisfies Subscriber);
		added++;
	}
	return { ok: true, added, already };
}

// -- The plugin's page --------------------------------------------------------

async function renderPage(ctx: Ctx, toast?: string) {
	const subscribers = ctx.storage.subscribers;
	const [count, latest, enabled] = await Promise.all([
		subscribers.count(),
		subscribers.query({ orderBy: { createdAt: "desc" }, limit: 100 }),
		ctx.settings.get<boolean>("enabled"),
	]);
	const blocks: unknown[] = [
		{ type: "header", text: "Newsletter" },
		{
			type: "section",
			text: enabled
				? "Readers can sign up under your posts. Their addresses stay in your blog's own database. Download them any time to use with your newsletter tool."
				: "Sign-ups are switched off. Switch on \"Show the sign-up box\" in this plugin's settings to start collecting addresses.",
		},
		{ type: "stats", items: [{ label: "People signed up", value: String(count) }] },
		{
			type: "actions",
			elements: [
				{ type: "link", label: "Download as a CSV file", target: { kind: "external", url: `${siteUrl(ctx)}/export/subscribers.csv` }, appearance: "primary" },
				{ type: "link", label: "Import subscribers", target: { kind: "external", url: `${siteUrl(ctx)}/import-subscribers` } },
				{ type: "link", label: "Settings", target: { kind: "plugin-settings" } },
			],
		},
	];
	if (latest.items.length) {
		blocks.push({ type: "header", text: "Latest sign-ups" });
		blocks.push({
			type: "table",
			page_action_id: "page",
			columns: [
				{ key: "email", label: "Email address" },
				{ key: "name", label: "Name" },
				{ key: "date", label: "Signed up" },
				{ key: "remove", label: "", format: "element" },
			],
			rows: latest.items.map(({ id, data }) => {
				const sub = data as Subscriber;
				return {
					email: sub.email,
					name: sub.name ?? "",
					date: ukDateTime(sub.createdAt),
					remove: { type: "button", action_id: "remove", value: id, label: "Remove", style: "danger" },
				};
			}),
		});
		if (latest.items.length >= 100) blocks.push({ type: "context", text: `Showing the newest ${latest.items.length}. The CSV file has everyone.` });
	} else {
		blocks.push({ type: "context", text: "Nobody has signed up yet." });
	}
	return toast ? { blocks, toast: { message: toast, type: "success" as const } } : { blocks };
}

/** The blog's address: from its settings, or else the address this request came to (links in emails must be whole). */
function siteUrl(ctx: Ctx): string {
	let fromRequest = "";
	try {
		fromRequest = ctx.request ? new URL(ctx.request.url).origin : "";
	} catch {
		fromRequest = "";
	}
	return (ctx.site?.url || fromRequest).replace(/\/$/, "");
}

export function createPlugin() {
	return definePlugin({
		id: "newsletter",
		version: "0.3.0",
		capabilities: [],
		storage: {
			subscribers: { indexes: ["createdAt"] },
		},

		routes: {
			subscribe: { public: true, handler: async (ctx) => subscribe(ctx as Ctx) },
			// Only the blog's admins: pages/import-subscribers.astro calls it with their session.
			import: { permission: "plugins:manage", handler: async (ctx) => importSubscribers(ctx as Ctx) },
			admin: {
				permission: "plugins:manage",
				handler: async (ctx) => {
					const c = ctx as Ctx;
					const input = (c.input ?? {}) as { type?: string; action_id?: string; value?: string };
					if (input.type === "block_action" && input.action_id === "remove" && typeof input.value === "string") {
						await c.storage.subscribers.delete(input.value);
						return renderPage(c, "Removed.");
					}
					if (input.type === "page_load") await tidyRates(c);
					return renderPage(c);
				},
			},
		},

		admin: {
			pages: [{ path: PAGE, label: "Newsletter", icon: "mail" }],
			settingsSchema: {
				enabled: {
					type: "boolean",
					label: "Show the sign-up box",
					description: "Readers can leave their email address under each post.",
					default: true,
				},
				onHome: {
					type: "boolean",
					label: "Show it on the home page too",
					default: true,
				},
				heading: {
					type: "string",
					label: "Heading",
					default: "Get new posts by email",
				},
				blurb: {
					type: "string",
					label: "Line under the heading",
					default: "Leave your email address and we'll let you know when there's something new.",
				},
				buttonLabel: {
					type: "string",
					label: "Button",
					default: "Sign up",
				},
				slideUp: {
					type: "boolean",
					label: "Slide-up sign-up box while reading",
					description: "A small box slides up once a reader is halfway down a post. It closes for a month when they close it.",
					default: false,
				},
				askName: {
					type: "select",
					label: "Ask for their name",
					description: "A name box next to the email address in the sign-up box. Names show on the Newsletter page and in the CSV file.",
					options: [
						{ value: "optional", label: "Yes, but they can leave it blank" },
						{ value: "required", label: "Yes, and they must fill it in" },
						{ value: "off", label: "No, just their email address" },
					],
					default: "optional",
				},
				...TURNSTILE_SETTINGS,
			},
		},
	});
}

export default createPlugin;
