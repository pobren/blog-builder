import { test } from "node:test";
import assert from "node:assert/strict";
import { readAnswers, readFields, tidyField } from "../overlay/src/extras/contact-fields.ts";

test("questions are tidied and checked", () => {
	assert.deepEqual(tidyField({ label: " Budget ", type: "choice", options: "Under £1k\n£1k to £5k\nUnder £1k" }, "a"), { id: "a", label: "Budget", type: "choice", required: false, options: ["Under £1k", "£1k to £5k"] });
	assert.ok("error" in tidyField({ label: "Budget", type: "choice", options: "Just one" }, "a"));
	assert.deepEqual((tidyField({ label: "Size", type: "choice", options: "Small, Large" }, "b") as { options: string[] }).options, ["Small", "Large"]);
	assert.deepEqual((tidyField({ label: "Budget", type: "choice", options: "Under £1,000\n£1,000 or more" }, "c") as { options: string[] }).options, ["Under £1,000", "£1,000 or more"]);
	assert.ok("error" in tidyField({ label: "", type: "text" }, "a"));
	assert.equal(readFields("not json").length, 0);
	assert.equal(readFields([{ id: "a", label: "Company", type: "text" }, { id: "a", label: "Again" }]).length, 1);
});

test("answers are checked against the questions", () => {
	const fields = readFields([
		{ id: "co", label: "Company", type: "text", required: true },
		{ id: "ph", label: "Phone", type: "phone" },
		{ id: "bu", label: "Budget", type: "choice", options: ["Small", "Large"] },
		{ id: "ok", label: "I agree", type: "tick", required: true },
	]);
	assert.deepEqual(readAnswers(fields, { q_co: "Acme", q_ph: "+44 20 7946 0000", q_bu: "Large", q_ok: "on" }), {
		answers: [{ label: "Company", value: "Acme" }, { label: "Phone", value: "+44 20 7946 0000" }, { label: "Budget", value: "Large" }, { label: "I agree", value: "Yes" }],
	});
	assert.ok("error" in readAnswers(fields, { q_co: "", q_ok: "on" }));
	assert.ok("error" in readAnswers(fields, { q_co: "Acme", q_ok: "" }));
	assert.ok("error" in readAnswers(fields, { q_co: "Acme", q_ok: "on", q_bu: "Medium" }));
	assert.ok("error" in readAnswers(fields, { q_co: "Acme", q_ok: "on", q_ph: "call me" }));
});
