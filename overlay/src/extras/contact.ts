/**
 * Contact form for EmDash
 *
 * A contact page at /contact (src/pages/contact.astro) once the owner
 * switches it on. It asks for a name, an email address and a message, plus up
 * to 8 questions of the owner's own (contact-fields.ts). Messages are kept in
 * the blog's own database and shown on the plugin's page and the dashboard.
 * ReaderCount counts every send as
 * the "Contact form" goal. Spam is kept out on the blog itself
 * (src/extras/guard.ts), with Cloudflare Turnstile (src/turnstile.ts).
 */

import { definePlugin, type PluginContext } from "emdash";
import { TURNSTILE_SETTINGS, cleanEmail, cleanText, guard, newId, tidyRates, ukDateTime } from "./guard";
import { FIELD_TYPES, MAX_FIELDS, fieldId, readAnswers, readFields, tidyField, type Field } from "./contact-fields";

const PAGE = "/messages";
const WIDGET = "messages";

export interface Message {
	name: string;
	email: string;
	message: string;
	/** Answers to the owner's own questions, as they were asked. */
	answers?: { label: string; value: string }[];
	/** The page the form was sent from. */
	from?: string;
	createdAt: string;
	read: boolean;
}

type Ctx = PluginContext & { input?: unknown; requestMeta?: { ip: string | null } };

const getFields = async (ctx: Ctx) => readFields(await ctx.settings.get<unknown>("fields"));
async function send(ctx: Ctx) {
	if (!(await ctx.settings.get<boolean>("enabled"))) return { ok: false, message: "This contact form is switched off." };
	const input = (ctx.input ?? {}) as Record<string, unknown>;
	const checked = await guard(ctx, "contact", input, ctx.requestMeta?.ip ?? null);
	if (!checked.ok) return checked.quiet ? { ok: true } : { ok: false, message: checked.message };
	const name = cleanText(input.name, 120);
	const email = cleanEmail(input.email);
	const message = cleanText(input.message, 5000);
	if (!name) return { ok: false, message: "Please add your name." };
	if (!email) return { ok: false, message: "Please check your email address." };
	const got = readAnswers(await getFields(ctx), input);
	if ("error" in got) return { ok: false, message: got.error };
	if (message.length < 2) return { ok: false, message: "Please write a message." };
	const from = cleanText(input.from, 300);
	const m: Message = { name, email, message, ...(got.answers.length ? { answers: got.answers } : {}), ...(from ? { from } : {}), createdAt: new Date().toISOString(), read: false };
	await ctx.storage.messages.put(newId(), m);
	return { ok: true };
}

function messageBlocks(id: string, m: Message) {
	const extra = (m.answers ?? []).map((x) => ({ label: x.label, value: x.value }));
	return [
		{ type: "section", text: `${m.read ? "" : "New: "}${m.name} (${m.email}), ${ukDateTime(m.createdAt)}` },
		...(extra.length ? [{ type: "fields", fields: extra }] : []),
		{ type: "section", text: m.message },
		{
			type: "actions",
			elements: [
				{ type: "link", label: "Reply by email", target: { kind: "external", url: `mailto:${m.email}?subject=${encodeURIComponent("Your message")}` } },
				...(m.read ? [] : [{ type: "button", action_id: "read", value: id, label: "Mark as read" }]),
				{ type: "button", action_id: "remove", value: id, label: "Delete", style: "danger" },
			],
		},
		{ type: "divider" },
	];
}

const TYPE_OPTIONS = Object.entries(FIELD_TYPES).map(([value, label]) => ({ label, value }));

const TYPE_ICONS: Record<string, string> = { text: "text", long: "article", phone: "chat", choice: "tag", tick: "shield" };

