// The pure parts of installing Blog Builder on someone's Cloudflare account: names, the steps, and the
// Worker upload metadata. No network calls here (see install-run.ts), so it can be tested.

import { BLOG_BINDINGS, type BlogManifest } from "./release.ts";
import { DEFAULT_BLOG_THEME, blogTheme } from "../overlay/src/themes-list.ts";

/** Names of what we create on the person's account. Fixed, so re-running finds the same things. */
export const BLOG_SCRIPT = "blog-builder";
export const BLOG_DATABASE = "blog-builder";
export const BLOG_BUCKET = "blog-builder-media";
export const BLOG_SESSIONS = "blog-builder-sessions";
/** With a domain, the blog lives at <subdomain>.<domain>; "blog" unless the person picks another. */
export const BLOG_SUBDOMAIN = "blog";
/** The secret that locks EmDash's set-up wizard to whoever has the set-up link (overlay/src/middleware.ts). */
export const SETUP_SECRET = "SETUP_TOKEN";

/** Where the database and media live. Cloudflare's location hints for D1 and R2 use the same codes. */
export const BLOG_LOCATIONS = {
	weur: "Western Europe",
	eeur: "Eastern Europe",
	enam: "Eastern North America",
	wnam: "Western North America",
	apac: "Asia-Pacific",
	oc: "Oceania",
} as const;
export type BlogLocation = keyof typeof BLOG_LOCATIONS;

export interface BlogChoice {
	accountId: string;
	/** null for "Just try it first": the blog runs on the account's workers.dev address. */
	domain: string | null;
	/** Only with a domain: the part before it, e.g. "blog" for blog.example.com. "" puts the blog on the domain itself. */
	subdomain?: string;
	location: BlogLocation;
	/** The theme to start with (overlay/src/themes-list.ts). Missing keeps the blog's current theme. */
	theme?: string;
}

export type BlogActionId = "storage" | "assets" | "worker" | "address" | "start";

export interface BlogStep {
	id: "storage" | "install" | "start";
	label: string;
	actions: BlogActionId[];
}

const ACCOUNT_RE = /^[0-9a-f]{32}$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}[a-z0-9]$/;

export function isBlogLocation(value: unknown): value is BlogLocation {
	return typeof value === "string" && Object.hasOwn(BLOG_LOCATIONS, value);
}

export function parseBlogChoice(input: unknown): BlogChoice | null {
	const v = input as { accountId?: unknown; domain?: unknown; subdomain?: unknown; location?: unknown; theme?: unknown };
	if (!v || typeof v.accountId !== "string" || !ACCOUNT_RE.test(v.accountId)) return null;
	const location = v.location === undefined ? "weur" : v.location;
	if (!isBlogLocation(location)) return null;
	if (v.theme !== undefined && v.theme !== null && v.theme !== "" && !blogTheme(v.theme)) return null;
	const theme = blogTheme(v.theme) ? { theme: v.theme as string } : {};
	if (v.domain === null || v.domain === undefined || v.domain === "") return { accountId: v.accountId, domain: null, location, ...theme };
	if (typeof v.domain !== "string") return null;
	const domain = v.domain.trim().toLowerCase().replace(/\.$/, "");
	if (!DOMAIN_RE.test(domain)) return null;
	if (v.subdomain === undefined || v.subdomain === null) return { accountId: v.accountId, domain, subdomain: BLOG_SUBDOMAIN, location, ...theme };
	if (typeof v.subdomain !== "string") return null;
	const subdomain = v.subdomain.trim().toLowerCase();
	if (subdomain !== "" && !LABEL_RE.test(subdomain)) return null;
	return { accountId: v.accountId, domain, subdomain, location, ...theme };
}

export function isBlogActionId(value: unknown): value is BlogActionId {
	return value === "storage" || value === "assets" || value === "worker" || value === "address" || value === "start";
}

