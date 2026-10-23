import type { StorefrontProductView } from "@/lib/services/catalog";
import { ProductCard } from "./product-card";

export function ProductGrid({ products, priorityCount = 0 }: { products: StorefrontProductView[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
