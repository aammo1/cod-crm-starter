import "server-only";

/** Copyable v1 contract. No CRM, framework, database or browser dependencies. */
export interface VariantOption { name: string; value: string }
export interface CatalogVariant {
  id: string; productId: string; sku: string; label: string;
  options: VariantOption[]; images: string[]; active: boolean; available: boolean;
}
export interface CatalogProduct {
  id: string; slug: string; name: string; category: string; price: number; currency: "MAD";
  description: string; story?: string; materials?: string[]; badge?: string;
  images: string[]; optionDefinitions: { name: string; values: string[] }[];
  variants: CatalogVariant[]; isBestSeller: boolean; active: boolean;
}
export interface CatalogResponse {
  products: CatalogProduct[]; nextCursor: string | null;
  settings: { storeName: string; currency: "MAD"; shippingFeeMad: number; freeShippingThresholdMad: number };
}
export interface Totals { itemsSubtotal: number; shipping: number; total: number; currency: "MAD" }
export interface UpsellOffer {
  offerId: string; productId: string; name: string; image: string;
  originalPrice: number; upsellPrice: number; expiresAt: string;
  variants: { variantId: string; label: string; options: VariantOption[]; available: boolean }[];
}
/** Supply only after storefront consent; never infer IP from the CRM connection. */
export interface Attribution {
  eventId: string; sourceUrl: string; fbp?: string; fbc?: string;
  clientIpAddress?: string; clientUserAgent?: string;
}
export interface CheckoutInput {
  customer: { name: string; phone: string };
  items: { variantId: string; qty: number }[]; meta?: Attribution;
}
export interface CheckoutResponse {
  orderId: string; totals: Totals; upsellOffer: UpsellOffer | null; orderToken: string;
}
export type UpsellInput = { action: "accept"; variantId: string } | { action: "decline" };
export interface UpsellResponse {
  orderId: string; upsellStatus: "pending" | "accepted" | "declined" | "expired" | "closed"; totals: Totals;
}

/** Deliberately excludes upstream text, URLs, bodies and transport error causes. */
export class StorefrontError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    readonly attempts = 0,
  ) {
    super("La demande boutique n’a pas pu aboutir.");
    this.name = "StorefrontError";
  }
}

export function configuredOrigin(value: string, production = process.env.NODE_ENV === "production"): string {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && !production && local))) throw 0;
    return url.origin;
  } catch { throw new StorefrontError(0, "INVALID_CONFIG", false); }
}

const transient = (status: number) => [408, 429, 500, 502, 503, 504].includes(status);
const safeCodes = new Set([
  "STOREFRONT_DISABLED", "UNAUTHORIZED", "BROWSER_ACCESS_FORBIDDEN", "FORBIDDEN", "RATE_LIMITED",
  "INVALID_REQUEST", "INVALID_REQUEST_KEY", "PAYLOAD_TOO_LARGE", "INVALID_ORDER_TOKEN", "INVALID_VARIANT",
  "INVALID_UPSELL_VARIANT", "IDEMPOTENCY_CONFLICT", "UPSELL_CLOSED", "META_EVENT_CONFLICT",
  "TOKEN_SECRET_CHANGED", "SERVICE_UNAVAILABLE", "RETRY_REQUEST", "CATALOG_UNAVAILABLE", "NOT_FOUND", "PRODUCT_NOT_FOUND",
]);
function requestKey(key: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new StorefrontError(0, "INVALID_REQUEST_KEY", false);
}
function pathSegment(value: string) {
  // Dot segments are normalized even when percent-encoded by URL/fetch.
  if (!value || value.length > 200 || value === "." || value === "..") {
    throw new StorefrontError(0, "INVALID_REQUEST", false);
  }
  return encodeURIComponent(value);
}
function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : undefined;
}

export interface StorefrontClientConfig {
  baseUrl: string; apiKey: string;
  /** Per-attempt deadline includes response body consumption; 1–30 seconds. */
  timeoutMs?: number;
  /** 0–2 automatic retries. Every POST reuses its exact serialized body/key. */
  maxRetries?: number;
}
export function createStorefrontClient(config: StorefrontClientConfig) {
  if (typeof window !== "undefined") throw new StorefrontError(0, "SERVER_ONLY", false);
  const origin = configuredOrigin(config.baseUrl);
  if (!/^[A-Za-z0-9._~+\/-]{32,}={0,2}$/.test(config.apiKey)) throw new StorefrontError(0, "INVALID_CONFIG", false);
  const timeoutMs = config.timeoutMs ?? 5000;
  const retries = config.maxRetries ?? 1;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000 ||
      !Number.isInteger(retries) || retries < 0 || retries > 2) throw new StorefrontError(0, "INVALID_CONFIG", false);

  async function call<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let failure: StorefrontError;
      try {
        const response = await fetch(`${origin}/api/storefront/v1/${path}`, {
          method: serialized === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json",
            ...(serialized === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
          body: serialized,
        });
        const data: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) throw new StorefrontError(0, "TIMEOUT", true, undefined, attempt);
        if (response.ok) {
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new StorefrontError(response.status, "INVALID_RESPONSE", false, undefined, attempt);
          }
          return data as T;
        }
        const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
        failure = new StorefrontError(response.status,
          typeof code === "string" && safeCodes.has(code) ? code : "UPSTREAM_ERROR",
          transient(response.status), retryAfter(response.headers.get("retry-after")), attempt);
      } catch (error) {
        failure = error instanceof StorefrontError ? error : new StorefrontError(0,
          controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR", true, undefined, attempt);
      } finally { clearTimeout(timer); }
      // Never truncate a long Retry-After and hammer the API early. Caller retains the key.
      if (!failure.retryable || attempt > retries || (failure.retryAfterSeconds ?? 0) > 2) throw failure;
      await new Promise((resolve) => setTimeout(resolve,
        Math.max(100 * 2 ** (attempt - 1), (failure.retryAfterSeconds ?? 0) * 1000)));
    }
  }
  return {
    listCatalog({ cursor, limit }: { cursor?: string; limit?: number } = {}): Promise<CatalogResponse> {
      if ((cursor !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) ||
          (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100))) {
        throw new StorefrontError(0, "INVALID_REQUEST", false);
      }
      const query = new URLSearchParams();
      if (cursor !== undefined) query.set("cursor", cursor);
      if (limit !== undefined) query.set("limit", String(limit));
      return call(`catalog${query.size ? `?${query}` : ""}`);
    },
    getProduct(slug: string): Promise<{ product: CatalogProduct }> { return call(`catalog/${pathSegment(slug)}`); },
    createOrder(input: CheckoutInput, { idempotencyKey }: { idempotencyKey: string }): Promise<CheckoutResponse> {
      requestKey(idempotencyKey);
      return call("orders", input, { "Idempotency-Key": idempotencyKey });
    },
    resolveUpsell(orderId: string, input: UpsellInput,
      { idempotencyKey, orderToken }: { idempotencyKey: string; orderToken: string }): Promise<UpsellResponse> {
      requestKey(idempotencyKey);
      if (!/^[A-Za-z0-9._~-]{1,512}$/.test(orderToken)) throw new StorefrontError(0, "INVALID_ORDER_TOKEN", false);
      return call(`orders/${pathSegment(orderId)}/upsell`, input,
        { "Idempotency-Key": idempotencyKey, "X-Order-Token": orderToken });
    },
  };
}
