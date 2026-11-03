// Privacy-friendly embeds (21 Oct 2026).
//
// EmDash shows YouTube and Vimeo videos, maps and other embedded pages as
// iframes that load as soon as the page opens, so YouTube, Google and the
// rest learn about every reader. src/middleware.ts passes each public page
// through clickToLoad(), which swaps every iframe from another site for a
// placeholder with a button. The real iframe waits in a <template> and only
// goes in when the reader presses the button. YouTube then plays from
// youtube-nocookie.com, and Vimeo is asked not to track.
//
// Video thumbnails come through the blog itself (src/pages/embed/), so
// the placeholder doesn't reach YouTube or Vimeo either.

type Kind = "video" | "audio" | "map" | "content";

interface Provider {
	name: string;
	kind: Kind;
	/** The address the iframe gets when the reader presses the button. */
	src: string;
	/** "Open on YouTube": the same thing on the provider's own site. */
	open: string;
	thumb?: string;
}

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
const YOUTUBE_ID = /^\/embed\/([A-Za-z0-9_-]{11})/;
const VIMEO_ID = /^\/video\/(\d{1,12})/;
const GOOGLE_HOST = /(^|\.)google\.[a-z.]{2,6}$/;

const BUTTON: Record<Kind, string> = {
	video: "Play video",
	audio: "Play audio",
	map: "Show map",
	content: "Show content",
};

const NOTE: Record<Kind, (name: string) => string> = {
	video: (name) => `This video is hosted by ${name}. Playing it loads content from ${name}, which may set cookies.`,
	audio: (name) => `This audio is hosted by ${name}. Playing it loads content from ${name}, which may set cookies.`,
	map: (name) => `This map is from ${name}. Showing it loads content from ${name}, which may set cookies.`,
	content: (name) => `This is from ${name}. Showing it loads content from ${name}, which may set cookies.`,
};

function withParams(url: URL, params: Record<string, string>): string {
	const next = new URL(url);
	for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
	return next.href;
}

/** What an iframe from another site is, or null for one from the blog itself. */
export function providerFor(raw: string, page: URL): Provider | null {
	let url: URL;
	try {
		url = new URL(raw, page);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.host === page.host) return null;
	const host = url.hostname.toLowerCase();

	const youtube = YOUTUBE_HOST.test(host) && YOUTUBE_ID.exec(url.pathname);
	if (youtube) {
		const id = youtube[1];
		const src = new URL(url);
		src.hostname = "www.youtube-nocookie.com";
		return {
			name: "YouTube",
			kind: "video",
			src: withParams(src, { autoplay: "1" }),
			open: `https://www.youtube.com/watch?v=${id}`,
			thumb: `/embed/youtube/${id}`,
		};
	}
	const vimeo = host === "player.vimeo.com" && VIMEO_ID.exec(url.pathname);
	if (vimeo) {
		return {
			name: "Vimeo",
			kind: "video",
			src: withParams(url, { autoplay: "1", dnt: "1" }),
			open: `https://vimeo.com/${vimeo[1]}`,
			thumb: `/embed/vimeo/${vimeo[1]}`,
		};
	}
	if ((GOOGLE_HOST.test(host) && url.pathname.startsWith("/maps")) || host === "maps.google.com") {
		return { name: "Google Maps", kind: "map", src: url.href, open: url.href };
	}
	if (host.endsWith("openstreetmap.org")) return { name: "OpenStreetMap", kind: "map", src: url.href, open: url.href };
	if (host === "open.spotify.com") return { name: "Spotify", kind: "audio", src: url.href, open: url.href.replace("/embed/", "/") };
	if (host === "w.soundcloud.com") return { name: "SoundCloud", kind: "audio", src: url.href, open: url.href };
	if (host.endsWith("dailymotion.com")) return { name: "Dailymotion", kind: "video", src: url.href, open: url.href };
	return { name: host.replace(/^www\./, ""), kind: "content", src: url.href, open: url.href };
}

