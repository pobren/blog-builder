// Runs one Blog Builder install action on the person's Cloudflare account with their API token. Every
// action checks what already exists first, so running it again is safe (that is also how updates work).
//
// API references (Cloudflare REST API v4):
//  D1 databases      https://developers.cloudflare.com/api/resources/d1/subresources/database/
//  KV namespaces     https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/
//  R2 buckets        https://developers.cloudflare.com/api/resources/r2/subresources/buckets/
//  Worker uploads    https://developers.cloudflare.com/api/resources/workers/subresources/scripts/
//  Worker schedules  https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/

import {
	BLOG_BUCKET,
	BLOG_DATABASE,
	BLOG_LOCATIONS,
	BLOG_SCRIPT,
	BLOG_SESSIONS,
	SETUP_SECRET,
	blogAssetManifest,
	themeFromBindings,
	blogHostname,
	blogMetadata,
	setupLink,
	type BlogActionId,
	type BlogChoice,
	type BlogResources,
} from "./deploy.ts";
import { DEFAULT_BLOG_THEME } from "../overlay/src/themes-list.ts";
import { BLOG_RELEASES_PATH, isBlogManifest, isSafeBlogVersion, type BlogManifest } from "./release.ts";

const API = "https://api.cloudflare.com/client/v4";
/** Asset files uploaded per call, so each request stays well inside Cloudflare's limits. */
const ASSET_FILES_PER_REQUEST = 25;

export interface ActionResult {
	ok: boolean;
	/** Plain-English summary for the person. */
	message?: string;
	/** Cloudflare's own wording. */
	detail?: string;
	/** The assets action needs another call to finish. */
	more?: boolean;
	/** Where the blog lives, once known. */
	hostname?: string;
	/** A page in Cloudflare's dashboard that fixes the problem. */
	link?: { href: string; text: string };
}

/** A failure we can explain in plain words. */
export class InstallError extends Error {
	constructor(
		message: string,
		readonly detail?: string,
		readonly link?: { href: string; text: string },
	) {
		super(message);
	}
}

// -- Cloudflare API ---------------------------------------------------

interface CfEnvelope<T> {
	success: boolean;
	result: T;
	errors?: { code: number; message: string }[];
}

export interface CfResponse<T> {
	status: number;
	ok: boolean;
	result: T | null;
	errors: { code: number; message: string }[];
}

const GATEWAY_ERRORS = new Set([502, 503, 504]);
const RETRY_AFTER_MS = 2000;

export async function call<T>(token: string, method: string, path: string, body?: unknown | FormData): Promise<CfResponse<T>> {
	const headers: Record<string, string> = { authorization: `Bearer ${token}` };
	let payload: BodyInit | undefined;
	if (body instanceof FormData) payload = body;
	else if (body !== undefined) {
		headers["content-type"] = "application/json";
		payload = JSON.stringify(body);
	}
	let res: Response;
	try {
		res = await fetch(`${API}${path}`, { method, headers, body: payload });
		// Cloudflare's API sometimes gives up with a 502, 503 or 504 when it's busy. Asking again once
		// is safe for reads, replacements and starting an upload session, which can all be repeated.
		if (GATEWAY_ERRORS.has(res.status) && (method === "GET" || method === "PUT" || path.endsWith("/assets-upload-session"))) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
			res = await fetch(`${API}${path}`, { method, headers, body: payload });
		}
	} catch (e) {
		throw new InstallError("We couldn't reach Cloudflare. Please check your connection and try again.", String(e));
	}
	let parsed: CfEnvelope<T> | null = null;
	try {
		parsed = (await res.json()) as CfEnvelope<T>;
	} catch {
		parsed = null;
	}
	return {
		status: res.status,
		ok: res.ok && Boolean(parsed?.success),
		result: parsed?.result ?? null,
		errors: parsed?.errors ?? [],
	};
}

