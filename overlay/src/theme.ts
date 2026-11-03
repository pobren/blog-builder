// The theme this blog shows (21 Oct 2026). The owner picks it on the Blog Builder page in the admin (the
// "theme" setting); the installer's --theme sets the THEME variable, used until a theme is picked there. Every
// theme is free and every theme's stylesheet is on the blog; see src/themes-list.ts.
import { env } from "cloudflare:workers";
import { getPluginSetting } from "emdash";
import { themeStylesheet, themeToShow, type BlogTheme } from "./themes-list";

const vars = env as { THEME?: string; APP_VERSION?: string };

export interface ThemeInfo {
	theme: BlogTheme;
	/** The theme's stylesheet with the release in the address, so an update never shows an old copy. */
	stylesheet: string | null;
}

/** The theme to show for a theme id (or the installer's THEME when there's none). */
export function themeFor(id?: unknown): ThemeInfo {
	const theme = themeToShow(typeof id === "string" && id ? id : vars.THEME);
	const sheet = themeStylesheet(theme.id);
	return { theme, stylesheet: sheet ? `${sheet}?v=${encodeURIComponent(vars.APP_VERSION ?? "dev")}` : null };
}

/** The theme this blog shows. */
export async function currentTheme(): Promise<ThemeInfo> {
	let picked: string | undefined;
	try {
		picked = (await getPluginSetting<string>("builder", "theme")) ?? undefined;
	} catch {
		picked = undefined;
	}
	return themeFor(picked);
}

/** The business details the owner filled in on the Blog Builder page, for themes that show them. */
export interface BusinessDetails {
	phone: string;
	email: string;
	address: string;
	hours: string;
}

async function text(key: string): Promise<string> {
	try {
		return ((await getPluginSetting<string>("builder", key)) ?? "").trim();
	} catch {
		return "";
	}
}

export async function businessDetails(): Promise<BusinessDetails | null> {
	const [phone, email, address, hours] = await Promise.all([text("businessPhone"), text("businessEmail"), text("businessAddress"), text("openingHours")]);
	return phone || email || address || hours ? { phone, email, address, hours } : null;
}

/** A plugin switch from its own settings, with the plugin's default when the owner hasn't saved one. */
export async function pluginOn(plugin: string, key: string, fallback: boolean): Promise<boolean> {
	try {
		return (await getPluginSetting<boolean>(plugin, key)) ?? fallback;
	} catch {
		return fallback;
	}
}

/** The main button on some themes' home pages (Blog Builder settings), if the owner set one. */
export async function mainButton(): Promise<{ text: string; link: string } | null> {
	const [t, l] = await Promise.all([text("buttonText"), text("buttonLink")]);
	return t && /^(https?:\/\/|\/)/.test(l) ? { text: t, link: l } : null;
}
