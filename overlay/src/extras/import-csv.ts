/**
 * Reading a list of subscribers to bring in (src/pages/import-subscribers.astro). Takes the CSV file another service
 * exports (WordPress with Jetpack or MailPoet, Mailchimp, Substack, Ghost, Beehiiv, ConvertKit) or a plain list,
 * and finds the email address on each line, whatever the column is called. Runs in the writer's browser.
 * No imports, so the tests can load it with Node.
 */

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

/** One CSV line's cells, with quoted cells ("a, b" and "say ""hi""") kept whole. */
export function csvCells(line: string): string[] {
	const out: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === "," || c === ";" || c === "\t") {
			out.push(cell);
			cell = "";
		} else cell += c;
	}
	out.push(cell);
	return out.map((x) => x.trim());
}

export interface FoundList {
	/** Each address once, in lower case, in the file's order. */
	emails: string[];
	/** Lines with no email address on them (the header line aside). */
	skipped: number;
	/** Addresses that were in the file more than once. */
	repeats: number;
}

/** Every email address in the file: the first one on each line. */
export function emailsFromCsv(text: string): FoundList {
	const seen = new Set<string>();
	const emails: string[] = [];
	let skipped = 0;
	let repeats = 0;
	const lines = text.replace(/^﻿/, "").split(/\r?\n/);
	lines.forEach((line, i) => {
		if (!line.trim()) return;
		const hit = csvCells(line).find((c) => EMAIL_RE.test(c.replace(/^mailto:/i, "")));
		if (!hit) {
			if (i > 0) skipped++;
			return;
		}
		const email = hit.replace(/^mailto:/i, "").toLowerCase();
		if (seen.has(email)) repeats++;
		else {
			seen.add(email);
			emails.push(email);
		}
	});
	return { emails, skipped, repeats };
}

/** The one-off email telling people they've been brought across, so nobody wonders who's writing to them. */
export function movedEmail(blogName: string, site: string, unsubscribeUrl: string): { subject: string; text: string; html: string } {
	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const subject = `${blogName} has a new home`;
	const text = `Hello,\n\nYou subscribed to ${blogName}, which has moved to a new home: ${site}\n\nYou don't need to do anything. New posts will keep coming to you by email, just as before.\n\nIf you'd rather not get them, unsubscribe here: ${unsubscribeUrl}\n`;
	const html = `<p>Hello,</p><p>You subscribed to ${esc(blogName)}, which has moved to a new home: <a href="${esc(site)}">${esc(site.replace(/^https?:\/\//, ""))}</a></p><p>You don't need to do anything. New posts will keep coming to you by email, just as before.</p><p style="color:#666;font-size:13px">If you'd rather not get them, <a href="${esc(unsubscribeUrl)}">unsubscribe here</a>.</p>`;
	return { subject, text, html };
}
