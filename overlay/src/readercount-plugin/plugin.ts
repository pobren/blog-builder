/**
 * ReaderCount Plugin for EmDash
 *
 * Counts the blog's readers with ReaderCount (readercount.com), cookie-free
 * stats. Optional, and off until the owner switches it on in the plugin's
 * settings; then every public page carries ReaderCount's script, which also
 * proves to ReaderCount that the owner runs the blog.
 */

import { definePlugin } from "emdash";

const PAGE = "/readercount";
const SCRIPT = "https://app.readercount.com/s.js";
const STATS = "https://app.readercount.com/";
const SIGN_UP = "https://readercount.com/?ref=blog-builder";

/** "https://www.Example.com/post" -> "example.com", as ReaderCount names sites. */
function siteName(value: string): string | null {
	try {
		const host = new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
		return host.replace(/^www\./, "") || null;
	} catch {
		return null;
	}
}

function renderPage() {
	return {
		blocks: [
			{ type: "header", text: "ReaderCount stats" },
			{
				type: "section",
				text: "See how many people read your blog, where they come from and which posts they like, without cookies or banners.",
			},
			{
				type: "context",
				text: "1. Add your blog's address to your ReaderCount account. New to ReaderCount? Start a 30-day trial. 2. Switch on \"Count visitors\" in this plugin's settings. Your stats appear within a minute of the next visit.",
			},
			{
				type: "actions",
				elements: [
					{ type: "link", label: "Add my blog to ReaderCount", target: { kind: "external", url: SIGN_UP } },
					{ type: "link", label: "Open my stats", target: { kind: "external", url: STATS } },
				],
			},
		],
	};
}

/**
 * Create the ReaderCount plugin instance.
 * Called by the virtual module system at runtime.
 */
export function createPlugin() {
	return definePlugin({
		id: "readercount",
		version: "0.1.0",
		// Without this EmDash skips the page:fragments hook, as it can add scripts to every page.
		capabilities: ["hooks.page-fragments:register"],

		hooks: {
			"page:fragments": async (event, ctx) => {
				if (!((await ctx.settings.get<boolean>("enabled")) ?? false)) return null;
				const chosen = (await ctx.settings.get<string>("site"))?.trim();
				const site = siteName(chosen || event.page.url);
				if (!site) return null;
				return {
					kind: "external-script",
					placement: "head",
					src: SCRIPT,
					defer: true,
					attributes: { "data-site": site },
					key: "readercount",
				};
			},
		},

		routes: {
			admin: {
				permission: "plugins:read",
				handler: async () => {
					return renderPage();
				},
			},
		},

		admin: {
			pages: [{ path: PAGE, label: "ReaderCount", icon: "chart" }],
			settingsSchema: {
				enabled: {
					type: "boolean",
					label: "Count visitors",
					description: "Adds ReaderCount's small script to every page of your blog.",
					default: false,
				},
				site: {
					type: "string",
					label: "Website address in ReaderCount",
					description: "Leave empty to use your blog's own address.",
					default: "",
				},
			},
		},
	});
}
