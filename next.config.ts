import type { NextConfig } from "next";

// GitHub Pages serves project sites from /<repo>/; the deploy workflow passes it in (empty elsewhere).
const siteBase = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
// The English site is a second export of the same app under /en/ (scripts/build-site.mjs builds both).
const basePath = process.env.NEXT_PUBLIC_LANG === "en" ? `${siteBase}/en` : siteBase;

const nextConfig: NextConfig = {
  // Fully static export: deployable to any static host and bundle-able into Capacitor (webDir: "out").
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  // Cache Components / PPR need a server at request time and are incompatible with `output: "export"`;
  // every page here is a static shell that renders local (IndexedDB) data on the client.
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