const MARKUP = /[&"<>]/g;
const ENTITIES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
const escape = (value: string) => value.replace(MARKUP, (char) => ENTITIES[char] ?? char);
const SIZE = /^\d{2,4}$/;
// HTMLRewriter hands over attribute values as written, with entities such as &amp; still in.
const ENTITY = /&(amp|quot|#39|#x27|lt|gt);/g;
const CHARS: Record<string, string> = { amp: "&", quot: '"', "#39": "'", "#x27": "'", lt: "<", gt: ">" };
const decode = (value: string) => value.replace(ENTITY, (_, name: string) => CHARS[name] ?? "");

/** The placeholder that stands in for one iframe. */
export function placeholder(attributes: Iterable<[string, string]>, page: URL): string | null {
	const attrs = new Map([...attributes].map(([name, value]) => [name.toLowerCase(), decode(value)]));
	if (attrs.has("data-bb-keep")) return null;
	const provider = providerFor(attrs.get("src") ?? "", page);
	if (!provider) return null;

	attrs.set("src", provider.src);
	attrs.delete("loading");
	if (provider.kind === "video" || provider.kind === "audio") {
		const allow = attrs.get("allow") ?? "";
		if (!/\bautoplay\b/.test(allow)) attrs.set("allow", allow ? `${allow}; autoplay` : "autoplay; fullscreen; picture-in-picture");
	}
	const frame = `<iframe ${[...attrs].map(([name, value]) => (value === "" ? name : `${name}="${escape(value)}"`)).join(" ")}></iframe>`;

	const width = attrs.get("width") ?? "";
	const height = attrs.get("height") ?? "";
	// A fixed width and height keep their shape; a fixed height alone (Spotify, SoundCloud) keeps its height.
	const size =
		SIZE.test(width) && SIZE.test(height)
			? ` style="--bb-ratio:${width}/${height};--bb-max:${width}px"`
			: SIZE.test(height)
				? ` style="aspect-ratio:auto;height:${height}px"`
				: "";
	const title = attrs.get("title")?.trim();
	const label = BUTTON[provider.kind];
	const thumb = provider.thumb ? `<img class="bb-embed-thumb" src="${provider.thumb}" alt="" loading="lazy" decoding="async">` : "";

	return (
		`<div class="bb-embed bb-embed-${provider.kind}"${size}>${thumb}` +
		`<div class="bb-embed-panel">` +
		`<button type="button" class="bb-embed-load" data-bb-load${title ? ` aria-label="${escape(`${label}: ${title}`)}"` : ""}>` +
		`<span class="bb-embed-icon" aria-hidden="true"></span>${label}</button>` +
		`<p class="bb-embed-note">${escape(NOTE[provider.kind](provider.name))} ` +
		`<a href="${escape(provider.open)}" target="_blank" rel="noopener noreferrer">Or open on ${escape(provider.name)}.</a></p>` +
		`</div><template>${frame}</template></div>`
	);
}

// Added once, before </body>, on pages that have a placeholder.
const ASSETS = `<style>
.bb-embed{position:relative;width:100%;max-width:var(--bb-max,100%);aspect-ratio:var(--bb-ratio,16/9);margin:1.5rem 0;min-height:150px;overflow:hidden;border-radius:12px;background:#111418;color:#fff;font-size:.95rem;line-height:1.45}
.emdash-embed-video>.bb-embed{position:absolute;inset:0;margin:0;max-width:none;aspect-ratio:auto;border-radius:0}
.emdash-iframe>.bb-embed{height:100%;margin:0;max-width:none;aspect-ratio:auto}
.bb-embed-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5;filter:blur(1px)}
.bb-embed-panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;padding:1.25rem;text-align:center;background:linear-gradient(180deg,rgba(10,12,15,.55),rgba(10,12,15,.8))}
.bb-embed-load{display:inline-flex;align-items:center;gap:.6rem;padding:.8rem 1.4rem;border:0;border-radius:999px;background:#fff;color:#111418;font:inherit;font-weight:600;font-size:1.05rem;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.35)}
.bb-embed-load:hover{background:#f1f3f5}
.bb-embed-load:focus-visible{outline:3px solid #fff;outline-offset:3px}
.bb-embed-icon{width:0;height:0;border-style:solid;border-width:.45em 0 .45em .75em;border-color:transparent transparent transparent currentColor}
.bb-embed-map .bb-embed-icon,.bb-embed-content .bb-embed-icon{display:none}
.bb-embed-note{max-width:34rem;margin:0;color:rgba(255,255,255,.9);font-size:.85rem;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.bb-embed-note a{color:#fff;text-decoration:underline}
.bb-embed-on{min-height:0}
.bb-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
@media (max-width:480px){.bb-embed-note{font-size:.78rem}.bb-embed-load{padding:.65rem 1.1rem;font-size:1rem}}
</style><script>
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-bb-load]");if(!b)return;var box=b.closest(".bb-embed"),t=box&&box.querySelector("template");if(!t)return;box.replaceChildren(t.content.cloneNode(true));box.classList.add("bb-embed-on");var f=box.querySelector("iframe");if(f)f.focus();});
</script>`;

/** The page with every iframe from another site waiting for a click. */
export function clickToLoad(response: Response, page: URL): Response {
	let swapped = 0;
	return new HTMLRewriter()
		.on("iframe", {
			element(element) {
				const html = placeholder(element.attributes, page);
				if (!html) return;
				element.replace(html, { html: true });
				swapped++;
			},
		})
		.on("body", {
			element(element) {
				element.onEndTag((end) => {
					if (swapped > 0) end.before(ASSETS, { html: true });
				});
			},
		})
		.transform(response);
}
