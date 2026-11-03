/**
 * One-click blocks for the post and page editor: type "/" and pick one.
 * - Sign-up box: the newsletter sign-up form, anywhere in a post or page.
 * - Call to action: a heading, a line and a button, such as "Book a call".
 * The site draws them with the components in blocks-astro.ts. Sign-ups and button presses show up in ReaderCount
 * like any form or link.
 */

import { definePlugin } from "emdash";

export function createPlugin() {
	return definePlugin({
		id: "blocks",
		version: "0.2.0",
		capabilities: [],
		admin: {
			portableTextBlocks: [
				{
					type: "bb-signup",
					label: "Sign-up box",
					icon: "mail",
					category: "Marketing",
					description: "Your newsletter sign-up form, right here",
					fields: [
						{ type: "text_input", action_id: "heading", label: "Heading", placeholder: "Get new posts by email" },
						{ type: "text_input", action_id: "blurb", label: "Line under the heading", placeholder: "Leave your email address and we'll let you know when there's something new." },
					],
				},
				{
					type: "bb-cta",
					label: "Call to action",
					icon: "link-external",
					category: "Marketing",
					description: "A heading, a line and a button",
					fields: [
						{ type: "text_input", action_id: "heading", label: "Heading", placeholder: "Enjoying this?" },
						{ type: "text_input", action_id: "text", label: "Line under the heading", placeholder: "Get every new post by email." },
						{ type: "text_input", action_id: "button", label: "Button text", placeholder: "Subscribe" },
						{ type: "text_input", action_id: "link", label: "Button link", placeholder: "/pages/about or https://..." },
						{
							type: "select",
							action_id: "look",
							label: "Look",
							options: [
								{ value: "bold", label: "Bold (dark box)" },
								{ value: "soft", label: "Soft (outlined box)" },
							],
						},
					],
				},
			],
		},
	});
}

export default createPlugin;
