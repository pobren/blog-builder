// A member's name, as a reader types it into the sign-up box or the blog owner edits it on the Members page.
// Asking for it is the owner's choice (the newsletter plugin's "askName" setting): off, optional or required.

export type AskName = "off" | "optional" | "required";

export const NAME_MAX = 80;

export function askNameOf(v: unknown): AskName {
	return v === "off" || v === "required" ? v : "optional";
}

/** Trimmed, one line, no control characters, at most NAME_MAX characters; "" when there's nothing. */
export function cleanName(v: unknown): string {
	if (typeof v !== "string") return "";
	return v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
}
