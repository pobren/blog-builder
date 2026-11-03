// Blog Builder's own Block Kit blocks, copied into EmDash's blocks package by patch-emdash.mjs.
//
// blog_rows: a card of rows like EmDash's Settings page. Each row has an icon, a title, a line of explanation,
// optional coloured tags, and on the right a button, switch or link, or a whole-row link with an arrow. A row can
// be a step ("done", "next" or "todo"), with the next one highlighted, for Start here.
//
// blog_hero: a big welcome at the top of a page. With `celebrate`, fireworks the first time this browser sees it.
//
// blog_records: DNS records to add, each name and value exactly as typed with a copy button (Email sending).
import { Badge } from "@cloudflare/kumo";
import {
	Article,
	CaretRight,
	ChartBar,
	ChatCircle,
	Check,
	Copy,
	CreditCard,
	DownloadSimple,
	EnvelopeSimple,
	Gear,
	Globe,
	House,
	type Icon,
	Image,
	Lightning,
	LockSimple,
	Megaphone,
	PaperPlaneTilt,
	PencilSimpleLine,
	Plugs,
	Question,
	RocketLaunch,
	ShieldCheck,
	Sparkle,
	Star,
	Tag,
	TextAa,
	UploadSimple,
	UserPlus,
	Users,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { renderElement } from "../render-element.js";
import type { ActionElement, BlockInteraction, LinkTarget, LinkTargetResolver } from "../types.js";

const ICONS: Record<string, Icon> = {
	article: Article,
	chart: ChartBar,
	chat: ChatCircle,
	card: CreditCard,
	download: DownloadSimple,
	envelope: EnvelopeSimple,
	gear: Gear,
	globe: Globe,
	home: House,
	image: Image,
	lightning: Lightning,
	lock: LockSimple,
	megaphone: Megaphone,
	send: PaperPlaneTilt,
	pencil: PencilSimpleLine,
	plugs: Plugs,
	question: Question,
	rocket: RocketLaunch,
	shield: ShieldCheck,
	sparkle: Sparkle,
	star: Star,
	tag: Tag,
	text: TextAa,
	upload: UploadSimple,
	"user-plus": UserPlus,
	users: Users,
};

/** The colours a tag or icon can be: Kumo's badge colours. */
const COLOURS = new Set(["orange", "green", "red", "blue", "purple", "teal", "neutral"]);
const TINTS: Record<string, string> = {
	orange: "#ea580c",
	green: "#16a34a",
	red: "#dc2626",
	blue: "#2563eb",
	purple: "#7c3aed",
	teal: "#0d9488",
	neutral: "#64748b",
};

// Inline styles rather than Tailwind classes: the admin's stylesheet doesn't scan this package, so new classes wouldn't exist.
const CIRCLE = { display: "grid", placeItems: "center", width: 40, height: 40, flexShrink: 0, borderRadius: 999 } as const;
const ROW = { display: "flex", alignItems: "center", gap: 16, padding: "16px 20px" } as const;

export interface BlogTag {
	text: string;
	color?: string;
}

export interface BlogRow {
	icon?: string;
	/** Tints the icon's circle. */
	color?: string;
	title: string;
	text?: string;
	tags?: Array<string | BlogTag>;
	/** Buttons, switches or links on the right. */
	elements?: ActionElement[];
	/** The whole row goes here, with an arrow. */
	href?: LinkTarget;
	/** For steps: done rows are ticked and quiet, the next one is highlighted. */
	state?: "done" | "next" | "todo";
	number?: number;
}

export interface BlogRowsBlock {
	type: "blog_rows";
	block_id?: string;
	title?: string;
	text?: string;
	rows: BlogRow[];
}

export interface BlogHeroBlock {
	type: "blog_hero";
	block_id?: string;
	title: string;
	text?: string;
	/** Fireworks the first time this browser sees this key. */
	celebrate?: string;
	/** Progress through the steps, 0 to 1, shown as a bar. */
	progress?: number;
	progress_label?: string;
	elements?: ActionElement[];
}

function tagOf(tag: string | BlogTag, i: number) {
	const t = typeof tag === "string" ? { text: tag } : tag;
	const color = t.color && COLOURS.has(t.color) ? t.color : "neutral";
	return (
		<Badge key={i} variant={color as never}>
			{t.text}
		</Badge>
	);
}

/** Links in a row look like buttons, beside the row's other buttons, rather than underlined text. */
const asButton = (el: ActionElement): ActionElement => (el.type === "link" && !el.appearance ? { ...el, appearance: "secondary" } : el);

function RowIcon({ row }: { row: BlogRow }) {
	if (row.state === "done")
		return (
			<span style={{ ...CIRCLE, background: "#16a34a", color: "#fff" }} aria-hidden="true">
				<Check size={20} weight="bold" />
			</span>
		);
	const I = (row.icon && ICONS[row.icon]) || null;
	const tint = TINTS[row.color && COLOURS.has(row.color) ? row.color : row.state === "next" ? "orange" : "neutral"];
	return (
		<span style={{ ...CIRCLE, background: `${tint}1a`, color: tint, fontWeight: 700 }} aria-hidden="true">
			{I ? <I size={20} weight="bold" /> : row.number}
		</span>
	);
}

export function BlogRowsBlockComponent({
	block,
	onAction,
	resolveLinkTarget,
}: {
	block: BlogRowsBlock;
	onAction: (interaction: BlockInteraction) => void;
	resolveLinkTarget?: LinkTargetResolver;
}) {
	return (
		<section style={{ display: "grid", gap: 12 }}>
			{block.title && <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{block.title}</h2>}
			{block.text && (
				<p className="text-kumo-subtle" style={{ margin: 0 }}>
					{block.text}
				</p>
			)}
			<div className="divide-y divide-kumo-line border border-kumo-line bg-kumo-base" style={{ overflow: "hidden", borderRadius: 12 }}>
				{block.rows.map((row, i) => {
					const href = row.href ? (resolveLinkTarget?.(row.href) ?? null) : null;
					const next = row.state === "next";
					const done = row.state === "done";
					const body = (
						<>
							<RowIcon row={row} />
							<div style={{ minWidth: 0, flex: 1 }}>
								<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
									<span className={done ? "text-kumo-subtle" : undefined} style={{ fontWeight: done ? 500 : 600 }}>
										{row.number && !done && row.icon ? `${row.number}. ` : ""}
										{row.title}
									</span>
									{next && <span style={{ background: TINTS.orange, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>Next</span>}
									{row.tags?.map(tagOf)}
								</div>
								{row.text && (
									<p className="text-kumo-subtle" style={{ margin: "2px 0 0", fontSize: 14 }}>
										{row.text}
									</p>
								)}
							</div>
						</>
					);
					const style = next ? { ...ROW, boxShadow: `inset 4px 0 0 ${TINTS.orange}`, background: `${TINTS.orange}0d` } : ROW;
					if (href && !row.elements?.length) {
						const external = row.href?.kind === "external" && !href.startsWith(location.origin);
						return (
							<a
								key={i}
								href={href}
								target={external ? "_blank" : undefined}
								rel={external ? "noopener noreferrer" : undefined}
								className="hover:bg-kumo-tint"
								style={{ ...style, color: "inherit", textDecoration: "none" }}
							>
								{body}
								<CaretRight size={18} className="text-kumo-subtle" style={{ flexShrink: 0 }} aria-hidden="true" />
							</a>
						);
					}
					return (
						<div key={i} style={{ ...style, flexWrap: "wrap" }}>
							<div style={{ display: "flex", flex: "1 1 260px", minWidth: 0, alignItems: "center", gap: 16 }}>{body}</div>
							{row.elements?.length ? (
								<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
									{row.elements.map((el, j) => (
										<div key={j}>{renderElement(asButton(el), onAction, undefined, resolveLinkTarget)}</div>
									))}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</section>
	);
}

/** A short burst of fireworks over the page, drawn on a canvas that removes itself. */
function fireworks(host: HTMLElement) {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "60" });
	document.body.appendChild(canvas);
	const dpr = window.devicePixelRatio || 1;
	canvas.width = innerWidth * dpr;
	canvas.height = innerHeight * dpr;
	const g = canvas.getContext("2d");
	if (!g) return canvas.remove();
	g.scale(dpr, dpr);
	const colours = ["#ea580c", "#f59e0b", "#16a34a", "#2563eb", "#db2777", "#7c3aed"];
	type P = { x: number; y: number; vx: number; vy: number; life: number; c: string };
	const parts: P[] = [];
	const box = host.getBoundingClientRect();
	const burst = (x: number, y: number) => {
		const c = colours[Math.floor(Math.random() * colours.length)]!;
		for (let i = 0; i < 70; i++) {
			const a = (Math.PI * 2 * i) / 70;
			const s = 2 + Math.random() * 4;
			parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 60 + Math.random() * 30, c });
		}
	};
	let t = 0;
	const shots = 7;
	const step = () => {
		if (t % 18 === 0 && t / 18 < shots) burst(box.left + Math.random() * box.width, Math.max(60, box.top + Math.random() * Math.min(box.height + 120, innerHeight / 2)));
		g.clearRect(0, 0, innerWidth, innerHeight);
		for (const p of parts) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += 0.06;
			p.vx *= 0.985;
			p.life -= 1;
			g.globalAlpha = Math.max(0, p.life / 90);
			g.fillStyle = p.c;
			g.beginPath();
			g.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
			g.fill();
		}
		for (let i = parts.length - 1; i >= 0; i--) if (parts[i]!.life <= 0) parts.splice(i, 1);
		t++;
		if (t < 18 * shots || parts.length) requestAnimationFrame(step);
		else canvas.remove();
	};
	requestAnimationFrame(step);
}

export function BlogHeroBlockComponent({
	block,
	onAction,
	resolveLinkTarget,
}: {
	block: BlogHeroBlock;
	onAction: (interaction: BlockInteraction) => void;
	resolveLinkTarget?: LinkTargetResolver;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!block.celebrate || !ref.current) return;
		const key = `bb-celebrated:${block.celebrate}`;
		try {
			if (localStorage.getItem(key)) return;
			localStorage.setItem(key, new Date().toISOString());
		} catch {
			return;
		}
		fireworks(ref.current);
	}, [block.celebrate]);
	const pct = typeof block.progress === "number" ? Math.round(Math.min(1, Math.max(0, block.progress)) * 100) : null;
	return (
		<div
			ref={ref}
			style={{
				position: "relative",
				overflow: "hidden",
				borderRadius: 16,
				padding: "clamp(24px, 4vw, 32px)",
				color: "#fff",
				boxShadow: "0 12px 28px -14px rgba(234, 88, 12, 0.6)",
				background: "linear-gradient(135deg, #ea580c 0%, #f59e0b 55%, #fbbf24 100%)",
			}}
		>
			<Sparkle size={140} weight="fill" style={{ position: "absolute", right: -24, top: -24, opacity: 0.2, pointerEvents: "none" }} aria-hidden="true" />
			<h2 style={{ position: "relative", margin: 0, fontSize: "clamp(24px, 3vw, 30px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{block.title}</h2>
			{block.text && <p style={{ position: "relative", margin: "8px 0 0", maxWidth: 672, fontSize: 17, opacity: 0.92 }}>{block.text}</p>}
			{pct !== null && (
				<div style={{ position: "relative", marginTop: 20, maxWidth: 448 }}>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, fontWeight: 600 }}>
						<span>{block.progress_label ?? "Set-up"}</span>
						<span>{pct}%</span>
					</div>
					<div style={{ height: 10, overflow: "hidden", borderRadius: 999, background: "rgba(255, 255, 255, 0.3)" }}>
						<div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "#fff" }} />
					</div>
				</div>
			)}
			{block.elements?.length ? (
				<div className="bb-hero-actions" style={{ position: "relative", marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
					<style>{".bb-hero-actions a, .bb-hero-actions button { background: #fff !important; color: #c2410c !important; border-color: #fff !important; }"}</style>
					{block.elements.map((el, i) => (
						<div key={i}>{renderElement(el, onAction, undefined, resolveLinkTarget)}</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export interface BlogRecordsBlock {
	type: "blog_records";
	block_id?: string;
	/** The domain they go on: names are shown without it as well, as most DNS hosts add it themselves. */
	domain?: string;
	records: Array<{ type: string; name: string; value: string; priority?: number; why?: string; optional?: boolean }>;
}

function CopyText({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
			<code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, wordBreak: "break-all", minWidth: 0 }}>{text}</code>
			<button
				type="button"
				aria-label={`Copy ${label}`}
				className="border border-kumo-line bg-kumo-base hover:bg-kumo-tint"
				style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, borderRadius: 8, padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
				onClick={() => {
					navigator.clipboard?.writeText(text).then(
						() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						},
						() => undefined,
					);
				}}
			>
				{copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
				{copied ? "Copied" : "Copy"}
			</button>
		</span>
	);
}

export function BlogRecordsBlockComponent({ block }: { block: BlogRecordsBlock }) {
	const short = (name: string) => (block.domain && name.endsWith(`.${block.domain}`) ? name.slice(0, -(block.domain.length + 1)) : name);
	return (
		<div className="divide-y divide-kumo-line border border-kumo-line bg-kumo-base" style={{ overflow: "hidden", borderRadius: 12 }}>
			{block.records.map((r, i) => (
				<div key={i} style={{ padding: "14px 20px", display: "grid", gap: 8 }}>
					<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
						<span style={{ ...CIRCLE, width: 28, height: 28, fontSize: 13, background: `${TINTS.orange}1a`, color: TINTS.orange, fontWeight: 700 }}>{i + 1}</span>
						<Badge variant={"blue" as never}>{r.type}</Badge>
						{r.optional && <Badge variant={"neutral" as never}>Only if you have none</Badge>}
						{r.why && (
							<span className="text-kumo-subtle" style={{ fontSize: 14 }}>
								{r.why}
							</span>
						)}
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "minmax(70px, auto) 1fr", gap: "6px 12px", alignItems: "center" }}>
						<span className="text-kumo-subtle" style={{ fontSize: 13 }}>
							Name
						</span>
						<div style={{ display: "grid", gap: 4, minWidth: 0 }}>
							<CopyText text={short(r.name)} label="name" />
							{short(r.name) !== r.name && (
								<span className="text-kumo-subtle" style={{ fontSize: 12 }}>
									In full: {r.name} (some DNS hosts want this instead)
								</span>
							)}
						</div>
						{r.priority != null && (
							<>
								<span className="text-kumo-subtle" style={{ fontSize: 13 }}>
									Priority
								</span>
								<CopyText text={String(r.priority)} label="priority" />
							</>
						)}
						<span className="text-kumo-subtle" style={{ fontSize: 13 }}>
							{r.type === "TXT" ? "Content" : r.type === "MX" ? "Mail server" : "Points to"}
						</span>
						<CopyText text={r.value} label="value" />
					</div>
				</div>
			))}
		</div>
	);
}

export interface BlogCardsBlock {
	type: "blog_cards";
	block_id?: string;
	title?: string;
	text?: string;
	cards: Array<{ image?: string; title: string; text?: string; tags?: Array<string | BlogTag>; elements?: ActionElement[]; current?: boolean }>;
}

// blog_cards: a grid of picture cards (the Theme page): a picture, a name with tags, a line, and its buttons.
export function BlogCardsBlockComponent({
	block,
	onAction,
	resolveLinkTarget,
}: {
	block: BlogCardsBlock;
	onAction: (interaction: BlockInteraction) => void;
	resolveLinkTarget?: LinkTargetResolver;
}) {
	return (
		<section style={{ display: "grid", gap: 12 }}>
			{block.title && <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{block.title}</h2>}
			{block.text && (
				<p className="text-kumo-subtle" style={{ margin: 0 }}>
					{block.text}
				</p>
			)}
			<div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
				{block.cards.map((c, i) => (
					<article
						key={i}
						className="border border-kumo-line bg-kumo-base"
						style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 12, ...(c.current ? { boxShadow: `0 0 0 2px ${TINTS.orange}` } : {}) }}
					>
						{c.image && <img src={c.image} alt="" loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "16 / 10", objectFit: "cover", objectPosition: "top", borderBottom: "1px solid rgba(0,0,0,.08)" }} />}
						<div style={{ display: "grid", gap: 6, padding: "12px 14px", flex: 1, alignContent: "start" }}>
							<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
								<span style={{ fontWeight: 600 }}>{c.title}</span>
								{c.tags?.map(tagOf)}
							</div>
							{c.text && (
								<p className="text-kumo-subtle" style={{ margin: 0, fontSize: 14 }}>
									{c.text}
								</p>
							)}
						</div>
						{c.elements?.length ? (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 14px 14px" }}>
								{c.elements.map((el, j) => (
									<div key={j}>{renderElement(asButton(el), onAction, undefined, resolveLinkTarget)}</div>
								))}
							</div>
						) : null}
					</article>
				))}
			</div>
		</section>
	);
}
