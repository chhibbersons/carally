import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard is per-user and per-dealer, so pages render on each request.
  // Cache Components is left off to keep data loading simple.
  serverExternalPackages: ["pino", "pino-pretty"],
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
