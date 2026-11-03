// The blog's home screen icon for iPhones (src/touch-icon.ts).
import type { APIRoute } from "astro";
import { touchIconResponse } from "../touch-icon";

export const prerender = false;

export const GET: APIRoute = () => touchIconResponse();
