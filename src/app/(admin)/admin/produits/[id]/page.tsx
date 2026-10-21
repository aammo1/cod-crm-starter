import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/product-form";
import { getProductById, listProducts } from "@/lib/services/catalog";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();

  const otherProducts = listProducts({ includeInactive: true })
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">{product.name}</h1>
        <p className="mt-1 text-sm text-white/50">
          Modifiez le produit, ses couleurs et ses pointures. Désactiver une taille
          conserve l&apos;historique des commandes.
        </p>
      </div>

      {product.variants.length > 0 && (
        <section className="space-y-3 rounded-xl border border-white/10 p-4 md:p-6">
          <h2 className="font-display text-lg font-semibold">Variantes</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Pointure</th>
                  <th className="px-3 py-2 font-medium">Couleur</th>
                  <th className="px-3 py-2 font-medium">Disponibles</th>
                  <th className="px-3 py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {product.variants.map((variant) => (
                  <tr key={variant.variantId}>
                    <td className="px-3 py-2 font-mono text-xs">{variant.sku}</td>
                    <td className="px-3 py-2">{variant.size}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-3 rounded-full border border-white/20"
                          style={{ backgroundColor: variant.colorHex }}
                        />
                        {variant.colorName}
                      </span>
                    </td>
                    <td className="px-3 py-2">{variant.available}</td>
                    <td className="px-3 py-2">
                      {variant.active ? (
                        <span className="text-white/70">Active</span>
                      ) : (
                        <span className="text-destructive">Désactivé</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ProductForm product={product} otherProducts={otherProducts} />
    </div>
  );
}
