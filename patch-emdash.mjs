// Small changes to EmDash's source, made in the EmDash checkout before it builds (scripts/build.mjs runs this
// from the EmDash folder). The welcome after making an account said "Welcome to EmDash!" next to EmDash's
// logo; it now welcomes people to their blog, with the blog's own logo (admin.logo in astro.config.mjs). The
// edit-mode bar on the blog said "EmDash", and the starter posts were by "EmDash Editorial".
// Each change fails the build if EmDash's code has moved, so a new EmDash pin can't quietly undo it.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

function patch(file, pairs) {
	let text = readFileSync(file, "utf8");
	for (const [from, to] of pairs) {
		if (!text.includes(from)) throw new Error(`${file}: can't find ${JSON.stringify(from)}`);
		text = text.split(from).join(to);
	}
	writeFileSync(file, text);
}

// English and UK English: the admin can be in either (it follows the browser, or ?locale=en).
for (const locale of ["en", "en-GB"]) patch(`packages/admin/src/locales/${locale}/messages.po`, [
	['msgstr "Welcome to EmDash, {firstName}!"', 'msgstr "Welcome to your blog, {firstName}!"'],
	['msgstr "Welcome to EmDash!"', 'msgstr "Welcome to your blog!"'],
]);

patch("packages/admin/src/components/WelcomeModal.tsx", [
	['import { LogoIcon } from "./Logo.js";', 'import { useAdminBranding } from "../lib/admin-branding-context.js";\nimport { BrandIcon } from "./Logo.js";'],
	["\tconst { t } = useLingui();\n", "\tconst { t } = useLingui();\n\tconst branding = useAdminBranding();\n"],
	['<LogoIcon className="h-8 w-8" />', '<BrandIcon logoUrl={branding.logo} siteName={branding.siteName} className="h-8 w-8" />'],
]);

// The admin's browser tab showed EmDash's own icon unless the writer added a Site icon. It now shows the blog's
// (overlay/src/favicon.ts: the first letter of the blog's name), so a tab says which blog it is.
{
	const file = "packages/core/src/astro/routes/admin.astro";
	const text = readFileSync(file, "utf8");
	const emdashIcon = /<link\s+rel="icon"\s+href="data:image\/svg\+xml,[^"]*"\s*\/>/;
	if (!emdashIcon.test(text)) throw new Error(`${file}: can't find EmDash's default icon`);
	// And the blog's PNG home screen icon (overlay/src/touch-icon.ts): iPhones can't use an SVG one.
	writeFileSync(file, text.replace(emdashIcon, '<link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" />'));
}

patch("packages/core/src/visual-editing/toolbar.ts", [['<span class="emdash-tb-logo">EmDash</span>', '<span class="emdash-tb-logo">Editor</span>']]);

patch("templates/blog-cloudflare/seed/seed.json", [
	['"slug": "emdash-editorial",\n\t\t\t"displayName": "EmDash Editorial"', '"slug": "editorial",\n\t\t\t"displayName": "Editorial"'],
	["Built with Astro and EmDash. The source is open if you want to see how it works.", "This is your About page. Change it to tell readers who you are and what you write about."],
]);

// Block Kit links to other admin pages (a plugin's "Write a post" step, say) open in the same tab, like the admin's own
// links. Every other external link still opens a new tab.
patch("packages/blocks/src/elements/link.tsx", [
	['const external = element.target.kind === "external";', 'const external = element.target.kind === "external" && !(typeof location !== "undefined" && href.startsWith(location.origin + "/_emdash/admin"));'],
]);

// A plugin's editor button that goes to a page on the blog itself opens it in the same tab, like the admin's own links.
patch("packages/admin/src/components/SandboxedContentEditorActions.tsx", [
	['if (protocol === "http:" || protocol === "https:") {', 'if ((protocol === "http:" || protocol === "https:") && new URL(href).origin !== window.location.origin) {'],
]);

