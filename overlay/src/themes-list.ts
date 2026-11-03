// Blog Builder themes (21 Oct 2026). Every blog runs one theme, picked on the Blog Builder page in the admin.
// New blogs get Notebook. Every theme is free. No imports, so scripts and tests can load it with
// `node --experimental-strip-types`.

export interface BlogTheme {
	id: string;
	name: string;
	/** One line on the look. */
	look: string;
	/** Who it suits. */
	for: string;
	/** Shows the business details strip (phone, address, opening hours) on the home page. */
	business?: boolean;
	/** The extra web font the theme loads, if any (overlay/astro.config.mjs). */
	font?: "serif" | "display";
	/** The theme's own home page (overlay/src/components/homes/<home>.astro); Notebook uses the template's. */
	home?: string;
}

export const DEFAULT_BLOG_THEME = "notebook";

export const BLOG_THEMES: BlogTheme[] = [
	{ id: "notebook", name: "Notebook", look: "Clean and bright, with a featured post and post cards.", for: "Anyone starting a blog." },
	{ id: "journal", home: "journal", name: "Journal", look: "One centred column of essays in serif type on warm paper, with nothing to distract from the words.", for: "Writers, essayists and thought-leadership blogs.", font: "serif" },
	{ id: "practice", home: "practice", name: "Practice", look: "Your firm's contact details beside your name, then articles as a clean, dated list.", for: "Accountants, solicitors, consultants and advisers.", business: true, font: "serif" },
	{ id: "local", home: "local", name: "Local", look: "A bold banner with a big call button and your opening hours, then your news as picture tiles.", for: "Trades, shops, salons and cafés.", business: true, font: "display" },
	{ id: "studio", home: "studio", name: "Studio", look: "Your work in an even grid of pictures, each with its title underneath.", for: "Designers, makers and creative studios.", font: "display" },
	{ id: "news", home: "news", name: "Company news", look: "A newsroom: updates grouped by month, each with its date and topic.", for: "Businesses posting news, launches and announcements." },
	{ id: "magazine", name: "Magazine", home: "magazine", look: "A front page like a newspaper: a lead story, a ranked list and a section for each category.", for: "Publishers, newsletters and blogs that post often.", font: "serif" },
	{ id: "portfolio", name: "Portfolio", home: "portfolio", look: "Your name set huge, then your work in big pictures that fill the screen.", for: "Designers, photographers, architects and studios.", font: "display" },
	{ id: "saas", name: "SaaS", home: "saas", look: "A product home page: a bold promise, a screenshot, an updates timeline and a big sign-up button.", for: "Creators, solo founders and small software businesses.", font: "display" },
	{ id: "letter", name: "Letter", home: "letter", look: "A personal letter: your newest issue up front, a sign-up box at the top and numbered past issues.", for: "Newsletter writers, columnists and personal blogs.", font: "serif" },
	{ id: "help", name: "Help centre", home: "help", look: "A big search box, your topics as tiles, popular articles and a way to get in touch.", for: "Product help, FAQs, policies and how-to guides." },
	{ id: "events", name: "Events", home: "events", look: "A night-time poster for your next event, date stubs on every listing and a big ticket button.", for: "Venues, clubs, festivals and event organisers.", business: true, font: "display" },
	{ id: "developer", name: "Developer", home: "developer", look: "A terminal-style welcome, your newest post in a window and every post listed by year.", for: "Developers, engineers and technical writers." },
	{ id: "gallery", name: "Gallery", home: "gallery", look: "A dark wall of pictures from edge to edge, with your name kept small so the work speaks.", for: "Photographers, illustrators and artists.", font: "display" },
	{ id: "podcast", name: "Podcast", home: "podcast", look: "Your show's artwork and a play button up front, the newest episode as a big card and every episode numbered.", for: "Podcasters and audio shows.", font: "display" },
	{ id: "hospitality", name: "Hospitality", home: "hospitality", look: "A full-width welcome picture, opening times, how to find you and a big booking button.", for: "Cafés, restaurants, bars, B&Bs and venues.", business: true, font: "serif" },
];

export function blogTheme(id: unknown): BlogTheme | undefined {
	return typeof id === "string" ? BLOG_THEMES.find((t) => t.id === id) : undefined;
}

/** The theme a blog shows: the one named, if it exists, otherwise Notebook. */
export function themeToShow(id: unknown): BlogTheme {
	return blogTheme(id) ?? blogTheme(DEFAULT_BLOG_THEME)!;
}

/** Where a theme's stylesheet lives on the blog. Notebook has none: it is the template's own look. */
export const themeStylesheet = (id: string): string | null => (id === DEFAULT_BLOG_THEME ? null : `/builder/themes/${id}.css`);
