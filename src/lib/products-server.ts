import { listStorefront, getStorefrontProduct, type StorefrontProductView } from "@/lib/services/catalog";
import type { CartCrossSellItem, CategorySlug, Product } from "@/lib/types";

/**
 * Compatibility layer between the DB-backed catalog service and the UI's
 * `Product` shape. Server-side only: client components receive products as
 * props from RSC pages (and cart lines carry a snapshot added at add-to-cart
 * time), so nothing here is ever bundled for the browser.
 */

export function toUiProduct(view: StorefrontProductView): Product {
  const sizes = new Set<number>();
  for (const color of view.colors) {
    for (const entry of color.sizes) sizes.add(Number(entry.size));
  }
  return {
    id: view.id,
    slug: view.slug,
    name: view.name,
    category: view.category,
    price: view.price,
    description: view.description,
    story: view.story,
    materials: view.materials,
    colors: view.colors.map((color) => ({
      name: color.name,
      hex: color.hex,
      images: color.images,
      sizes: color.sizes.map((entry) => ({
        size: Number(entry.size),
        available: entry.available,
      })),
    })),
    sizes: [...sizes].sort((a, b) => a - b),
    badge: view.badge ?? undefined,
    isBestSeller: view.isBestSeller,
    upsellRef: view.upsellRef ?? undefined,
    anyAvailable: view.anyAvailable,
  };
}

/** PDP lookup — returns the product even when fully out (Épuisé page state). */
export function getUiProductBySlug(slug: string): Product | null {
  const view = getStorefrontProduct(slug);
  return view ? toUiProduct(view) : null;
}

/** Listings (home, boutique grids) hide products with nothing sellable. */
function inStockProducts(views: StorefrontProductView[]): Product[] {
  return views.filter((view) => view.anyAvailable).map(toUiProduct);
}

export function listUiProducts(): Product[] {
  return inStockProducts(listStorefront());
}

export function getUiProductsByCategory(category: CategorySlug): Product[] {
  return listUiProducts().filter((product) => product.category === category);
}

export function getUiBestSellers(): Product[] {
  return listUiProducts().filter((product) => product.isBestSeller);
}

/** PDP prerender slugs — every active product, even fully out (Épuisé PDP). */
export function listUiProductSlugs(): string[] {
  return listStorefront().map((view) => view.slug);
}

/** Cart-drawer cross-sells — best-sellers with stock, computed server-side. */
export function getCartCrossSells(): CartCrossSellItem[] {
  return listStorefront()
    .filter((view) => view.isBestSeller && view.anyAvailable)
    .map((view) => {
      const color = view.colors[0];
      return {
        id: view.id,
        name: view.name,
        price: view.price,
        image: color?.images[0] ?? "",
        colorName: color?.name ?? "",
        sizes: color
          ? color.sizes.map((entry) => ({
              size: Number(entry.size),
              available: entry.available,
            }))
          : [],
      };
    });
}
