/** Browser-safe commerce contract. No runtime DB, auth or service imports. */
export interface VariantOption {
  name: string;
  value: string;
}

/** Ordered display axes; values are strings even for sizes or capacities. */
export interface ProductOptionDefinition {
  name: string;
  values: string[];
}

export interface CommerceVariant {
  id: string;
  productId: string;
  sku: string;
  label: string;
  options: VariantOption[];
  images: string[];
  active: boolean;
  /** Internal computed availability only; never expose exact balances publicly. */
  available: number;
}

export interface CommerceProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  /** Integer MAD, shared by all variants. */
  price: number;
  description: string;
  story?: string;
  materials?: string[];
  badge?: string;
  images: string[];
  /** Stored as products.option_definitions_json; display order is significant. */
  optionDefinitions: ProductOptionDefinition[];
  variants: CommerceVariant[];
  upsellRef?: string;
  isBestSeller: boolean;
  active: boolean;
}

export interface PublicCommerceVariant extends Omit<CommerceVariant, "available"> {
  available: boolean;
}

export interface PublicCommerceProduct extends Omit<CommerceProduct, "variants"> {
  variants: PublicCommerceVariant[];
}

/** Persisted items_json / upsell_items_json snapshots, never live catalog joins. */
export interface CommerceOrderItem {
  product_id: string;
  variant_id: string;
  sku: string;
  name: string;
  variant_label: string;
  options: VariantOption[];
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CommerceStoreSettings {
  storeName: string;
  shippingFeeMad: number;
  freeShippingThresholdMad: number;
  upsellEnabled: boolean;
  upsellWindowSeconds: number;
  upsellDiscountPercent: number;
}

export interface PublicStoreSettings {
  storeName: string;
  currency: "MAD";
  shippingFeeMad: number;
  freeShippingThresholdMad: number;
}

export interface StorefrontCatalogResponse {
  products: PublicCommerceProduct[];
  nextCursor: string | null;
  settings: PublicStoreSettings;
}

export interface StorefrontProductResponse {
  product: PublicCommerceProduct;
}

export interface CommerceTotals {
  itemsSubtotal: number;
  shipping: number;
  total: number;
  currency: "MAD";
}

export interface UpsellOfferVariant {
  readonly variantId: string;
  readonly label: string;
  readonly options: ReadonlyArray<Readonly<VariantOption>>;
  readonly available: boolean;
}

/** Immutable upsell_offer_json snapshot; deadline also in orders.upsell_expires_at. */
export interface CommerceUpsellOffer {
  readonly offerId: string;
  readonly productId: string;
  readonly name: string;
  readonly image: string;
  readonly originalPrice: number;
  readonly upsellPrice: number;
  readonly expiresAt: string;
  readonly variants: ReadonlyArray<UpsellOfferVariant>;
}

export interface StorefrontCheckoutRequest {
  customer: { name: string; phone: string };
  items: Array<{ variantId: string; qty: number }>;
  /** Validated by the server attribution schema, never inferred from CRM transport. */
  meta?: Record<string, unknown>;
}

export interface StorefrontCheckoutResponse {
  orderId: string;
  totals: CommerceTotals;
  upsellOffer: CommerceUpsellOffer | null;
  orderToken: string;
}

export type StorefrontUpsellRequest =
  | { action: "accept"; variantId: string }
  | { action: "decline" };

export type CommerceUpsellStatus = "pending" | "accepted" | "declined" | "expired" | "closed";

export interface StorefrontUpsellResponse {
  orderId: string;
  upsellStatus: CommerceUpsellStatus;
  totals: CommerceTotals;
}

export interface StorefrontErrorResponse {
  error: { code: string; message: string };
}

export type StorefrontReceiptScope = "checkout" | `upsell:${string}`;
/** response_json NEVER contains orderToken. Reconstruct via the persisted nonce.
 * AUTH_SECRET rotation changes derived tokens; retain the issuing secret for replay.
 * Receipts have no TTL. Lookup must precede catalog/quota checks.
 */
export type StorefrontCheckoutReceiptSnapshot = Omit<StorefrontCheckoutResponse, "orderToken">;

/** Row contract for storefront_request_receipts (JSON decoded by its consumer). */
export interface StorefrontRequestReceipt {
  scope: StorefrontReceiptScope;
  request_key: string;
  request_hash: string;
  order_id: string;
  response_json: string;
  created_at: string;
}
