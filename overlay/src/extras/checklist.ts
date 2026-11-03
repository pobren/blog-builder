/**
 * Post checklist for EmDash
 *
 * Before a post goes live, checks the things that are easy to forget: a short
 * description for Google and link previews, a title that isn't too long, and
 * a description (alt text) on every picture, for readers who use a screen
 * reader. If something is missing the post isn't published, and the owner is
 * told exactly what to fix. Owners can switch the check off.
 *
 * It also follows the post's links (post-checks.ts): a link to a page that's gone stops the post, and so do
 * affiliate links with no word telling readers. That part has its own switch.
 */

import { definePlugin } from "emdash";
import { brokenLinks, linksIn, needsDisclosure } from "./post-checks";

const TITLE_MAX = 70;

interface Block {
	_type?: string;
	alt?: unknown;
	images?: { alt?: unknown }[];
}

function hasText(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

/** What needs fixing before this post can go live, in plain words. */
export function postProblems(data: Record<string, unknown>): string[] {
	const problems: string[] = [];
	const title = typeof data.title === "string" ? data.title.trim() : "";
	if (title.length > TITLE_MAX) problems.push(`shorten the title to ${TITLE_MAX} characters or fewer (it's ${title.length}), so it isn't cut off in Google`);
	if (!hasText(data.excerpt)) problems.push("add an excerpt, which Google and link previews show under the title");
	const featured = data.featured_image as { alt?: unknown } | null | undefined;
	if (featured && typeof featured === "object" && !hasText(featured.alt)) problems.push("describe the featured picture (its alt text)");
	const body = Array.isArray(data.content) ? (data.content as Block[]) : [];
	let missing = 0;
	for (const block of body) {
		if (block?._type === "image" && !hasText(block.alt)) missing++;
		if (block?._type === "gallery" && Array.isArray(block.images)) missing += block.images.filter((i) => !hasText(i?.alt)).length;
	}
	if (missing) problems.push(missing === 1 ? "describe the picture in the post (its alt text)" : `describe the ${missing} pictures in the post (their alt text)`);
	return problems;
}

function sentence(problems: string[]): string {
	const list = problems.length === 1 ? problems[0] : `${problems.slice(0, -1).join("; ")}; and ${problems[problems.length - 1]}`;
	return `Nearly there. Before this goes live, please ${list}. You can switch this check off in the Post checklist plugin's settings.`;
}

export function createPlugin() {
	return definePlugin({
		id: "checklist",
		version: "0.2.0",
		capabilities: ["hooks.content-policy:register"],

		hooks: {
			"content:beforePublish": async (event, ctx) => {
				if (event.collection !== "posts") return;
				const content = event.content as { data?: Record<string, unknown> } & Record<string, unknown>;
				const data = content.data ?? content;
				if (!((await ctx.settings.get<boolean>("enabled")) ?? true)) return;
				const problems = postProblems(data);
				if ((await ctx.settings.get<boolean>("links")) ?? true) {
					const site = (ctx as { site?: { url?: string } }).site?.url ?? "";
					const links = linksIn(data.content, site);
					const broken = await brokenLinks(links);
					if (broken.length) problems.push(broken.length === 1 ? `fix or remove the link to ${broken[0]}, which leads to a page that isn't there` : `fix or remove ${broken.length} links that lead to pages that aren't there: ${broken.join(", ")}`);
					if (needsDisclosure(data.content, links)) problems.push("add a line telling readers the post has affiliate links (such as \"This post contains affiliate links: we may earn a commission if you buy through them\")");
				}
				if (problems.length) return { cancel: true, reason: sentence(problems) };
			},
		},

		admin: {
			settingsSchema: {
				enabled: {
					type: "boolean",
					label: "Check posts before they go live",
					description: "Asks for an excerpt, a title of 70 characters or fewer, and a description on every picture before a post is published.",
					default: true,
				},
				links: {
					type: "boolean",
					label: "Check links too",
					description: "Follows up to 25 links in each post and stops it going live if one leads to a page that isn't there, or if it has affiliate links without a line telling readers.",
					default: true,
				},
			},
		},
	});
}

export default createPlugin;
