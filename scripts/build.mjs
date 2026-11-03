// Builds Blog Builder: EmDash's blog template at the commit pinned in release.json, with our small changes
// to EmDash (patch-emdash.mjs) and our files from overlay/ copied over the template.
//
//   npm run build                    checks EmDash out into .emdash/ (first time only) and builds it
//   npm run build -- --emdash <dir>  uses an EmDash checkout you already have, at the pinned commit
//
// Needs git, Node.js 22 and corepack (for pnpm). The result is in .emdash/templates/blog-cloudflare/dist,
// which `npm run package` turns into the installer's release.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = JSON.parse(readFileSync(join(root, "release.json"), "utf8"));
const { repo, commit } = release.emdash;
const i = process.argv.indexOf("--emdash");
const emdash = resolve(i > -1 ? process.argv[i + 1] : join(root, ".emdash"));
const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=6144`.trim() };
const run = (cmd, args, cwd = emdash) => execFileSync(cmd, args, { cwd, stdio: "inherit", env });
const git = (args) => execFileSync("git", args, { cwd: emdash, encoding: "utf8" }).trim();

// 1. EmDash at the pinned commit, with nothing else changed.
if (!existsSync(join(emdash, ".git"))) {
	mkdirSync(emdash, { recursive: true });
	run("git", ["init", "-q"]);
	run("git", ["remote", "add", "origin", `https://github.com/${repo}.git`]);
}
let head = "";
try {
	head = git(["rev-parse", "HEAD"]);
} catch {
	head = "";
}
if (head !== commit) {
	console.log(`Fetching EmDash ${commit.slice(0, 10)}…`);
	run("git", ["fetch", "-q", "--depth", "1", "origin", commit]);
	run("git", ["checkout", "-q", "--force", "FETCH_HEAD"]);
}
// Undo any earlier build's changes, so the patches apply to EmDash's own code.
run("git", ["checkout", "-q", "--", "."]);
run("git", ["clean", "-q", "-fd"]);

// 2. Our changes to EmDash itself, then EmDash's packages.
run("node", [join(root, "patch-emdash.mjs")]);
run("corepack", ["pnpm", "install", "--frozen-lockfile"]);
run("corepack", ["pnpm", "build"]);

// 3. The blog template with our files over it.
const template = join(emdash, "templates/blog-cloudflare");
cpSync(join(root, "overlay"), template, { recursive: true });
writeFileSync(join(template, ".blog-builder-version"), `${release.version}\n`);
run("corepack", ["pnpm", "build"], template);

console.log(`\nBlog Builder ${release.version} built in ${join(template, "dist")}.\nNext: npm run package`);
