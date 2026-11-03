// Spam and abuse checks shared by the newsletter sign-up and the contact form.
// Every check happens on the blog itself: a hidden field that people never fill
// in, a minimum time on the page, a few sends an hour from one connection, and
// Cloudflare Turnstile (src/turnstile.ts), with the owner's own keys.

import { secretFor } from "../turnstile";
import type { PluginContext } from "emdash";

const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const PER_HOUR = 5;
const HOUR = 3_600_000;

export function cleanEmail(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const email = value.trim().toLowerCase();
	return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function cleanText(value: unknown, max: number): string {
	return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

export async function sha256(text: string): Promise<string> {
	const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A short random id that sorts by time, for new records. */
export function newId(): string {
	const rand = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${Date.now().toString(36)}-${rand}`;
}

export interface FormInput {
	/** The hidden field: only robots fill it in. */
	website?: unknown;
	/** When the form was shown (ms since 1970), from the page. */
	shown?: unknown;
	/** Cloudflare Turnstile's answer, when the owner has switched Turnstile on. */
	turnstile?: unknown;
}

export type GuardResult = { ok: true } | { ok: false; quiet?: boolean; message: string };

/**
 * Runs the checks. A robot that fills the hidden field is told it worked
 * (quiet), so it learns nothing.
 */
export async function guard(ctx: PluginContext, kind: string, input: FormInput, ip: string | null): Promise<GuardResult> {
	if (typeof input.website === "string" && input.website.trim() !== "") return { ok: false, quiet: true, message: "" };
	const shown = Number(input.shown);
	if (Number.isFinite(shown) && Date.now() - shown < 2500) return { ok: false, quiet: true, message: "" };

	const host = (() => { try { return new URL((ctx as { request?: Request }).request?.url ?? "").hostname; } catch { return ""; } })();
	const secret = secretFor(await ctx.settings.get<string>("turnstileSiteKey"), await ctx.settings.get<string>("turnstileSecret"), host);
	if (secret) {
		const answer = typeof input.turnstile === "string" ? input.turnstile : "";
		if (!answer || !(await turnstileOk(secret, answer, ip))) return { ok: false, message: "Please complete the check above the button, then try again." };
	}

	if (ip) {
		const key = `rate:${kind}:${(await sha256(`${kind}:${ip}`)).slice(0, 24)}`;
		const now = Date.now();
		const seen = await ctx.kv.get<{ start: number; count: number }>(key);
		const fresh = !seen || now - seen.start > HOUR;
		const next = fresh ? { start: now, count: 1 } : { start: seen.start, count: seen.count + 1 };
		if (next.count > PER_HOUR) return { ok: false, message: "That's a lot of sends in a short time. Please try again in an hour." };
		await ctx.kv.set(key, next);
	}
	return { ok: true };
}

async function turnstileOk(secret: string, response: string, ip: string | null): Promise<boolean> {
	const body = new FormData();
	body.append("secret", secret);
	body.append("response", response);
	if (ip) body.append("remoteip", ip);
	try {
		const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
		const data = (await r.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		return false;
	}
}

/** Drops rate-limit records older than an hour, so they don't pile up. */
export async function tidyRates(ctx: PluginContext): Promise<void> {
	const now = Date.now();
	for (const { key, value } of await ctx.kv.list("rate:")) {
		const v = value as { start?: number } | null;
		if (!v?.start || now - v.start > HOUR) await ctx.kv.delete(key);
	}
}

/** "21 Oct 2026, 18:40" in UK style, for admin tables. */
export function ukDateTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

/** Turnstile settings, shared by both forms' settings pages. */
export const TURNSTILE_SETTINGS = {
	turnstileSiteKey: {
		type: "string",
		label: "Cloudflare Turnstile site key (optional)",
		description: "Adds Cloudflare's free robot check to the form. Create a widget for your blog's address under Turnstile in your Cloudflare dashboard, then paste its site key here and its secret key below.",
		default: "",
	},
	turnstileSecret: {
		type: "secret",
		label: "Cloudflare Turnstile secret key (optional)",
	},
} as const;
