// The Blog Builder release that the installer puts on someone's Cloudflare account.
//
// Blog Builder is EmDash's blog template with the files in overlay/ copied over it. `npm run build`
// (scripts/build.mjs) builds it, then `npm run package` (installer/package.ts) turns EmDash's dist/
// into the npm package's releases/:
//
//   releases/latest.json                 {"version": "<version>"}
//   releases/<version>/manifest.json     BlogManifest, below
//   releases/<version>/worker.json       every Worker module, {name: source}, in one file
//   releases/<version>/assets/<path>     the static assets (from dist/client)
//
// The Worker has a few hundred modules, so they travel in one file. No imports, so scripts and tests
// can load it with `node --experimental-strip-types`.

const CONTENT_TYPES: Record<string, string> = {
	js: "application/javascript",
	mjs: "application/javascript",
	css: "text/css",
	html: "text/html",
	json: "application/json",
	map: "application/json",
	txt: "text/plain",
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	ico: "image/x-icon",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	webmanifest: "application/manifest+json",
	wasm: "application/wasm",
};

export function extensionOf(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	const dot = file.lastIndexOf(".");
	return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
}

/** "application/null" tells Cloudflare to serve the file without a Content-Type, as Wrangler does. */
export function contentTypeFor(path: string): string {
	return CONTENT_TYPES[extensionOf(path)] ?? "application/null";
}

/** Server build files that are Worker modules. Wrangler's default rule is **\/*.js and **\/*.mjs. */
export function isWorkerModule(relativePath: string): boolean {
	return /\.(m?js)$/.test(relativePath) && !relativePath.startsWith(".vite/") && relativePath !== "wrangler.json";
}

export const BLOG_RELEASES_PATH = "/releases";

export interface BlogAsset {
	/** Path the asset is served at, starting with "/". */
	path: string;
	/** 32 hex characters: the start of a SHA-256 of the file's base64 plus its extension, as Wrangler does. */
	hash: string;
	size: number;
	contentType: string;
}

export interface BlogManifest {
	schema: 1;
	product: "blog";
	version: string;
	/** The EmDash commit this release is built from. */
	emdash: string;
	builtAt: string;
	worker: {
		mainModule: string;
		compatibilityDate: string;
		compatibilityFlags: string[];
		/** Module names, in the order they are uploaded. */
		modules: string[];
		crons: string[];
	};
	/** The contents of dist/client/_headers and _redirects, which Cloudflare takes as settings, not files. */
	headers: string | null;
	redirects: string | null;
	assets: BlogAsset[];
}

/** The parts of EmDash's dist/server/wrangler.json that we read. */
export interface BuiltBlogConfig {
	main?: string;
	compatibility_date?: string;
	compatibility_flags?: string[];
	triggers?: { crons?: string[] };
	d1_databases?: { binding: string }[];
	r2_buckets?: { binding: string }[];
	kv_namespaces?: { binding: string }[];
	images?: { binding: string };
	assets?: { binding?: string };
	durable_objects?: { bindings?: unknown[] };
}

/** The bindings the installer creates. A new EmDash version that wants others needs installer changes first. */
export const BLOG_BINDINGS = { db: "DB", media: "MEDIA", session: "SESSION", images: "IMAGES", assets: "ASSETS" } as const;

/** How often EmDash's maintenance job runs (scheduled posts and so on). Its template says every minute. */
export const BLOG_CRON = "*/5 * * * *";

/** Release versions end up in URLs, so keep them to safe characters. */
export function isSafeBlogVersion(version: string): boolean {
	return /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(version);
}

/** Checks the build has exactly the bindings the installer knows how to create. */
export function blogConfigProblems(config: BuiltBlogConfig): string[] {
	const problems: string[] = [];
	const want = (label: string, got: string[] | undefined, name: string) => {
		if (!got || got.length !== 1 || got[0] !== name) problems.push(`${label}: want ["${name}"], got ${JSON.stringify(got ?? [])}`);
	};
	if (!config.main) problems.push("no main module");
	if (!config.compatibility_date) problems.push("no compatibility_date");
	want("D1", config.d1_databases?.map((d) => d.binding), BLOG_BINDINGS.db);
	want("R2", config.r2_buckets?.map((b) => b.binding), BLOG_BINDINGS.media);
	want("KV", config.kv_namespaces?.map((k) => k.binding), BLOG_BINDINGS.session);
	if (config.images?.binding !== BLOG_BINDINGS.images) problems.push(`Images: want ${BLOG_BINDINGS.images}`);
	if ((config.assets?.binding ?? "") !== BLOG_BINDINGS.assets) problems.push(`Assets: want ${BLOG_BINDINGS.assets}`);
	if (config.durable_objects?.bindings?.length) problems.push("Durable Objects aren't supported by the installer yet");
	return problems;
}

export function isBlogManifest(value: unknown): value is BlogManifest {
	const m = value as BlogManifest;
	return Boolean(
		m &&
			m.schema === 1 &&
			m.product === "blog" &&
			typeof m.version === "string" &&
			isSafeBlogVersion(m.version) &&
			m.worker &&
			typeof m.worker.mainModule === "string" &&
			Array.isArray(m.worker.modules) &&
			m.worker.modules.includes(m.worker.mainModule) &&
			Array.isArray(m.assets),
	);
}
