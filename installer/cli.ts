// `npx @mrpwob/blog-builder`: installs and updates Blog Builder on the person's own Cloudflare account from
// their terminal, with a Cloudflare API token they make themselves. The token only ever goes to
// api.cloudflare.com. The release files (the built blog) come inside this package, so nothing else is
// downloaded: `npx @mrpwob/blog-builder@latest update` always brings the newest release.
//
// Built into one file, with the release next to it, by `npm run package` (see installer/package.ts).

import { createInterface } from "node:readline/promises";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { BLOG_LOCATIONS, BLOG_SCRIPT, BLOG_SUBDOMAIN, blogSteps, parseBlogChoice, type BlogActionId, type BlogChoice } from "./deploy.ts";
import { blogInstalled, loadBlogRelease, runBlogAction, type BlogActionResult, type BlogRunContext } from "./install-run.ts";
import { BLOG_THEMES, DEFAULT_BLOG_THEME } from "../overlay/src/themes-list.ts";
import { HELP, type Options, UsageError, forTerminal, isNewer, parseArgs, subdomainOf, tokenHelp } from "./core.ts";

const { stdin, stdout } = process;

declare const CLI_VERSION: string;

const API = "https://api.cloudflare.com/client/v4";
/** The release files sit next to this file, in release/, and are read through a fetch-like reader. */
const RELEASES_BASE = "https://release.local/";
const RELEASE_DIR = new URL("./", import.meta.url);

// -- Talking to the person --------------------------------------------

const tty = stdout.isTTY;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1");
const dim = paint("2");
const red = paint("31");
const green = paint("32");
const yellow = paint("33");

const say = (s = "") => stdout.write(`${s}\n`);

class Stop extends Error {}

let rl: ReturnType<typeof createInterface> | null = null;
function prompts() {
	rl ??= createInterface({ input: stdin, output: stdout, terminal: tty });
	return rl;
}

async function ask(question: string, fallback = ""): Promise<string> {
	if (!stdin.isTTY) {
		if (fallback) return fallback;
		throw new Stop(`${question.trim()} needs an answer, but there's no keyboard to type one. Use the options (npx @mrpwob/blog-builder help).`);
	}
	const answer = (await prompts().question(`${question}${fallback ? dim(` (${fallback})`) : ""} `)).trim();
	return answer || fallback;
}

async function confirm(question: string, opts: Options, fallback = false): Promise<boolean> {
	if (opts.yes) return true;
	if (!stdin.isTTY) return fallback;
	const answer = (await ask(`${question} ${dim(fallback ? "[Y/n]" : "[y/N]")}`)).toLowerCase();
	return answer ? answer.startsWith("y") : fallback;
}

/** Asks for the token without showing it on screen. */
async function askSecret(question: string): Promise<string> {
	if (!stdin.isTTY) throw new Stop("No Cloudflare API token. Set CLOUDFLARE_API_TOKEN and run the command again.");
	const r = prompts();
	const out = r as unknown as { _writeToOutput?: (s: string) => void };
	const original = out._writeToOutput;
	stdout.write(question + " ");
	out._writeToOutput = (s: string) => {
		if (s.includes("\n") || s.includes("\r")) stdout.write("\n");
	};
	try {
		return (await r.question("")).trim();
	} finally {
		out._writeToOutput = original;
	}
}

async function choose<T>(question: string, items: T[], label: (t: T) => string, extra?: string): Promise<number> {
	items.forEach((t, i) => say(`  ${bold(String(i + 1))}  ${label(t)}`));
	if (extra) say(`  ${bold("0")}  ${extra}`);
	for (;;) {
		const n = Number(await ask(question, items.length === 1 && !extra ? "1" : ""));
		if (Number.isInteger(n) && n >= (extra ? 0 : 1) && n <= items.length) return n - 1;
		say(yellow(`Please type a number from ${extra ? 0 : 1} to ${items.length}.`));
	}
}

