import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export: deployable to any static host and bundle-able into Capacitor (webDir: "out").
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: true,
  partialPrefetching: true,
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