/** The steps the person sees, each made of one or more server actions, run in order. */
export function blogSteps(): BlogStep[] {
	return [
		{ id: "storage", label: "Creating your blog's database and storage", actions: ["storage"] },
		{ id: "install", label: "Installing your blog", actions: ["assets", "worker", "address"] },
		{ id: "start", label: "Getting your blog ready", actions: ["start"] },
	];
}

/** Where the blog lives. A trial needs the account's workers.dev subdomain. */
export function blogHostname(choice: BlogChoice, workersSubdomain?: string | null): string {
	if (choice.domain) return choice.subdomain ? `${choice.subdomain}.${choice.domain}` : choice.domain;
	if (!workersSubdomain) throw new Error("No workers.dev subdomain on this account yet.");
	return `${BLOG_SCRIPT}.${workersSubdomain}.workers.dev`;
}

/** Body for POST .../workers/scripts/:name/assets-upload-session. Every theme's stylesheet goes up, so the owner can switch. */
export function blogAssetManifest(manifest: BlogManifest): { manifest: Record<string, { hash: string; size: number }> } {
	const out: Record<string, { hash: string; size: number }> = {};
	for (const a of manifest.assets) out[a.path] = { hash: a.hash, size: a.size };
	return { manifest: out };
}

/** The theme a blog's Worker is set to, from its bindings (GET .../workers/scripts/:name/settings). */
export function themeFromBindings(bindings: unknown): string | null {
	if (!Array.isArray(bindings)) return null;
	const b = bindings.find((x) => x && typeof x === "object" && (x as { name?: unknown }).name === THEME_SETTING) as { type?: unknown; text?: unknown } | undefined;
	return b && b.type === "plain_text" && blogTheme(b.text) ? (b.text as string) : null;
}

/** The Worker setting that names the blog's starting theme (overlay/src/theme.ts reads it). */
export const THEME_SETTING = "THEME";

export interface BlogResources {
	databaseId: string;
	sessionsId: string;
}

/**
 * Metadata for PUT /accounts/:id/workers/scripts/blog-builder: what Wrangler would send for EmDash's
 * wrangler.json, with the person's own database, bucket and session store. Secrets already on the
 * Worker (the set-up lock) are kept; the "start" action sets a fresh one.
 */
export function blogMetadata(manifest: BlogManifest, resources: BlogResources, opts: { assetsJwt: string; siteUrl: string; theme?: string }): Record<string, unknown> {
	const config: Record<string, unknown> = {};
	if (manifest.headers) config._headers = manifest.headers;
	if (manifest.redirects) config._redirects = manifest.redirects;
	return {
		main_module: manifest.worker.mainModule,
		compatibility_date: manifest.worker.compatibilityDate,
		compatibility_flags: manifest.worker.compatibilityFlags,
		bindings: [
			{ type: "d1", name: BLOG_BINDINGS.db, id: resources.databaseId },
			{ type: "r2_bucket", name: BLOG_BINDINGS.media, bucket_name: BLOG_BUCKET },
			{ type: "kv_namespace", name: BLOG_BINDINGS.session, namespace_id: resources.sessionsId },
			{ type: "images", name: BLOG_BINDINGS.images },
			{ type: "assets", name: BLOG_BINDINGS.assets },
			{ type: "plain_text", name: "EMDASH_SITE_URL", text: opts.siteUrl },
			// Which release is running: the Blog Builder page in the admin shows it and checks for a newer one.
			{ type: "plain_text", name: "APP_VERSION", text: manifest.version },
			// The starting theme. The owner can pick another in the admin.
			{ type: "plain_text", name: THEME_SETTING, text: opts.theme ?? DEFAULT_BLOG_THEME },
		],
		keep_bindings: ["secret_text"],
		assets: { jwt: opts.assetsJwt, ...(Object.keys(config).length ? { config } : {}) },
		observability: { enabled: true },
	};
}

/** The link that lets the owner, and only the owner, finish EmDash's set-up wizard. */
export function setupLink(hostname: string, token: string): string {
	return `https://${hostname}/setup-link?setup=${encodeURIComponent(token)}`;
}
