import Link from "next/link";
import Image from "next/image";
import { ArchiveButton } from "@/components/admin/archive-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/lib/services/catalog";
import { requireAdmin } from "@/lib/auth-guards";
import { formatMad } from "@/lib/pricing";

export default async function AdminProductsPage() {
  await requireAdmin();
  const products = listProducts({ includeInactive: true });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="font-display text-2xl font-semibold">Produits</h1><p className="mt-1 text-sm text-white/50">{products.length} produit{products.length > 1 ? 's' : ''} au catalogue</p></div><Button asChild><Link href="/admin/produits/nouveau">Nouveau produit</Link></Button></div>
    {!products.length && <div className="rounded-xl border border-white/10 p-10 text-center text-white/50">Aucun produit pour le moment. Créez votre premier produit avec ou sans options.</div>}
    <div className="grid gap-4 lg:grid-cols-2">{products.map(product => {
      const image = product.images[0] ?? product.variants.find(v => v.images.length)?.images[0];
      const active = product.variants.filter(v => v.active);
      return <article key={product.id} className="min-w-0 space-y-4 rounded-xl border border-white/10 p-4 md:p-5">
        <div className="flex items-start gap-3"><div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-white/5">{image && <Image src={image} alt="" fill sizes="64px" className="object-cover" />}</div><div className="min-w-0 flex-1"><Link className="break-words font-display text-lg font-semibold hover:underline" href={`/admin/produits/${encodeURIComponent(product.id)}`}>{product.name}</Link><p className="break-all text-xs text-white/40">{product.slug}</p><p className="mt-1 text-sm text-white/70">{product.category} · {formatMad(product.price)}</p></div><Badge variant={product.active ? 'default' : 'outline'}>{product.active ? 'Actif' : 'Archivé'}</Badge></div>
        <div className="space-y-1 text-sm text-white/60">{product.optionDefinitions.length ? product.optionDefinitions.map(axis => <p key={axis.name} className="break-words"><span className="font-medium text-white/80">{axis.name}</span> : {axis.values.join(', ')}</p>) : <p>Standard · Sans option</p>}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="text-xs text-white/50">{active.length} variante(s) active(s) · {active.reduce((n, v) => n + v.available, 0)} unité(s) disponible(s)</p><div className="flex items-center gap-1"><Button asChild variant="ghost" size="sm"><Link href={`/admin/produits/${encodeURIComponent(product.id)}`}>Modifier</Link></Button><ArchiveButton productId={product.id} active={product.active} /></div></div>
      </article>;
    })}</div>
  </div>;
}