// Every button gets a small icon, picked from its words, on every plugin page and the Block Kit
// links that look like buttons. Badges in tables can be several tags, each coloured by what it says or by its own
// colour ({ text, color }).
const BUTTON_ICON = `
const BUTTON_ICONS: Array<[RegExp, Icon]> = [
	[/\\b(send|email|publish)/i, PaperPlaneTilt],
	[/spam|check|score|\\btest/i, ShieldCheck],
	[/\\bsave|keep\\b/i, FloppyDisk],
	[/turn on|switch on|start/i, ToggleRight],
	[/turn off|switch off|stop|pause/i, ToggleLeft],
	[/remove|delete|unsubscribe/i, Trash],
	[/\\bedit|change|rename/i, PencilSimple],
	[/stripe|connect|link/i, Plugs],
	[/download|export|csv/i, DownloadSimple],
	[/import|upload/i, UploadSimple],
	[/\\badd\\b|\\bnew\\b|create|set up/i, Plus],
	[/\\bup\\b|move up|higher/i, ArrowUp],
	[/\\bdown\\b|move down|lower/i, ArrowDown],
	[/refresh|again|retry|results/i, ArrowClockwise],
	[/stats|readercount/i, ChartBar],
	[/plan|pay/i, CreditCard],
	[/open|view|visit|see/i, ArrowSquareOut],
];
export function blogIconFor(label: string): Icon {
	for (const [re, icon] of BUTTON_ICONS) if (re.test(label)) return icon;
	return ArrowRight;
}
`;
const ICON_IMPORT = 'import { ArrowClockwise, ArrowDown, ArrowRight, ArrowSquareOut, ArrowUp, ChartBar, CreditCard, DownloadSimple, FloppyDisk, PaperPlaneTilt, PencilSimple, Plugs, Plus, ShieldCheck, ToggleLeft, ToggleRight, Trash, UploadSimple, type Icon } from "@phosphor-icons/react";\n';
patch("packages/blocks/src/elements/button.tsx", [
	['import { useCallback, useState } from "react";\n', 'import { useCallback, useState } from "react";\n' + ICON_IMPORT],
	["export function ButtonElementComponent(", BUTTON_ICON + "\nexport function ButtonElementComponent("],
	["<Button variant={variant} onClick={handleClick}>", "<Button variant={variant} onClick={handleClick} icon={blogIconFor(element.label)}>"],
]);
patch("packages/blocks/src/blocks/form.tsx", [
	['import { renderElement } from "../render-element.js";', 'import { renderElement } from "../render-element.js";\nimport { blogIconFor } from "../elements/button.js";'],
	['<Button type="submit" onClick={handleClick}>', '<Button type="submit" variant="primary" onClick={handleClick} icon={blogIconFor(block.submit.label)}>'],
]);
patch("packages/blocks/src/elements/link.tsx", [
	['import type { LinkElement, LinkTargetResolver } from "../types.js";', 'import type { LinkElement, LinkTargetResolver } from "../types.js";\nimport { blogIconFor } from "./button.js";'],
	["\t\t\t\texternal={external}\n\t\t\t>", "\t\t\t\texternal={external}\n\t\t\t\ticon={blogIconFor(element.label)}\n\t\t\t>"],
]);
patch("packages/blocks/src/blocks/table.tsx", [
	["function formatCell(value: unknown, format: TableColumn[\"format\"]): React.ReactNode {\n",
		`const TAG_COLOURS: Array<[RegExp, string]> = [
	[/not confirmed|pending|waiting|required|trial/i, "orange"],
	[/unsubscribed|stopped|failed|off\\b/i, "red"],
	[/subscribed|sent|active|paid|done|\\bon\\b/i, "green"],
	[/optional|free|draft/i, "neutral"],
];
function colouredTag(tag: unknown, i: number): React.ReactNode {
	const text = typeof tag === "object" && tag !== null ? String((tag as { text?: unknown }).text ?? "") : String(tag ?? "");
	const own = typeof tag === "object" && tag !== null ? (tag as { color?: unknown }).color : undefined;
	const color = typeof own === "string" && own ? own : (TAG_COLOURS.find(([re]) => re.test(text))?.[1] ?? "blue");
	return text ? <Badge key={i} variant={color as never}>{text}</Badge> : null;
}

function formatCell(value: unknown, format: TableColumn["format"]): React.ReactNode {
	if (format === "badge" && (Array.isArray(value) || (typeof value === "object" && value !== null))) {
		return <span className="inline-flex flex-wrap gap-1.5">{(Array.isArray(value) ? value : [value]).map(colouredTag)}</span>;
	}
	if (format === "badge" && typeof value === "string" && value) return colouredTag(value, 0);
`],
]);

