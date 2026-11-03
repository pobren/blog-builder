// Blog Builder's Astro config. It replaces the one in EmDash's blog-cloudflare
// template at build time; the rest of the template is used as it is.
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

import { builderPlugin } from "./src/builder-plugin/index.mjs";
import { readerCountPlugin } from "./src/readercount-plugin/index.mjs";
import { blocksPlugin, checklistPlugin, contactPlugin, newsletterPlugin, sharePlugin } from "./src/extras/index.mjs";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
		// Wraps EmDash's endpoint so each size of each picture is made once and kept (src/image.ts).
		endpoint: { entrypoint: "./src/image.ts" },
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			admin: {
				// UK English only. The other admin languages add about 2 MB, which
				// would take the Worker over the 3 MB limit on Cloudflare's free plan.
				locales: ["en-GB"],
				logo: "/builder/logo.svg",
				siteName: "Blog Builder",
				footerLabel: "Blog Builder",
			},
			plugins: [builderPlugin(), readerCountPlugin(), sharePlugin(), newsletterPlugin(), contactPlugin(), checklistPlugin(), blocksPlugin()],
			// Updates come through the Blog Builder installer, not npm.
			updateCheck: false,
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		// Theme fonts (shared/blog-themes.ts): a theme's page only loads the one it uses.
		{
			provider: fontProviders.google(),
			name: "Source Serif 4",
			cssVariable: "--font-serif",
			weights: [400, 600, 700],
			styles: ["normal", "italic"],
			fallbacks: ["Georgia", "serif"],
		},
		{
			provider: fontProviders.google(),
			name: "Bricolage Grotesque",
			cssVariable: "--font-display",
			weights: [600, 800],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
