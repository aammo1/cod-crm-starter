import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { StorefrontProductView } from "@/lib/services/catalog";

export interface CustomSectionProps {
  product: StorefrontProductView;
  locale: "fr" | "ar";
}

/**
 * Registry of hand-made product sections. Map keys to products in
 * `store.config.ts` (`customSections: { "product-slug": ["key"] }`).
 * See README.md. Imports are lazy so an unmapped section is never bundled
 * into other product pages.
 */
export const customSections: Record<string, ComponentType<CustomSectionProps>> = {
  "example-feature-grid": dynamic(() => import("./example-feature-grid")),
};