// -- Cloudflare -------------------------------------------------------

interface CfResult<T> { ok: boolean; status: number; result: T | null; errors: { code: number; message: string }[] }

async function cf<T>(token: string, path: string): Promise<CfResult<T>> {
	try {
		const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
		const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] } | null;
		return { ok: res.ok && Boolean(body?.success), status: res.status, result: body?.result ?? null, errors: body?.errors ?? [] };
	} catch (e) {
		throw new Stop(`We couldn't reach Cloudflare. Please check your connection and run the command again. (${String(e)})`);
	}
}

const details = (r: CfResult<unknown>) => `HTTP ${r.status}${r.errors.length ? ` (${r.errors.map((e) => `${e.code}: ${e.message}`).join("; ")})` : ""}`;

async function getToken(): Promise<string> {
	let token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
	if (!token) {
		say(`The installer needs a Cloudflare API token to set things up on your account.\n${tokenHelp()}\n`);
		token = await askSecret("Paste your API token:");
	}
	if (!token) throw new Stop("No token, so nothing was changed.");
	const verify = await cf<{ status?: string }>(token, "/user/tokens/verify");
	if (!verify.ok || verify.result?.status !== "active") {
		throw new Stop(`Cloudflare didn't accept that API token. It needs to be an active user API token (not a Global API Key). ${details(verify)}`);
	}
	return token;
}

async function pickAccount(token: string, opts: Options, filter?: (id: string) => Promise<boolean>): Promise<{ id: string; name: string }> {
	const r = await cf<{ id: string; name: string }[]>(token, "/accounts?per_page=50");
	if (!r.ok) throw new Stop(`We couldn't list your Cloudflare accounts. Your token needs "Account Settings: Read". ${details(r)}`);
	let accounts = r.result ?? [];
	if (opts.account) {
		accounts = accounts.filter((a) => a.id === opts.account);
		if (!accounts.length) throw new Stop(`Your token can't reach account ${opts.account}.`);
	}
	if (filter) {
		const keep = await Promise.all(accounts.map((a) => filter(a.id)));
		accounts = accounts.filter((_, i) => keep[i]);
	}
	if (!accounts.length) throw new Stop(filter ? "Blog Builder isn't installed on any account this token can reach. To install it, run npx @mrpwob/blog-builder setup." : "Your token doesn't reach any Cloudflare account. Check its Account Resources.");
	if (accounts.length === 1) return accounts[0];
	say(bold("Which Cloudflare account?"));
	return accounts[await choose("Account:", accounts, (a) => `${a.name} ${dim(a.id)}`)];
}

// -- Running the install steps ----------------------------------------

function ctxFor(token: string, choice: BlogChoice): BlogRunContext {
	// The install steps read the release through a fetch-like reader; here it reads the files in this package.
	const assets = {
		fetch: async (req: Request) => {
			const path = new URL(req.url).pathname.replace(/^\/+/, "");
			if (path.split("/").includes("..")) return new Response("Not found", { status: 404 });
			try {
				return new Response(await readFile(new URL(path, RELEASE_DIR)));
			} catch {
				return new Response("Not found", { status: 404 });
			}
		},
	} as unknown as BlogRunContext["assets"];
	return { token, choice, assets, base: RELEASES_BASE };
}

function fail(result: BlogActionResult): never {
	say(red(`✗ ${forTerminal(result.message ?? "Something went wrong.")}`));
	if (result.link) say(`  ${result.link.text}: ${result.link.href}`);
	if (result.detail) say(dim(`  Cloudflare said: ${result.detail}`));
	if (/HTTP 40[13]\b/.test(result.detail ?? "")) say(`\n${tokenHelp()}`);
	say(dim("\nAnything already done is kept, so running the command again carries on from here."));
	throw new Stop("");
}

