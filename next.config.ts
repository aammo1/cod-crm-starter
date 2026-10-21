import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Ship styles with the document instead of waiting for a blocking CSS fetch.
    inlineCss: true,
  },
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/better-sqlite3/prebuilds/**",
      "./migrations/**",
    ],
  },
};

export default nextConfig;