// Blog Builder's own blocks (admin/blocks/BlogBlocks.tsx): Settings-style rows of icons with a line each, steps with
// the next one highlighted, and a big welcome with fireworks. Plugins send them like any other block.
copyFileSync(new URL("./admin/blocks/BlogBlocks.tsx", import.meta.url), "packages/blocks/src/blocks/builder.tsx");
patch("packages/blocks/src/validation.ts", [
	['\t"tab",\n]);', '\t"tab",\n\t"blog_rows",\n\t"blog_hero",\n\t"blog_records",\n\t"blog_cards",\n]);'],
	['\t\tcase "meter": {\n', `\t\tcase "blog_rows": {
			if (!Array.isArray(value.rows)) errors.push({ path: \`\${path}.rows\`, message: "Required field 'rows' must be an array" });
			else
				value.rows.forEach((row: unknown, i: number) => {
					if (!isRecord(row) || typeof row.title !== "string") return errors.push({ path: \`\${path}.rows[\${i}]\`, message: "Each row needs a title" });
					if (row.href !== undefined) validateLinkTarget(row.href, \`\${path}.rows[\${i}].href\`, errors);
					if (Array.isArray(row.elements)) row.elements.forEach((el: unknown, j: number) => validateElement(el, \`\${path}.rows[\${i}].elements[\${j}]\`, errors, policy));
				});
			break;
		}
		case "blog_cards": {
			if (!Array.isArray(value.cards)) errors.push({ path: \`\${path}.cards\`, message: "Required field 'cards' must be an array" });
			else
				value.cards.forEach((card: unknown, i: number) => {
					if (!isRecord(card) || typeof card.title !== "string") return errors.push({ path: \`\${path}.cards[\${i}]\`, message: "Each card needs a title" });
					if (Array.isArray(card.elements)) card.elements.forEach((el: unknown, j: number) => validateElement(el, \`\${path}.cards[\${i}].elements[\${j}]\`, errors, policy));
				});
			break;
		}
		case "blog_records": {
			if (!Array.isArray(value.records) || !value.records.every((r: unknown) => isRecord(r) && typeof r.type === "string" && typeof r.name === "string" && typeof r.value === "string"))
				errors.push({ path: \`\${path}.records\`, message: "Each record needs a type, name and value" });
			break;
		}
		case "blog_hero": {
			if (typeof value.title !== "string") errors.push({ path: \`\${path}.title\`, message: "Required field 'title' must be a string" });
			if (Array.isArray(value.elements)) value.elements.forEach((el: unknown, j: number) => validateElement(el, \`\${path}.elements[\${j}]\`, errors, policy));
			break;
		}
		case "meter": {
`],
]);
patch("packages/blocks/src/types.ts", [
	["\t| AccordionBlock;\n", "\t| AccordionBlock\n\t| import(\"./blocks/builder.js\").BlogRowsBlock\n\t| import(\"./blocks/builder.js\").BlogHeroBlock\n\t| import(\"./blocks/builder.js\").BlogRecordsBlock\n\t| import(\"./blocks/builder.js\").BlogCardsBlock;\n"],
]);
patch("packages/blocks/src/renderer.tsx", [
	['import { HeaderBlockComponent } from "./blocks/header.js";', 'import { HeaderBlockComponent } from "./blocks/header.js";\nimport { BlogCardsBlockComponent, BlogHeroBlockComponent, BlogRecordsBlockComponent, BlogRowsBlockComponent } from "./blocks/builder.js";'],
	['\t\tcase "meter":\n\t\t\treturn <MeterBlockComponent block={block} />;', '\t\tcase "meter":\n\t\t\treturn <MeterBlockComponent block={block} />;\n\t\tcase "blog_rows":\n\t\t\treturn <BlogRowsBlockComponent block={block} onAction={onAction} resolveLinkTarget={resolveLinkTarget} />;\n\t\tcase "blog_hero":\n\t\t\treturn <BlogHeroBlockComponent block={block} onAction={onAction} resolveLinkTarget={resolveLinkTarget} />;\n\t\tcase "blog_records":\n\t\t\treturn <BlogRecordsBlockComponent block={block} />;\n\t\tcase "blog_cards":\n\t\t\treturn <BlogCardsBlockComponent block={block} onAction={onAction} resolveLinkTarget={resolveLinkTarget} />;'],
]);

