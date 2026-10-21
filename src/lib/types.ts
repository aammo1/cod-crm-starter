export type { CommerceProduct, CommerceVariant, PublicCommerceProduct, PublicCommerceVariant, ProductOptionDefinition, VariantOption } from "./commerce-types";

export type CategorySlug = string;

export interface Category {
  slug: CategorySlug;
  label: string;
  tagline: string;
  image: string;
}

export interface ProductColorSize {
  size: number;
  available: boolean;
}

export interface ProductColor {
  name: string;
  hex: string;
  images: string[];
  /** Per-size availability for this color (DB-backed, server-computed). */
  sizes: ProductColorSize[];
}

export type Badge = string;

/** TASK 20 COMPATIBILITY BRIDGE: copied presentation consumers only.
 * New catalog/order code must use commerce-types instead. */
export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  price: number;
  description: string;
  story: string;
  materials: string[];
  colors: ProductColor[];
  sizes: number[];
  badge?: Badge;
  isBestSeller?: boolean;
  upsellRef?: string;
  /** False when every variant is out of stock (product hidden from listings, PDP shows Épuisé). */
  anyAvailable: boolean;
}

export interface CrossSellProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  sizes: ProductColorSize[];
  color: {
    name: string;
    image: string;
  };
}

/** Cart-drawer cross-sell, computed server-side (snapshot for quick add). */
export interface CartCrossSellItem {
  id: string;
  name: string;
  price: number;
  image: string;
  colorName: string;
  sizes: ProductColorSize[];
}
