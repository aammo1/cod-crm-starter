import type { NextConfig } from "next";
import { DEVICE_SIZES, IMAGE_SIZES } from "./src/config/image-sizes";
import rawStoreConfig from "./store.config";

const BASE_CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const CRM_CSP = `${BASE_CSP}; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`;
// HSTS is added at runtime by src/middleware.ts from CRM_PUBLIC_URL (https only), because
// headers() here is evaluated at build time when the Docker image has no runtime env.
const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Multiple root layouts (storefront vs CRM document): unmatched URLs use app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // The store locale is fixed at build time; inlining it lets the bundler ship only that dictionary.
  env: { NEXT_PUBLIC_STORE_LOCALE: (rawStoreConfig.locale as string) === "ar" ? "ar" : "fr" },
  // inlineCss removed: storefront pages are cached (ISR + Cloudflare), so a shared, cacheable
  // stylesheet beats re-sending the CSS inside every HTML/RSC response.
  images: {
    formats: ["image/avif", "image/webp"],
    // Uploads are stored as <nanoid>-<name>.<ext> (never overwritten), so they are immutable.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    deviceSizes: DEVICE_SIZES,
    imageSizes: IMAGE_SIZES,
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
  webpack(config, { isServer, dev }) {
    // The storefront layout chunk and each page chunk both import the cart/funnel stores, the
    // first-touch/tracking helpers. Without this group webpack copies those modules into every
    // route entry chunk (shipped and parsed twice on product and landing pages). Hoist them into
    // one shared chunk instead.
    const groups = config.optimization?.splitChunks?.cacheGroups;
    if (!isServer && !dev && groups && typeof groups === "object") {
      groups.storefrontShared = {
        test: /[\\/](?:src[\\/](?:stores[\\/](?:cart|cart-provider|funnel)|lib[\\/]storefront[\\/]track)\.tsx?)/,
        name: "storefront-shared",
        chunks: "all",
        minChunks: 2,
        priority: 40,
        enforce: true,
      };
    }
    return config;
  },
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
        // Storefront and APIs: no script-src (pixels load third-party scripts).
        source: "/:path((?!crm(?:/|$)|admin(?:/|$)|login(?:/|$)|api/media(?:/|$)).*)",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: BASE_CSP }],
      },
      {
        // CRM/admin/login: base policy plus same-origin resource limits. Next's inline bootstrap
        // needs 'unsafe-inline' (nonce-based CSP is out of scope). One header per route so
        // overlapping rules never duplicate the policy.
        source: "/crm/:path*",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: CRM_CSP }],
      },
      {
        source: "/admin/:path*",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: CRM_CSP }],
      },
      {
        source: "/login",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: CRM_CSP }],
      },
      {
        source: "/login/:path*",
        headers: [...BASE_HEADERS, { key: "Content-Security-Policy", value: CRM_CSP }],
      },
      {
        // The media route sets its own `default-src 'none'; sandbox` CSP; do not add another.
        source: "/api/media/:path*",
        headers: BASE_HEADERS,
      },
    ];
  },
};

export default nextConfig;
