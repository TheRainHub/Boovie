/**
 * Sub-path the static export is served from (e.g. "/Boovie" on GitHub Pages; empty for local, Capacitor and
 * root-domain hosting). next/link and the router add it automatically — plain URLs (images, fetch, workers,
 * service worker) go through `withBase`.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
