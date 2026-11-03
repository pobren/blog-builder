// Builds the npm package `@mrpwob/blog-builder` into npm/: the command-line installer (npm/cli.mjs) and the
// built blog it installs (npm/releases/). Run from the repo root after `npm run build`:
//
//   npm run package              uses the build in .emdash/templates/blog-cloudflare/dist
//   npm run package -- --dist <path to an EmDash blog-cloudflare dist folder>
//   cd npm && npm publish        publishes it (the release workflow does this for each tag)
//
// The version comes from release.json.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { BLOG_CRON, BLOG_RELEASES_PATH, blogConfigProblems, contentTypeFor, extensionOf, isSafeBlogVersion, isWorkerModule, type BlogManifest, type BuiltBlogConfig } from "./release.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmDir = join(root, "npm");
const outDir = join(npmDir, BLOG_RELEASES_PATH.slice(1));

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i > -1 ? process.argv[i + 1] : undefined;
}

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

const toPosix = (p: string) => p.split(sep).join("/");

/** Same idea as Wrangler: a hash of the base64 contents plus the extension, cut to 32 hex characters. */
function assetHash(file: string): string {
	const base64 = readFileSync(file).toString("base64");
	return createHash("sha256").update(base64 + extensionOf(file)).digest("hex").slice(0, 32);
}

const dist = resolve(arg("--dist") ?? join(root, ".emdash/templates/blog-cloudflare/dist"));
const serverDir = join(dist, "server");
const clientDir = join(dist, "client");
if (!existsSync(join(serverDir, "wrangler.json"))) throw new Error(`No ${toPosix(relative(root, serverDir))}/wrangler.json. Run \`npm run build\` first.`);

const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8")) as { version: string; emdash: { commit: string } };
if (!isSafeBlogVersion(release.version)) throw new Error(`release.json version "${release.version}" isn't safe for a URL.`);

const config = JSON.parse(readFileSync(join(serverDir, "wrangler.json"), "utf8")) as BuiltBlogConfig;
const problems = blogConfigProblems(config);
if (problems.length) throw new Error(`The blog build doesn't match what the installer sets up:\n- ${problems.join("\n- ")}`);

const modules = walk(serverDir).map((f) => toPosix(relative(serverDir, f))).filter(isWorkerModule).sort();
if (!modules.includes(config.main!)) throw new Error(`Main module ${config.main} is missing from dist/server.`);
const code: Record<string, string> = {};
for (const m of modules) code[m] = readFileSync(join(serverDir, m), "utf8");

// Wrangler skips these in the assets folder: _headers and _redirects become settings, and
// .assetsignore lists files that aren't for the public.
const ignored = new Set(["_headers", "_redirects", ".assetsignore"]);
const ignoreFile = join(clientDir, ".assetsignore");
if (existsSync(ignoreFile)) for (const line of readFileSync(ignoreFile, "utf8").split("\n")) if (line.trim() && !line.startsWith("#")) ignored.add(line.trim());
const readOptional = (name: string) => (existsSync(join(clientDir, name)) ? readFileSync(join(clientDir, name), "utf8") : null);

const assetFiles = walk(clientDir).filter((f) => !ignored.has(toPosix(relative(clientDir, f))));
const assets = assetFiles
	.map((f) => {
		const path = `/${toPosix(relative(clientDir, f))}`;
		return { path, hash: assetHash(f), size: statSync(f).size, contentType: contentTypeFor(path) };
	})
	.sort((a, b) => a.path.localeCompare(b.path));
const tooBig = assets.find((a) => a.size > 25 * 1024 * 1024);
if (tooBig) throw new Error(`${tooBig.path} is over Cloudflare's 25 MB limit for one file.`);

const manifest: BlogManifest = {
	schema: 1,
	product: "blog",
	version: release.version,
	emdash: release.emdash.commit,
	builtAt: new Date().toISOString(),
	worker: {
		mainModule: config.main!,
		compatibilityDate: config.compatibility_date!,
		compatibilityFlags: config.compatibility_flags ?? [],
		modules,
		crons: [BLOG_CRON],
	},
	headers: readOptional("_headers"),
	redirects: readOptional("_redirects"),
	assets,
};

// 1. The release.
rmSync(outDir, { recursive: true, force: true });
const out = join(outDir, release.version);
mkdirSync(out, { recursive: true });
for (const a of assetFiles) {
	const target = join(out, "assets", relative(clientDir, a));
	mkdirSync(dirname(target), { recursive: true });
	cpSync(a, target);
}
writeFileSync(join(out, "worker.json"), JSON.stringify(code));
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, "\t"));
writeFileSync(join(outDir, "latest.json"), JSON.stringify({ version: release.version }));

// 2. The command-line installer, in one file.
await build({
	entryPoints: [join(root, "installer/cli.ts")],
	outfile: join(npmDir, "cli.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	banner: { js: `#!/usr/bin/env node\n// Blog Builder installer ${release.version}. MIT licence. https://github.com/pobren/blog-builder` },
	define: { CLI_VERSION: JSON.stringify(release.version) },
});

// 3. The package's own files.
const pkg = JSON.parse(readFileSync(join(root, "installer/package.json"), "utf8"));
writeFileSync(join(npmDir, "package.json"), `${JSON.stringify({ ...pkg, version: release.version }, null, "\t")}\n`);
cpSync(join(root, "installer/README.md"), join(npmDir, "README.md"));
cpSync(join(root, "LICENSE"), join(npmDir, "LICENSE"));

const size = statSync(join(out, "worker.json")).size;
console.log(`@mrpwob/blog-builder ${release.version}: ${modules.length} Worker modules (${(size / 1048576).toFixed(1)} MB), ${assets.length} assets, in npm/`);
