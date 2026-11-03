// The blog's default tab icon: run with `node --experimental-strip-types --test test/favicon.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { faviconColour, faviconLetter, faviconRgb, faviconSvg, touchIconLetter } from "../overlay/src/favicon.ts";
import { letterIconPng } from "../overlay/src/icon/letter-icon.ts";

test("the first letter of the blog's name, skipping a leading The", () => {
	assert.equal(faviconLetter("porto walks"), "P");
	assert.equal(faviconLetter("The Daily Notes"), "D");
	assert.equal(faviconLetter("  42 things"), "4");
	assert.equal(faviconLetter("Élan"), "É");
	assert.equal(faviconLetter(""), "B");
	assert.equal(faviconLetter(undefined), "B");
});

test("the same name always gets the same colour, and the SVG is safe", () => {
	assert.equal(faviconColour("My Blog"), faviconColour("my blog "));
	assert.match(faviconSvg("<script>"), /^<svg /);
	assert.doesNotMatch(faviconSvg("<script>"), /<script>/);
});

test("the home screen icon is the same letter and colour, as an opaque 180 by 180 PNG", async () => {
	assert.equal(touchIconLetter("Élan"), "E");
	assert.equal(touchIconLetter("the porto walks"), "P");
	assert.equal(touchIconLetter("東京"), "");
	assert.deepEqual(faviconRgb("My Blog"), [1, 3, 5].map((i) => parseInt(faviconColour("My Blog").slice(i, i + 2), 16)));
	const png = await letterIconPng(touchIconLetter("My Blog"), faviconRgb("My Blog"), [255, 255, 255], 180, "full");
	const b = Buffer.from(png);
	assert.equal(b.subarray(1, 4).toString(), "PNG");
	assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [180, 180]);
	const pixels = inflateSync(b.subarray(41, 41 + b.readUInt32BE(33)));
	// Every pixel fully opaque: see-through ones turn black on an iPhone.
	for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++) assert.equal(pixels[y * (180 * 4 + 1) + 1 + x * 4 + 3], 255);
});