export function describe(r: CfResponse<unknown>): string {
	const text = r.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
	return `HTTP ${r.status}${text ? ` (${text})` : ""}`;
}

/** Throws a plain-English error unless the call worked. Permission problems get their own wording. */
export function must<T>(r: CfResponse<T>, whatFailed: string): T {
	if (r.ok) return r.result as T;
	if (r.status === 401 || r.status === 403) {
		throw new InstallError(
			`${whatFailed} Cloudflare says your API token doesn't have permission. Check it has everything listed by npx @mrpwob/blog-builder help, then run the command again.`,
			describe(r),
		);
	}
	throw new InstallError(whatFailed, describe(r));
}

export async function readAsset(assets: Fetcher, base: string, path: string): Promise<Response> {
	const res = await assets.fetch(new Request(new URL(path.replace(/^\//, ""), base)));
	if (!res.ok) throw new InstallError("Blog Builder's install files are missing from this package. Please reinstall it and try again.", `${path}: HTTP ${res.status}`);
	return res;
}

export function base64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	let out = "";
	for (let i = 0; i < view.length; i += 0x8000) out += String.fromCharCode(...view.subarray(i, i + 0x8000));
	return btoa(out);
}

/** Cloudflare's error code when R2 has never been switched on for the account. */
export const R2_OFF_CODE = 10042;

/**
 * True when Cloudflare refuses an R2 call because R2 isn't switched on for the account yet
 * ("Please enable R2 through the Cloudflare Dashboard."). It has to be switched on once in the
 * dashboard, which asks for a payment card even for the free allowance, so the installer can't do it.
 */
export function r2NotEnabled(errors: { code: number; message: string }[]): boolean {
	return errors.some((e) => e.code === R2_OFF_CODE || /enable R2|R2.*(enable|purchase|subscri)/i.test(e.message));
}

/** The R2 page in the person's own Cloudflare dashboard, where they switch R2 on. */
export function r2DashboardUrl(accountId: string): string {
	return `https://dash.cloudflare.com/${encodeURIComponent(accountId)}/r2/overview`;
}

/**
 * Takes whole buckets, in order, until adding the next would go over `maxFiles` (always at least
 * one bucket, so progress is guaranteed). Keeps each request within Cloudflare's limits.
 */
export function takeBuckets(buckets: string[][], maxFiles: number): { now: string[][]; later: string[][] } {
	const nonEmpty = buckets.filter((b) => b.length > 0);
	const now: string[][] = [];
	let count = 0;
	let i = 0;
	for (; i < nonEmpty.length; i++) {
		if (now.length > 0 && count + nonEmpty[i].length > maxFiles) break;
		now.push(nonEmpty[i]);
		count += nonEmpty[i].length;
	}
	return { now, later: nonEmpty.slice(i) };
}

// -- Context ----------------------------------------------------------

export interface BlogRunContext {
	token: string;
	choice: BlogChoice;
	/** Reads the release files (in this package), fetch-style. */
	assets: Fetcher;
	base: string;
}

export interface BlogActionResult extends ActionResult {
	/** The "start" action: the one-time link that lets the owner finish setting up their blog. */
	setupUrl?: string;
	version?: string;
	/** The theme the blog now has. */
	theme?: string;
}

const acct = (ctx: BlogRunContext) => `/accounts/${ctx.choice.accountId}`;

export async function findZoneId(ctx: BlogRunContext): Promise<string> {
	const domain = ctx.choice.domain!;
	const zones = must(
		await call<{ id: string; name: string }[]>(ctx.token, "GET", `/zones?name=${encodeURIComponent(domain)}&account.id=${ctx.choice.accountId}`),
		`We couldn't find ${domain} on your Cloudflare account.`,
	);
	const zone = zones.find((z) => z.name.toLowerCase() === domain);
	if (!zone) throw new InstallError(`We couldn't find ${domain} on this Cloudflare account. Please check the domain and run the command again.`);
	return zone.id;
}

export async function workersSubdomain(ctx: BlogRunContext): Promise<string> {
	const r = await call<{ subdomain: string }>(ctx.token, "GET", `${acct(ctx)}/workers/subdomain`);
	if (r.ok && r.result?.subdomain) return r.result.subdomain;
	throw new InstallError(
		"Your Cloudflare account doesn't have its free workers.dev address yet. Open Workers & Pages in your Cloudflare dashboard once, pick a name, then run the command again.",
		describe(r),
	);
}

/** Whether Blog Builder is installed on this account (its Worker is there). */
export async function blogInstalled(token: string, accountId: string): Promise<boolean> {
	const r = await call(token, "GET", `/accounts/${accountId}/workers/scripts/${BLOG_SCRIPT}/settings`);
	return r.ok;
}

export async function loadBlogRelease(assets: Fetcher, base: string): Promise<BlogManifest> {
	const latest = (await (await readAsset(assets, base, `${BLOG_RELEASES_PATH}/latest.json`)).json()) as { version?: string };
	if (!latest.version || !isSafeBlogVersion(latest.version)) throw new InstallError("Blog Builder's install files in this package look damaged.", "latest.json");
	const manifest = await (await readAsset(assets, base, `${BLOG_RELEASES_PATH}/${latest.version}/manifest.json`)).json();
	if (!isBlogManifest(manifest)) throw new InstallError("Blog Builder's install files in this package look damaged.", "manifest.json");
	return manifest;
}

async function hostnameFor(ctx: BlogRunContext): Promise<string> {
	return ctx.choice.domain ? blogHostname(ctx.choice) : blogHostname(ctx.choice, await workersSubdomain(ctx));
}

// -- Storage ------------------------------------------------------------

function r2OffError(ctx: BlogRunContext, r: CfResponse<unknown>): InstallError {
	return new InstallError(
		"Storage (R2) isn't switched on for your Cloudflare account yet. Open R2 in your Cloudflare dashboard and switch it on. Cloudflare asks for a payment card once, even for its free allowance, which is plenty for a blog's pictures. Then run the command again.",
		describe(r),
		{ href: r2DashboardUrl(ctx.choice.accountId), text: "Open R2 in Cloudflare" },
	);
}

async function findDatabase(ctx: BlogRunContext): Promise<string | null> {
	const list = must(
		await call<{ uuid: string; name: string }[]>(ctx.token, "GET", `${acct(ctx)}/d1/database?name=${BLOG_DATABASE}&per_page=100`),
		"We couldn't look at your databases.",
	);
	return list?.find((d) => d.name === BLOG_DATABASE)?.uuid ?? null;
}

async function findSessions(ctx: BlogRunContext): Promise<string | null> {
	for (let page = 1; page <= 10; page++) {
		const list = must(
			await call<{ id: string; title: string }[]>(ctx.token, "GET", `${acct(ctx)}/storage/kv/namespaces?per_page=100&page=${page}`),
			"We couldn't look at your storage.",
		);
		const found = list?.find((n) => n.title === BLOG_SESSIONS);
		if (found) return found.id;
		if (!list || list.length < 100) return null;
	}
	return null;
}

/** The database and session store the Worker is bound to. Throws if "storage" hasn't run yet. */
async function resources(ctx: BlogRunContext): Promise<BlogResources> {
	const [databaseId, sessionsId] = await Promise.all([findDatabase(ctx), findSessions(ctx)]);
	if (!databaseId || !sessionsId) throw new InstallError("Your blog's database isn't there yet. Please press Try again.");
	return { databaseId, sessionsId };
}

/** 1. The D1 database (posts, pages, settings), R2 bucket (pictures) and KV namespace (sign-in sessions), near the owner. */
async function storage(ctx: BlogRunContext): Promise<BlogActionResult> {
	const where = ctx.choice.location;
	const bucket = await call(ctx.token, "GET", `${acct(ctx)}/r2/buckets/${BLOG_BUCKET}`);
	if (!bucket.ok) {
		if (r2NotEnabled(bucket.errors)) throw r2OffError(ctx, bucket);
		const created = await call(ctx.token, "POST", `${acct(ctx)}/r2/buckets`, { name: BLOG_BUCKET, locationHint: where });
		if (!created.ok && r2NotEnabled(created.errors)) throw r2OffError(ctx, created);
		must(created, "We couldn't create storage for your blog's pictures.");
	}
	if (!(await findDatabase(ctx))) {
		must(
			await call(ctx.token, "POST", `${acct(ctx)}/d1/database`, { name: BLOG_DATABASE, primary_location_hint: where }),
			`We couldn't create your blog's database in ${BLOG_LOCATIONS[where]}.`,
		);
	}
	if (!(await findSessions(ctx))) {
		must(await call(ctx.token, "POST", `${acct(ctx)}/storage/kv/namespaces`, { title: BLOG_SESSIONS }), "We couldn't create your blog's sign-in storage.");
	}
	return { ok: true };
}

// -- The Worker ----------------------------------------------------------

/**
 * The starting theme to put on: the one asked for, or else the one the blog already has, so an update
 * never changes it. A brand-new blog gets Notebook. The owner can pick another in the admin any time.
 */
async function themeFor(ctx: BlogRunContext): Promise<string> {
	if (ctx.choice.theme) return ctx.choice.theme;
	const r = await call<{ bindings?: unknown }>(ctx.token, "GET", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}/settings`);
	return (r.ok && themeFromBindings(r.result?.bindings)) || DEFAULT_BLOG_THEME;
}

async function syncAssets(ctx: BlogRunContext, manifest: BlogManifest, maxFiles: number): Promise<{ jwt: string | null; more: boolean }> {
	const session = must(
		await call<{ jwt: string; buckets: string[][] }>(ctx.token, "POST", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}/assets-upload-session`, blogAssetManifest(manifest)),
		"We couldn't start uploading Blog Builder.",
	);
	const { now, later } = takeBuckets(session.buckets ?? [], maxFiles);
	if (now.length === 0) return { jwt: session.jwt, more: false };

	const byHash = new Map(manifest.assets.map((a) => [a.hash, a]));
	let completion: string | null = null;
	for (const bucket of now) {
		const form = new FormData();
		for (const hash of bucket) {
			const asset = byHash.get(hash);
			if (!asset) throw new InstallError("Blog Builder's install files in this package don't match. Please reinstall it and try again.", `unknown asset hash ${hash}`);
			const bytes = await (await readAsset(ctx.assets, ctx.base, `${BLOG_RELEASES_PATH}/${manifest.version}/assets${asset.path}`)).arrayBuffer();
			form.append(hash, new File([base64(bytes)], hash, { type: asset.contentType }));
		}
		const r = await call<{ jwt?: string }>(session.jwt, "POST", `${acct(ctx)}/workers/assets/upload?base64=true`, form);
		const result = must(r, "We couldn't upload part of Blog Builder.");
		if (result?.jwt) completion = result.jwt;
	}
	if (later.length > 0) return { jwt: null, more: true };
	return { jwt: completion ?? null, more: completion === null };
}

/** 2a. The blog's pictures, styles and admin files, a batch per call. */
async function assetsAction(ctx: BlogRunContext): Promise<BlogActionResult> {
	const manifest = await loadBlogRelease(ctx.assets, ctx.base);
	const { more } = await syncAssets(ctx, manifest, ASSET_FILES_PER_REQUEST);
	return { ok: true, more };
}

/** 2b. The Worker itself, bound to the person's database, bucket and session store. */
async function worker(ctx: BlogRunContext): Promise<BlogActionResult> {
	const [manifest, theme] = await Promise.all([loadBlogRelease(ctx.assets, ctx.base), themeFor(ctx)]);
	let sync = await syncAssets(ctx, manifest, Number.MAX_SAFE_INTEGER);
	if (!sync.jwt) sync = await syncAssets(ctx, manifest, Number.MAX_SAFE_INTEGER);
	if (!sync.jwt) throw new InstallError("Cloudflare didn't confirm Blog Builder's files arrived. Please try again.");

	const [ids, hostname] = await Promise.all([resources(ctx), hostnameFor(ctx)]);
	const metadata = blogMetadata(manifest, ids, { assetsJwt: sync.jwt, siteUrl: `https://${hostname}`, theme });
	// Every module travels in one file, so this is one read rather than hundreds.
	const code = (await (await readAsset(ctx.assets, ctx.base, `${BLOG_RELEASES_PATH}/${manifest.version}/worker.json`)).json()) as Record<string, string>;
	const form = new FormData();
	form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
	for (const name of manifest.worker.modules) {
		if (typeof code[name] !== "string") throw new InstallError("Blog Builder's install files in this package look damaged.", `missing module ${name}`);
		form.append(name, new File([code[name]], name, { type: "application/javascript+module" }));
	}
	must(await call(ctx.token, "PUT", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}`, form), "We couldn't install Blog Builder.");
	must(
		await call(ctx.token, "PUT", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}/schedules`, manifest.worker.crons.map((cron) => ({ cron }))),
		"We couldn't set up your blog's scheduled posts.",
	);
	return { ok: true, version: manifest.version, theme };
}

