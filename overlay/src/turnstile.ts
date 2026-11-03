// Cloudflare Turnstile, the free robot check on the sign-up box and the contact form. It's on once the owner adds
// their own keys in the plugin's settings: create a widget for the blog's address under Turnstile in the
// Cloudflare dashboard, then paste its site key and secret key.

/** The site key a form shows. */
export const siteKeyFor = (own: string | null | undefined, _host?: string): string => (own ?? "").trim();

/** The secret that checks a form's answer, paired with the site key the form showed. */
export function secretFor(ownSiteKey: string | null | undefined, ownSecret: string | null | undefined, _host?: string): string {
	return (ownSiteKey ?? "").trim() ? (ownSecret ?? "").trim() : "";
}
