// Deploys Blog Builder with Wrangler, for the Deploy to Cloudflare button and anyone deploying from the code.
// Builds first if needed (npm run build), then runs `wrangler deploy` in the built template, whose
// wrangler.jsonc the build wrote from this repo's wrangler.jsonc.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = join(root, ".emdash/templates/blog-cloudflare");
if (!existsSync(join(template, "dist/server/wrangler.json"))) {
	execFileSync("node", [join(root, "scripts/build.mjs")], { cwd: root, stdio: "inherit" });
}
execFileSync("corepack", ["pnpm", "exec", "wrangler", "deploy", ...process.argv.slice(2)], { cwd: template, stdio: "inherit" });