// The admin's uploads send a 64px copy of each JPEG or PNG for the blurred placeholder, as EmDash's server already
// accepts (the "thumbnail" form field, core/src/media/thumbnail.ts). Without it the blog decoded the whole photo in
// plain JavaScript, and the request could run out of CPU on anything much over a megapixel.
patch("packages/admin/src/lib/api/media.ts", [
	[
		'\tif (dimensions?.height) formData.append("height", String(dimensions.height));\n',
		'\tif (dimensions?.height) formData.append("height", String(dimensions.height));\n\tconst thumb = await smallThumbnail(file, dimensions);\n\tif (thumb) formData.append("thumbnail", thumb, thumb.type === "image/png" ? "thumbnail.png" : "thumbnail.jpg");\n',
	],
	[
		"async function uploadMediaDirect(",
		`/** A copy at most 64px across, for the server's placeholder. Null if the browser can't make one. */
async function smallThumbnail(file: File, dims: { width?: number; height?: number } | null | undefined): Promise<Blob | null> {
	const png = /^image\\/png$/i.test(file.type);
	if (!(png || /^image\\/jpe?g$/i.test(file.type)) || !dims?.width || !dims?.height) return null;
	try {
		const scale = Math.min(1, 64 / Math.max(dims.width, dims.height));
		const w = Math.max(1, Math.round(dims.width * scale));
		const h = Math.max(1, Math.round(dims.height * scale));
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();
		return await new Promise<Blob | null>((ok) => canvas.toBlob(ok, png ? "image/png" : "image/jpeg", 0.8));
	} catch {
		return null;
	}
}

async function uploadMediaDirect(`,
	],
]);

// "Empty site" at setup skips the starter posts and pages but kept the starter menu and footer, so a new blog had an
// About link to a page that didn't exist and a footer line about software and design. The About link now points at
// the starter About page itself, and a menu link to a starter page that wasn't made is left out. The footer's
// made-up line is gone; writers add their own in Widgets.
patch("packages/core/src/seed/apply.ts", [
	[
		"\t\tconst itemLocale = item.locale ?? locale;\n\n\t\t// Resolve reference if needed\n",
		"\t\tconst itemLocale = item.locale ?? locale;\n\t\tif (item.ref && item.type !== \"custom\" && item.type !== \"taxonomy\" && !seedIdMap.get(item.ref)) continue;\n\n\t\t// Resolve reference if needed\n",
	],
]);
{
	const file = "templates/blog-cloudflare/seed/seed.json";
	const seed = JSON.parse(readFileSync(file, "utf8"));
	const about = seed.menus?.find((m) => m.name === "primary")?.items?.find((i) => i.url === "/pages/about");
	if (!about || !seed.content?.pages?.some((p) => p.id === "about")) throw new Error(`${file}: can't find the About menu link and page`);
	delete about.url;
	Object.assign(about, { type: "page", ref: "about" });
	const footer = seed.widgetAreas?.find((a) => a.name === "footer");
	const before = footer?.widgets?.length ?? 0;
	if (footer) footer.widgets = footer.widgets.filter((w) => !JSON.stringify(w.content ?? "").includes("software, design"));
	if (!footer || footer.widgets.length === before) throw new Error(`${file}: can't find the starter footer line`);
	writeFileSync(file, `${JSON.stringify(seed, null, "\t")}\n`);
}
