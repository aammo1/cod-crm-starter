import Link from "next/link";
import Image from "next/image";

import { ArchiveButton } from "@/components/admin/archive-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProducts, type CatalogProduct } from "@/lib/services/catalog";
import { formatMad } from "@/lib/pricing";
import { CATEGORY_LABELS } from "@/lib/categories";

export default async function AdminProductsPage() {
  const products = listProducts({ includeInactive: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Produits</h1>
          <p className="mt-1 text-sm text-white/50">
            {products.length} produit{products.length > 1 ? "s" : ""} au catalogue
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/produits/nouveau">Nouveau produit</Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="px-4 py-3 font-medium">Produit</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Couleurs</th>
              <th className="px-4 py-3 font-medium">Pointures</th>
              <th className="px-4 py-3 font-medium">Variantes</th>
              <th className="px-4 py-3 font-medium">Disponibles</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-white/40">
                  Aucun produit pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductRow({ product }: { product: CatalogProduct }) {
  const image = product.colors[0]?.images[0];
  const available = product.variants.reduce((sum, v) => sum + v.available, 0);
  return (
    <tr className="align-middle">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {image ? (
            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
              <Image src={image} alt="" fill sizes="40px" className="object-cover" />
            </div>
          ) : (
            <div className="size-10 shrink-0 rounded-lg bg-white/5" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{product.name}</p>
            <p className="truncate text-xs text-white/40">{product.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-white/70">
        {CATEGORY_LABELS[product.category]}
      </td>
      <td className="px-4 py-3">{formatMad(product.price)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {product.colors.map((color) => (
            <span
              key={color.id}
              title={color.name}
              className="size-4 rounded-full border border-white/20"
              style={{ backgroundColor: color.hex }}
            />
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-white/70">
        {product.variants.map((v) => v.size).filter((s, i, a) => a.indexOf(s) === i).join(", ") || "—"}
      </td>
      <td className="px-4 py-3 text-white/70">{product.variants.length}</td>
      <td className="px-4 py-3">{available}</td>
      <td className="px-4 py-3">
        <Badge variant={product.active ? "default" : "outline"}>
          {product.active ? "Actif" : "Archivé"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/admin/produits/${product.id}`}>Modifier</Link>
          </Button>
          <ArchiveButton productId={product.id} active={product.active} />
        </div>
      </td>
    </tr>
  );
}
