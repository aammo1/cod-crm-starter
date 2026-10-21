import { ProductForm } from "@/components/admin/product-form";
import { listProducts } from "@/lib/services/catalog";
import { requireAdmin } from "@/lib/auth-guards";

export default async function NewProductPage() {
  await requireAdmin();
  const otherProducts = listProducts({ includeInactive: true }).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Nouveau produit</h1>
        <p className="mt-1 text-sm text-white/50">
          Créez un produit avec sa galerie, ses options libres ou une variante Standard.
        </p>
      </div>
      <ProductForm product={null} otherProducts={otherProducts} />
    </div>
  );
}