/** 2c. The blog's address: blog.<domain> (or the domain itself), or blog-builder.<subdomain>.workers.dev for a trial. */
async function address(ctx: BlogRunContext): Promise<BlogActionResult> {
	const hostname = await hostnameFor(ctx);
	if (ctx.choice.domain) {
		const zoneId = await findZoneId(ctx);
		const r = await call(ctx.token, "PUT", `${acct(ctx)}/workers/domains`, { environment: "production", hostname, service: BLOG_SCRIPT, zone_id: zoneId });
		if (!r.ok && r.status === 409) {
			throw new InstallError(`${hostname} is already in use. Remove its DNS record in Cloudflare, or pick another address, then try again.`, describe(r));
		}
		must(r, `We couldn't set up ${hostname}.`);
		return { ok: true, hostname };
	}
	must(await call(ctx.token, "POST", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}/subdomain`, { enabled: true }), "We couldn't switch on your blog's address.");
	return { ok: true, hostname };
}

function newSetupToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 3. A fresh set-up code on the Worker, and the link that carries it. Until the owner finishes
 * EmDash's set-up wizard with that link, nobody else can make themselves the blog's admin.
 * Run on every install and update: once the blog is set up, EmDash refuses set-up anyway.
 */
async function start(ctx: BlogRunContext): Promise<BlogActionResult> {
	const hostname = await hostnameFor(ctx);
	const token = newSetupToken();
	must(
		await call(ctx.token, "PUT", `${acct(ctx)}/workers/scripts/${BLOG_SCRIPT}/secrets`, { name: SETUP_SECRET, text: token, type: "secret_text" }),
		"We couldn't lock your blog's set-up to you.",
	);
	return { ok: true, hostname, setupUrl: setupLink(hostname, token) };
}

const ACTIONS: Record<BlogActionId, (ctx: BlogRunContext) => Promise<BlogActionResult>> = {
	storage,
	assets: assetsAction,
	worker,
	address,
	start,
};

export async function runBlogAction(action: BlogActionId, ctx: BlogRunContext): Promise<BlogActionResult> {
	try {
		return await ACTIONS[action](ctx);
	} catch (e) {
		if (e instanceof InstallError) return { ok: false, message: e.message, detail: e.detail, link: e.link };
		return { ok: false, message: "Something unexpected went wrong. Nothing is lost: please try again.", detail: String(e) };
	}
}
