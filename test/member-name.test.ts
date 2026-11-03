// A member's name in the sign-up box and on the Members page (src/extras/member-name.ts):
// run with `node --experimental-strip-types --test test/member-name.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { askNameOf, cleanName, NAME_MAX } from "../overlay/src/extras/member-name.ts";

test("a name is trimmed, kept to one line and stripped of tags", () => {
	assert.equal(cleanName("  Amara   Okafor \n"), "Amara Okafor");
	assert.equal(cleanName("<b>Tom</b>"), "b Tom /b");
	assert.equal(cleanName(42), "");
	assert.equal(cleanName("x".repeat(200)).length, NAME_MAX);
});

test("asking for a name is optional unless the owner says otherwise", () => {
	assert.equal(askNameOf(undefined), "optional");
	assert.equal(askNameOf("required"), "required");
	assert.equal(askNameOf("off"), "off");
	assert.equal(askNameOf("nonsense"), "optional");
});