async function runSteps(token: string, choice: BlogChoice): Promise<{ hostname?: string; setupUrl?: string }> {
	let hostname: string | undefined;
	let setupUrl: string | undefined;
	for (const step of blogSteps()) {
		stdout.write(`${dim("…")} ${step.label}${tty ? "" : "\n"}`);
		for (const action of step.actions) {
			let result = await runBlogAction(action as BlogActionId, ctxFor(token, choice));
			while (result.ok && result.more) result = await runBlogAction(action as BlogActionId, ctxFor(token, choice));
			if (!result.ok) {
				if (tty) stdout.write("\n");
				fail(result);
			}
			hostname = result.hostname ?? hostname;
			setupUrl = result.setupUrl ?? setupUrl;
		}
		if (tty) stdout.write(`\r\x1b[2K`);
		say(`${green("✓")} ${step.label}`);
	}
	return { hostname, setupUrl };
}

function finished(hostname: string | undefined, setupUrl: string | undefined, update: boolean) {
	say();
	say(bold(update ? "Your blog is up to date." : "Your blog is installed."));
	if (hostname) say(`  It's at ${bold(`https://${hostname}`)}`);
	if (!update && setupUrl) {
		say(`  Finish setting it up here, where you make your admin account:`);
		say(`  ${bold(setupUrl)}`);
		say(dim("  Only this link can finish the set-up, so keep it to yourself. Running setup again makes a new one."));
	}
	if (!hostname?.endsWith(".workers.dev")) say(dim("  A brand-new address can take a few minutes to start working."));
	say();
	say(dim("When there's a new version, the Blog Builder page in your blog's admin tells you. Run npx @mrpwob/blog-builder update to install it."));
}

// -- Commands ---------------------------------------------------------

async function setup(opts: Options) {
	say(bold("Install Blog Builder on your Cloudflare account\n"));
	const token = await getToken();
	const account = await pickAccount(token, opts);

	if (await blogInstalled(token, account.id)) {
		say(yellow(`Blog Builder is already installed on ${account.name}.`));
		if (!(await confirm("Run setup again? This keeps your posts and can change the blog's address. (For a plain update, use npx @mrpwob/blog-builder update.)", opts))) return;
	}

	// The domain: one of the account's zones, or none for a trial on workers.dev.
	let domain = opts.domain;
	if (domain === undefined) {
		const zones = await cf<{ name: string; status: string }[]>(token, `/zones?account.id=${account.id}&per_page=50`);
		if (!zones.ok) throw new Stop(`We couldn't list your domains. Your token needs "Zone: Read". ${details(zones)}`);
		const active = (zones.result ?? []).filter((z) => z.status === "active");
		say(bold("\nWhich domain should your blog use?"));
		if (!active.length) say(dim("  No active domains on this account yet, so you can try it on your workers.dev address first."));
		const i = await choose("Domain:", active, (z) => z.name, "No domain yet: try it on my workers.dev address");
		domain = i < 0 ? "" : active[i].name;
	}

	let subdomain = opts.subdomain;
	if (domain && subdomain === undefined) subdomain = await ask(`\nWeb address: what goes before ${domain}? (Type @ for ${domain} itself.)`, BLOG_SUBDOMAIN);
	if (subdomain === "@") subdomain = "";

	let theme = opts.theme;
	if (theme === undefined) {
		say(bold("\nWhich theme to start with? You can change it any time in the admin."));
		theme = BLOG_THEMES[await choose("Theme:", BLOG_THEMES, (t) => `${t.name} ${dim(t.for)}`)].id;
	}

	let location = opts.location;
	if (location === undefined) {
		const places = Object.entries(BLOG_LOCATIONS);
		say(bold("\nWhere should your posts and pictures be kept? Pick the place nearest most of your readers."));
		location = places[await choose("Place:", places, ([, name]) => name)][0];
	}

	const choice = parseBlogChoice({ accountId: account.id, domain, subdomain, theme, location });
	if (!choice) throw new Stop("That domain, web address, theme or place doesn't look right. Please check it and run the command again.");

	const release = await loadBlogRelease(ctxFor(token, choice).assets, RELEASES_BASE);
	say(`\nInstalling Blog Builder ${release.version} on ${bold(account.name)}${choice.domain ? ` for ${bold(choice.domain)}` : ""}.\n`);
	const { hostname, setupUrl } = await runSteps(token, choice);
	finished(hostname, setupUrl, false);
}

/** The domain and address of an existing blog, from the custom domains attached to its Worker. */
async function existingChoice(token: string, accountId: string): Promise<BlogChoice> {
	const r = await cf<{ hostname: string; zone_name: string; service: string }[]>(token, `/accounts/${accountId}/workers/domains?service=${BLOG_SCRIPT}`);
	if (!r.ok) throw new Stop(`We couldn't read your blog's address. Your token needs "Workers: Admin". ${details(r)}`);
	const mine = (r.result ?? []).filter((d) => d.service === BLOG_SCRIPT);
	// The location only matters when storage is first made, so an update keeps whatever is there.
	if (!mine.length) return { accountId, domain: null, location: "weur" };
	let pick = mine[0];
	if (mine.length > 1) {
		say(bold("Your blog answers at more than one address. Which is the main one?"));
		pick = mine[await choose("Address:", mine, (d) => d.hostname)];
	}
	const zone = pick.zone_name.toLowerCase();
	const host = pick.hostname.toLowerCase();
	const subdomain = host === zone ? "" : subdomainOf(host, zone);
	if (subdomain === null) throw new Stop(`Your blog's address ${pick.hostname} isn't one this installer can update.`);
	return { accountId, domain: zone, subdomain, location: "weur" };
}

async function update(opts: Options) {
	say(bold("Update Blog Builder\n"));
	const token = await getToken();
	const account = await pickAccount(token, opts, (id) => blogInstalled(token, id));
	const choice = await existingChoice(token, account.id);

	const settings = await cf<{ bindings?: { name: string; type: string; text?: string }[] }>(token, `/accounts/${account.id}/workers/scripts/${BLOG_SCRIPT}/settings`);
	const current = settings.result?.bindings?.find((b) => b.name === "APP_VERSION")?.text ?? null;
	const release = await loadBlogRelease(ctxFor(token, choice).assets, RELEASES_BASE);
	if (!isNewer(release.version, current) && !opts.force) {
		say(`${green("✓")} Blog Builder ${release.version} is the latest version, and ${account.name} already has it.`);
		say(dim("  To run every step again anyway, add --force."));
		return;
	}
	say(`Updating ${bold(account.name)} from ${current ?? "an older build"} to ${bold(release.version)}.\n`);
	const { hostname } = await runSteps(token, choice);
	finished(hostname, undefined, true);
}

async function main() {
	let opts: Options;
	try {
		opts = parseArgs(process.argv.slice(2));
	} catch (e) {
		if (e instanceof UsageError) {
			say(red(e.message));
			process.exitCode = 2;
			return;
		}
		throw e;
	}
	try {
		if (opts.command === "version") say(CLI_VERSION);
		else if (opts.command === "help") say(`${HELP}\n${tokenHelp()}\n\nThemes: ${BLOG_THEMES.map((t) => t.id).join(", ")} (${DEFAULT_BLOG_THEME} is the default).`);
		else if (opts.command === "setup") await setup(opts);
		else await update(opts);
	} catch (e) {
		if (e instanceof Stop) {
			if (e.message) say(red(`\n${forTerminal(e.message)}`));
			process.exitCode = 1;
		} else {
			say(red(`\nSomething unexpected went wrong. Nothing is lost: please run the command again.\n${String((e as Error)?.stack ?? e)}`));
			process.exitCode = 1;
		}
	} finally {
		rl?.close();
	}
}

main();
