import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // inlineCss removed: storefront pages are cached (ISR + Cloudflare), so a shared, cacheable
  // stylesheet beats re-sending the CSS inside every HTML/RSC response.
  images: {
    formats: ["image/avif", "image/webp"],
    // Uploads are stored as <nanoid>-<name>.<ext> (never overwritten), so they are immutable.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 256, 384],
    localPatterns: [
      { pathname: "/api/media/**" },
      { pathname: "/images/**" },
      { pathname: "/brand/**" },
    ],
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
        // The new-store wizard writes versioned filenames, so these are safe to cache forever.
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