/** "Your form": the questions, in order, as rows with tags, and the form for adding or changing one when asked. */
function formBlocks(fields: Field[], editing: Field | null, adding: boolean): unknown[] {
	const fixed = (title: string, kind: string, icon: string) => ({ icon, title, tags: [{ text: kind, color: "blue" }, { text: "Required", color: "orange" }, "Always asked"] });
	const out: unknown[] = [
		{
			type: "blog_rows",
			title: "Your form",
			text: `Every form asks for a name, an email address (so you can reply) and a message. Add up to ${MAX_FIELDS} questions of your own between them.`,
			rows: [
				fixed("Your name", "Short answer", "users"),
				fixed("Your email address", "Email address", "envelope"),
				...fields.map((f, i) => ({
					icon: TYPE_ICONS[f.type] ?? "question",
					color: "teal",
					title: f.label,
					...(f.type === "choice" ? { text: f.options.join(" · ") } : {}),
					tags: [{ text: FIELD_TYPES[f.type], color: "blue" }, f.required ? { text: "Required", color: "orange" } : { text: "Optional", color: "neutral" }],
					elements: [
						{ type: "button", action_id: "q_edit", value: f.id, label: "Edit" },
						...(i ? [{ type: "button", action_id: "q_up", value: f.id, label: "Move up" }] : []),
						{ type: "button", action_id: "q_remove", value: f.id, label: "Remove", style: "danger", confirm: { title: "Remove this question?", text: "Messages already sent keep their answers.", confirm: "Remove", deny: "Keep it" } },
					],
				})),
				fixed("Message", "Long answer", "chat"),
			],
		},
	];
	if (editing || adding) {
		out.push(
			{ type: "header", text: editing ? `Change "${editing.label}"` : "Add a question" },
			{
				type: "form",
				block_id: editing ? `q:${editing.id}` : "q:new",
				fields: [
					{ type: "text_input", action_id: "label", label: "Question", placeholder: "Such as Company, or What's your budget?", initial_value: editing?.label ?? "" },
					{ type: "select", action_id: "type", label: "Answer", options: TYPE_OPTIONS, initial_value: editing?.type ?? "text" },
					{ type: "text_input", action_id: "options", label: "Options, one per line (for a choice from a list)", multiline: true, initial_value: editing?.options.join("\n") ?? "" },
					{ type: "toggle", action_id: "required", label: "Required", initial_value: editing?.required ?? false },
				],
				submit: { label: editing ? "Save the question" : "Add the question", action_id: "q_save" },
			},
		);
	} else if (fields.length < MAX_FIELDS) out.push({ type: "actions", elements: [{ type: "button", action_id: "q_add", value: "new", label: "Add a question", style: "primary" }] });
	else out.push({ type: "context", text: `That's the most questions a form can have (${MAX_FIELDS}). Remove one to add another.` });
	return out;
}

/** The contact page's wording. */
async function sendingBlocks(ctx: Ctx): Promise<unknown[]> {
	const [heading, intro, button, thanks] = await Promise.all(["heading", "intro", "button", "thanks"].map((k) => ctx.settings.get<string>(k)));
	return [
		{
			type: "section",
			text: "Every message is kept here, in your blog's own database.",
		},
		{
			type: "form",
			block_id: "sending",
			fields: [
				{ type: "text_input", action_id: "heading", label: "Page heading", initial_value: heading || "Get in touch" },
				{ type: "text_input", action_id: "intro", label: "Line under the heading", initial_value: intro || "Send us a message and we'll reply by email." },
				{ type: "text_input", action_id: "button", label: "Button", initial_value: button || "Send message" },
				{ type: "text_input", action_id: "thanks", label: "After sending", initial_value: thanks || "Thanks, your message has been sent." },
			],
			submit: { label: "Save", action_id: "sending_save" },
		},
	];
}

