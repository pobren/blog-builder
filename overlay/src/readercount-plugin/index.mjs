/**
 * ReaderCount Plugin Descriptor
 *
 * Plain JavaScript so that astro.config.mjs can import it while Astro loads
 * its configuration. The runtime plugin lives in ./plugin.ts.
 */

import { fileURLToPath } from "node:url";

/**
 * Create the ReaderCount plugin descriptor.
 *
 * @returns {import("emdash").PluginDescriptor}
 */
export function readerCountPlugin() {
	return {
		id: "readercount",
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		options: {},
	};
}
