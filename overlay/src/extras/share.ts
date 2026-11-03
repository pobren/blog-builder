/**
 * Share buttons for EmDash
 *
 * Plain share links under each post: LinkedIn, Facebook, X, Bluesky,
 * WhatsApp, email and copy link. They are ordinary links, so nothing from
 * those sites loads until a reader presses one. The buttons themselves are
 * drawn by src/components/BlogShare.astro, which reads this switch.
 *
 * The owner's social profiles live here too (social.ts): icons in the footer of every page, and their X and
 * Bluesky handles credited in shares.
 */

import { definePlugin } from "emdash";
import { NETWORKS } from "./social";

export function createPlugin() {
	return definePlugin({
		id: "share",
		version: "0.2.0",
		admin: {
			settingsSchema: {
				enabled: {
					type: "boolean",
					label: "Show share buttons under each post",
					description: "Plain links to LinkedIn, Facebook, X, Bluesky, WhatsApp and email, plus Copy link. Nothing from those sites loads until a reader presses one.",
					default: true,
				},
				...Object.fromEntries(
					NETWORKS.map((n) => [
						`social_${n.id}`,
						{
							type: "string",
							label: `Your ${n.label}`,
							description: n.base ? `Your ${n.label} handle (like @yourname) or the full address of your profile. Shown as an icon in the footer.` : `The full address of your ${n.label} profile, starting https://. Shown as an icon in the footer.`,
						},
					]),
				),
			},
		},
	});
}

export default createPlugin;