async function renderPage(ctx: Ctx, toast?: string, opts: { editing?: Field | null; adding?: boolean; tab?: number; error?: boolean } = {}) {
	const messages = ctx.storage.messages;
	const [latest, unread, total, enabled, fields] = await Promise.all([
		messages.query({ orderBy: { createdAt: "desc" }, limit: 50 }),
		messages.count({ read: false }),
		messages.count(),
		ctx.settings.get<boolean>("enabled"),
		getFields(ctx),
	]);
	const list: unknown[] = [];
	if (latest.items.length) for (const { id, data } of latest.items) list.push(...messageBlocks(id, data as Message));
	else list.push({ type: "empty", title: "No messages yet", description: enabled ? "When someone uses your contact page, their message appears here." : "Switch on your contact page to start getting messages.", size: "sm" });
	const blocks: unknown[] = [
		{ type: "header", text: "Contact form" },
		enabled
			? { type: "section", text: "Your contact page is on, at /contact. ReaderCount counts each message as the \"Contact form\" goal, with the page and source that brought the visitor.", accessory: { type: "button", action_id: "toggle", value: "off", label: "Turn off" } }
			: { type: "banner", title: "Your contact page is off", description: "Turn it on, then add /contact to your menu under Menus.", variant: "alert" },
		...(enabled ? [] : [{ type: "actions", elements: [{ type: "button", action_id: "toggle", value: "on", label: "Turn on the contact page", style: "primary" }] }]),
		{ type: "stats", items: [{ label: "New messages", value: String(unread) }, { label: "All messages", value: String(total) }, { label: "Your questions", value: `${fields.length} of ${MAX_FIELDS}` }] },
		{
			type: "tab",
			default_tab: opts.tab ?? 0,
			panels: [
				{ label: "Messages", blocks: list },
				{ label: "Your form", blocks: formBlocks(fields, opts.editing ?? null, !!opts.adding) },
				{ label: "Wording", blocks: await sendingBlocks(ctx) },
			],
		},
		...(enabled ? [{ type: "actions", elements: [{ type: "link", label: "See your contact page", target: { kind: "external", url: `${siteOrigin(ctx)}/contact` } }, { type: "link", label: "Robot check settings", target: { kind: "plugin-settings" } }] }] : []),
	];
	return toast ? { blocks, toast: { message: toast, type: opts.error ? "error" : "success" } } : { blocks };
}

const siteOrigin = (ctx: Ctx) => {
	try {
		return new URL((ctx as { request?: Request }).request?.url ?? "").origin;
	} catch {
		return "";
	}
};

/** The owner's changes from the page: the switch, questions, and where messages go. Null when it isn't one of these. */
async function formAction(ctx: Ctx, input: { type?: string; action_id?: string; value?: string; block_id?: string; values?: Record<string, unknown> }) {
	const fields = await getFields(ctx);
	const save = (next: Field[]) => ctx.settings.set("fields", next);
	if (input.type === "block_action" && input.action_id === "toggle") {
		await ctx.settings.set("enabled", input.value === "on");
		return renderPage(ctx, input.value === "on" ? "Your contact page is on." : "Your contact page is off.");
	}
	if (input.type === "form_submit" && input.action_id === "q_save") {
		const editing = input.block_id && input.block_id !== "q:new" ? input.block_id.slice(2) : null;
		if (!editing && fields.length >= MAX_FIELDS) return renderPage(ctx, `A form can have up to ${MAX_FIELDS} questions.`, { tab: 1, error: true });
		const f = tidyField(input.values ?? {}, editing ?? fieldId());
		if ("error" in f) return renderPage(ctx, f.error, { tab: 1, error: true });
		await save(editing ? fields.map((x) => (x.id === editing ? f : x)) : [...fields, f]);
		return renderPage(ctx, editing ? "Question saved." : "Question added.", { tab: 1 });
	}
	if (input.type === "form_submit" && input.action_id === "sending_save") {
		const v = input.values ?? {};
		for (const k of ["heading", "intro", "button", "thanks"]) if (typeof v[k] === "string") await ctx.settings.set(k, cleanText(v[k], 200));
		return renderPage(ctx, "Saved.", { tab: 2 });
	}
	if (input.type !== "block_action" || typeof input.value !== "string") return null;
	const i = fields.findIndex((f) => f.id === input.value);
	if (input.action_id === "q_edit" && i >= 0) return renderPage(ctx, undefined, { editing: fields[i], tab: 1 });
	if (input.action_id === "q_add") return renderPage(ctx, undefined, { adding: true, tab: 1 });
	if (input.action_id === "q_up" && i > 0) {
		const next = [...fields];
		[next[i - 1], next[i]] = [next[i], next[i - 1]];
		await save(next);
		return renderPage(ctx, "Moved up.", { tab: 1 });
	}
	if (input.action_id === "q_remove" && i >= 0) {
		await save(fields.filter((_, j) => j !== i));
		return renderPage(ctx, "Question removed.", { tab: 1 });
	}
	return null;
}

