import { ProductForm } from "@/components/admin/product-form";
import { listProducts } from "@/lib/services/catalog";

export default function NewProductPage() {
  const otherProducts = listProducts({ includeInactive: true }).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Nouveau produit</h1>
        <p className="mt-1 text-sm text-white/50">
          Créez un produit avec ses couleurs, ses images et ses pointures.
        </p>
      </div>
      <ProductForm product={null} otherProducts={otherProducts} />
    </div>
  );
}
