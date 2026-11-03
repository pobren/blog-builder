/**
 * Descriptors for the plugins that come with Blog Builder
 * (21 Oct 2026): share buttons, newsletter sign-up, contact form and the
 * post checklist. Plain JavaScript so astro.config.mjs can import them while
 * Astro loads its configuration; each runtime plugin lives in its own .ts file.
 */

import { fileURLToPath } from "node:url";

/** @returns {import("emdash").PluginDescriptor} */
function native(id, file) {
	return {
		id,
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL(`./${file}`, import.meta.url)),
		options: {},
	};
}

export const sharePlugin = () => native("share", "share.ts");
export const newsletterPlugin = () => native("newsletter", "newsletter.ts");
export const contactPlugin = () => native("contact", "contact.ts");
export const checklistPlugin = () => native("checklist", "checklist.ts");

/** One-click "Sign-up box" and "Call to action" blocks for the editor, drawn on the site by blocks-astro.ts. */
export const blocksPlugin = () => ({ ...native("blocks", "blocks.ts"), componentsEntry: fileURLToPath(new URL("./blocks-astro.ts", import.meta.url)) });
