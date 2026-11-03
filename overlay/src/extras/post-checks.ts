/**
 * The post checklist's checks that look past the post itself (checklist.ts): links that lead nowhere, and affiliate
 * links without a word to say so. No imports, so the tests can load it with Node.
 */

/** Most links checked per post, so publishing never waits long. Each is a quick request from the blog itself. */
export const LINKS_CHECKED = 25;
const LINK_SECONDS = 5;

/** Every outside web address in a post's content (links in text, buttons, embeds), each once, in order. */
export function linksIn(content: unknown, site = ""): string[] {
	const found: string[] = [];
	const own = (() => {
		try {
			return site ? new URL(site).hostname : "";
		} catch {
			return "";
		}
	})();
	const walk = (v: unknown) => {
		if (Array.isArray(v)) return v.forEach(walk);
		if (!v || typeof v !== "object") return;
		for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
			if ((k === "href" || k === "url") && typeof x === "string" && /^https?:\/\//i.test(x)) {
				try {
					const u = new URL(x);
					if (u.hostname !== own && !found.includes(u.href)) found.push(u.href);
				} catch {
					// Not a real address: the editor's own link check will have said so.
				}
			} else walk(x);
		}
	};
	walk(content);
	return found;
}

/** The links that answered "this page is gone" (404 or 410). Anything else, including no answer, is let through. */
export async function brokenLinks(urls: string[], fetcher: typeof fetch = fetch): Promise<string[]> {
	const one = async (url: string): Promise<boolean> => {
		const ask = (method: string) => fetcher(url, { method, redirect: "follow", signal: AbortSignal.timeout(LINK_SECONDS * 1000), headers: { "user-agent": "Mozilla/5.0 (compatible; Blog Builder post checker)" } });
		try {
			let res = await ask("HEAD");
			// Some sites don't answer HEAD properly: ask again for the page itself.
			if (res.status === 404 || res.status === 405 || res.status === 403) res = await ask("GET");
			return res.status === 404 || res.status === 410;
		} catch {
			// No answer (slow, or a site that turns checkers away) says nothing for sure about the page: let it go.
			return false;
		}
	};
	const list = urls.slice(0, LINKS_CHECKED);
	const results = await Promise.all(list.map(one));
	return list.filter((_, i) => results[i]);
}

/** Addresses that pay the writer a commission: Amazon, and the big affiliate networks' link domains. */
const AFFILIATE = [
	/(^|\.)amzn\.(to|eu)$/,
	/(^|\.)awin1\.com$/,
	/(^|\.)prf\.hn$/,
	/(^|\.)(anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|qksrv\.net)$/,
	/(^|\.)shareasale\.com$/,
	/(^|\.)(go\.)?skimresources\.com$/,
	/(^|\.)linksynergy\.com$/,
	/(^|\.)(sjv\.io|pxf\.io|ojrq\.net|evyy\.net)$/,
	/(^|\.)partnerize\.com$/,
	/(^|\.)avantlink\.com$/,
	/(^|\.)tradedoubler\.com$/,
	/(^|\.)webgains\.com$/,
];

export function isAffiliate(url: string): boolean {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase();
		if (/(^|\.)amazon\.[a-z.]+$/.test(host) && u.searchParams.has("tag")) return true;
		return AFFILIATE.some((re) => re.test(host));
	} catch {
		return false;
	}
}

/** All the words in a post's content, for looking for a disclosure. */
export function wordsIn(content: unknown): string {
	const out: string[] = [];
	const walk = (v: unknown) => {
		if (Array.isArray(v)) return v.forEach(walk);
		if (!v || typeof v !== "object") return;
		const o = v as Record<string, unknown>;
		if (typeof o.text === "string") out.push(o.text);
		for (const x of Object.values(o)) if (x && typeof x === "object") walk(x);
	};
	walk(content);
	return out.join(" ");
}

/** Affiliate links in the post but nothing telling readers (the ASA and the FTC both expect it). */
export function needsDisclosure(content: unknown, links: string[]): boolean {
	if (!links.some(isAffiliate)) return false;
	return !/\b(affiliate|commission|sponsored|paid link|paid partnership|we may earn|i may earn|we earn|i earn|#ad)\b/i.test(wordsIn(content));
}
