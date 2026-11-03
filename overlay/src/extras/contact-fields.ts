/**
 * The contact form's own questions (25 Oct 2026). Every form asks for a name, an email address (so the owner can
 * reply) and a message; the owner adds up to 8 more, in order, each a short answer, a long answer, a phone number,
 * a choice from a list or a tick box, and each required or not. Kept in the contact plugin's `fields` setting.
 * No imports, so the tests can load it with Node.
 */

export type FieldType = "text" | "long" | "phone" | "choice" | "tick";
export const FIELD_TYPES: Record<FieldType, string> = { text: "Short answer", long: "Long answer", phone: "Phone number", choice: "Choice from a list", tick: "Tick box" };
export const MAX_FIELDS = 8;

export interface Field {
	id: string;
	label: string;
	type: FieldType;
	required: boolean;
	/** For a choice: the options, one per line in the admin. */
	options: string[];
}

const isType = (x: unknown): x is FieldType => typeof x === "string" && Object.hasOwn(FIELD_TYPES, x);

/** The owner's questions, from the setting, tidied; anything malformed is left out. */
export function readFields(x: unknown): Field[] {
	let v = x;
	if (typeof v === "string") {
		try {
			v = JSON.parse(v);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(v)) return [];
	const out: Field[] = [];
	for (const f of v as Record<string, unknown>[]) {
		const tidy = tidyField(f ?? {}, typeof f?.id === "string" ? f.id : "");
		if (!("error" in tidy) && tidy.id && !out.some((o) => o.id === tidy.id)) out.push(tidy);
		if (out.length >= MAX_FIELDS) break;
	}
	return out;
}

/** A question from the admin's form (or the setting). */
export function tidyField(v: Record<string, unknown>, id: string): Field | { error: string } {
	const label = typeof v.label === "string" ? v.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
	if (!label) return { error: "Please give the question a label." };
	const type = isType(v.type) ? v.type : "text";
	const raw = Array.isArray(v.options) ? v.options.join("\n") : typeof v.options === "string" ? v.options : "";
	// One per line; a single line is split at commas instead ("Small, Medium, Large"), unless that's all there is.
	const lines = /\n/.test(raw) ? raw.split(/\r?\n/) : raw.split(",");
	const options = type === "choice" ? [...new Set(lines.map((o) => o.trim().slice(0, 80)).filter(Boolean))].slice(0, 20) : [];
	if (type === "choice" && options.length < 2) return { error: "A choice needs at least two options, one per line." };
	const required = v.required === true || v.required === "true" || v.required === "yes" || (Array.isArray(v.required) && v.required.length > 0);
	return { id, label, type, required, options };
}

export const fieldId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A visitor's answers to the owner's questions, checked; the form sends each as `q_<id>`. */
export function readAnswers(fields: Field[], input: Record<string, unknown>): { answers: { label: string; value: string }[] } | { error: string } {
	const answers: { label: string; value: string }[] = [];
	for (const f of fields) {
		const raw = input[`q_${f.id}`];
		let value = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim().slice(0, f.type === "long" ? 5000 : 300) : "";
		if (f.type === "tick") value = raw === "on" || raw === "yes" || raw === true ? "Yes" : "";
		if (f.type === "choice" && value && !f.options.includes(value)) return { error: `Please choose one of the options for "${f.label}".` };
		if (f.type === "phone" && value && !/^[+()\d][\d\s().-]{5,24}$/.test(value)) return { error: `Please check the phone number for "${f.label}".` };
		if (f.required && !value) return { error: f.type === "tick" ? `Please tick "${f.label}".` : `Please answer "${f.label}".` };
		if (value) answers.push({ label: f.label, value });
	}
	return { answers };
}
