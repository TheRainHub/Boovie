/**
 * Sub-path the static export is served from (e.g. "/Boovie" on GitHub Pages; empty for local, Capacitor and
 * root-domain hosting). next/link and the router add it automatically — plain URLs (images, fetch, workers,
 * service worker) go through `withBase`.
 *
 * The site is built twice: in Russian at the root and in English under `/en/` (`NEXT_PUBLIC_LANG=en`; see
 * scripts/build-site.mjs). The files both share — store media, icons, workers, the service worker — live once, at
 * the root: `withBase` points there from either language, while the router's own base takes `/en` along.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/** The language this copy of the site was built in. */
export const SITE_LANG: "ru" | "en" = process.env.NEXT_PUBLIC_LANG === "en" ? "en" : "ru";

/** Where this copy's own pages are: the site's base, plus `/en` for the English one. */
export const PAGE_BASE = SITE_LANG === "en" ? `${BASE_PATH}/en` : BASE_PATH;

export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