async function renderWidget(ctx: Ctx) {
	const [latest, unread] = await Promise.all([
		ctx.storage.messages.query({ where: { read: false }, orderBy: { createdAt: "desc" }, limit: 3 }),
		ctx.storage.messages.count({ read: false }),
	]);
	const blocks: unknown[] = [{ type: "stats", items: [{ label: "New messages", value: String(unread) }] }];
	for (const { data } of latest.items) {
		const m = data as Message;
		blocks.push({ type: "context", text: `${m.name}: ${m.message.slice(0, 80)}${m.message.length > 80 ? "…" : ""}` });
	}
	blocks.push({ type: "actions", elements: [{ type: "link", label: "Open messages", target: { kind: "plugin-page", path: PAGE } }] });
	return { blocks };
}

export function createPlugin() {
	return definePlugin({
		id: "contact",
		version: "0.1.0",
		storage: { messages: { indexes: ["createdAt", "read", ["read", "createdAt"]] } },

		routes: {
			send: { public: true, handler: async (ctx) => send(ctx as Ctx) },
			admin: {
				permission: "plugins:manage",
				handler: async (ctx) => {
					const c = ctx as Ctx;
					const input = (c.input ?? {}) as { type?: string; action_id?: string; value?: string; page?: string };
					// The dashboard card asks with page "widget:messages"; the page itself is "/messages".
					if (input.page === WIDGET || input.page === `widget:${WIDGET}`) return renderWidget(c);
					const changed = await formAction(c, input as Parameters<typeof formAction>[1]);
					if (changed) return changed;
					if (input.type === "block_action" && typeof input.value === "string") {
						if (input.action_id === "remove") {
							await c.storage.messages.delete(input.value);
							return renderPage(c, "Deleted.");
						}
						if (input.action_id === "read") {
							const m = await c.storage.messages.get(input.value);
							if (m) await c.storage.messages.put(input.value, { ...(m as Message), read: true });
							return renderPage(c, "Marked as read.");
						}
					}
					if (input.type === "page_load") await tidyRates(c);
					return renderPage(c);
				},
			},
		},

		admin: {
			pages: [{ path: PAGE, label: "Contact form", icon: "inbox" }],
			widgets: [{ id: WIDGET, title: "Messages", size: "third" }],
			settingsSchema: {
				enabled: {
					type: "boolean",
					label: "Show the contact page",
					description: "Your contact page is at /contact. Add it to your menu under Menus.",
					default: false,
				},
				heading: {
					type: "string",
					label: "Page heading",
					default: "Get in touch",
				},
				intro: {
					type: "string",
					label: "Line under the heading",
					default: "Send us a message and we'll reply by email.",
				},
				button: {
					type: "string",
					label: "Button",
					default: "Send message",
				},
				thanks: {
					type: "string",
					label: "After sending",
					default: "Thanks, your message has been sent.",
				},
				...TURNSTILE_SETTINGS,
			},
		},
	});
}

export default createPlugin;
