import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { ArchiveButton } from "@/components/admin/archive-button";
import { getProductById, listProducts } from "@/lib/services/catalog";
import { requireAdmin } from "@/lib/auth-guards";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();
  const otherProducts = listProducts({ includeInactive: true }).filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name }));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="break-words font-display text-2xl font-semibold">{product.name}</h1><p className="mt-1 text-sm text-white/50">Modifiez le contenu, les images et les variantes. Les identifiants et l’historique sont conservés.</p><p className="mt-2 text-xs text-white/50">{product.active ? 'Produit actif' : 'Produit archivé'}</p></div><ArchiveButton productId={product.id} active={product.active} /></div>
    <ProductForm key={product.updatedAt} product={product} otherProducts={otherProducts} />
  </div>;
}
