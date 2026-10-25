import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No generated agent files in this repository.
  agentRules: false,
  // No X-Powered-By header on responses.
  poweredByHeader: false,
  partialPrefetching: true,
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
