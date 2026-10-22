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
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Anti-clickjacking for confirm/cancel/stock actions, no MIME sniffing.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
