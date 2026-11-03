/**
 * Blog Builder plugin descriptor
 *
 * Plain JavaScript so that astro.config.mjs can import it while Astro loads
 * its configuration. The runtime plugin lives in ./plugin.ts, which EmDash
 * imports by absolute path, so the plugin needs no npm package.
 */

import { fileURLToPath } from "node:url";

/**
 * Create the Blog Builder plugin descriptor.
 *
 * @returns {import("emdash").PluginDescriptor}
 */
export function builderPlugin() {
	return {
		id: "builder",
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		options: {},
	};
}
