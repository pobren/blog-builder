// The site side of the one-click blocks (blocks.ts): EmDash finds `blockComponents` through the plugin's
// componentsEntry and draws each block's `_type` with its component.
import SignupBlock from "../components/BlogSignupBlock.astro";
import CtaBlock from "../components/BlogCtaBlock.astro";

export const blockComponents = {
	"bb-signup": SignupBlock,
	"bb-cta": CtaBlock,
};
