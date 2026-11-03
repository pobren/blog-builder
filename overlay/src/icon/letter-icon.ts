// Home screen icons drawn as PNGs in a Worker (no font or canvas there): letters in Inter Bold on a colour. iPhones
// ignore SVG icons and draw a plain letter tile instead, so anything that can go on a home screen needs a PNG. The letters are polygons from
// letter-icon-glyphs.ts, filled with 4 sub-rows a pixel and exact coverage across each row, so the edges are smooth
// at every size.

import { CAP_HEIGHT, GLYPHS } from "./letter-icon-glyphs.ts";
import { png } from "./png.ts";

export type IconShape = "any" | "full";
export type Rgb = [number, number, number];

const SUB = 4;

/** How much of each pixel the letters cover (0 to 1), centred, sized to sit inside a maskable icon's safe circle. */
function letters(text: string, size: number): Float32Array {
	const cover = new Float32Array(size * size);
	const glyphs = [...text].map((ch) => GLYPHS[ch]).filter(Boolean);
	if (!glyphs.length) return cover;
	const advance = glyphs.reduce((n, g) => n + g[0], 0);
	// Cap height about 36% of the icon for one letter; two letters shrink to keep within 58% of the width.
	const scale = Math.min((size * 0.36) / CAP_HEIGHT, (size * 0.58) / advance);
	// Edges in pixels (y down), with each glyph moved along by the ones before it.
	const edges: [number, number, number, number][] = [];
	let minX = Infinity, maxX = -Infinity, pen = 0;
	for (const [w, polys] of glyphs) {
		for (const poly of polys) {
			for (let i = 0; i < poly.length; i += 2) {
				const j = (i + 2) % poly.length;
				const x0 = (pen + poly[i]) * scale, y0 = -poly[i + 1] * scale, x1 = (pen + poly[j]) * scale, y1 = -poly[j + 1] * scale;
				edges.push([x0, y0, x1, y1]);
				minX = Math.min(minX, x0); maxX = Math.max(maxX, x0);
			}
		}
		pen += w;
	}
	const dx = (size - (maxX - minX)) / 2 - minX, dy = (size + CAP_HEIGHT * scale) / 2;
	for (const e of edges) { e[0] += dx; e[2] += dx; e[1] += dy; e[3] += dy; }
	const xs: [number, number][] = [];
	for (let sy = 0; sy < size * SUB; sy++) {
		const y = (sy + 0.5) / SUB, row = Math.floor(sy / SUB) * size;
		xs.length = 0;
		for (const [x0, y0, x1, y1] of edges) {
			if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push([x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
		}
		xs.sort((a, b) => a[0] - b[0]);
		// Non-zero winding: fill between crossings while inside, with the part-covered pixels at each end.
		let wind = 0;
		for (let k = 0; k < xs.length - 1; k++) {
			wind += xs[k][1];
			if (!wind) continue;
			const a = Math.max(0, xs[k][0]), b = Math.min(size, xs[k + 1][0]);
			if (b <= a) continue;
			const ia = Math.floor(a), ib = Math.floor(b);
			if (ia === ib) { cover[row + ia] += (b - a) / SUB; continue; }
			cover[row + ia] += (ia + 1 - a) / SUB;
			for (let x = ia + 1; x < ib; x++) cover[row + x] += 1 / SUB;
			if (ib < size) cover[row + ib] += (b - ib) / SUB;
		}
	}
	return cover;
}

/** How much of a pixel the rounded square covers ("any" icons; "full" fills the whole square for masks and iPhones). */
function squareCover(x: number, y: number, size: number): number {
	const inset = size / 30, r = size * 0.27, lo = inset + r, hi = size - inset - r;
	let n = 0;
	for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
		const px = x + (i + 0.5) / SUB, py = y + (j + 0.5) / SUB;
		const cx = Math.min(Math.max(px, lo), hi), cy = Math.min(Math.max(py, lo), hi);
		if (px >= inset && px <= size - inset && py >= inset && py <= size - inset && (px - cx) ** 2 + (py - cy) ** 2 <= r * r) n++;
	}
	return n / (SUB * SUB);
}

/** The letters (A-Z and 0-9 only) on a colour as a PNG. "full" fills the square edge to edge with no see-through
 * pixels, which is what iPhones and maskable icons want; "any" is a rounded square on a clear background. */
export async function letterIconPng(text: string, bg: Rgb, ink: Rgb, size: number, shape: IconShape): Promise<Uint8Array> {
	const cover = letters(text, size);
	const raw = new Uint8Array((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		const o = y * (size * 4 + 1);
		raw[o] = 0;
		for (let x = 0; x < size; x++) {
			const t = Math.min(1, cover[y * size + x]);
			const p = o + 1 + x * 4;
			for (let c = 0; c < 3; c++) raw[p + c] = Math.round(bg[c] * (1 - t) + ink[c] * t);
			raw[p + 3] = shape === "full" ? 255 : Math.round(255 * squareCover(x, y, size));
		}
	}
	return png(size, size, 6, raw);
}
