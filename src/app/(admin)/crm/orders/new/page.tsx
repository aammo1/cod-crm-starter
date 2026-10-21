import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import {
  ManualOrderForm,
  type SerializableProduct,
} from "@/components/crm/manual-order-form";
import { requireUser } from "@/lib/auth-guards";
import { listProducts } from "@/lib/services/catalog";
import { listCities } from "@/lib/services/orders";

export const metadata: Metadata = {
  title: "Nouvelle commande — CRM",
  robots: { index: false },
};

export default async function NewManualOrderPage() {
  await requireUser();

  const allProducts = listProducts();
  const cities = listCities();

  // Project minimal serializable active catalog options
  const products: SerializableProduct[] = allProducts
    .filter((product) => product.active)
    .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      variants: product.variants
        .filter((variant) => variant.active)
        .map((variant) => ({
          variantId: variant.variantId,
          sku: variant.sku,
          size: variant.size,
          colorName: variant.colorName,
          available: variant.available,
        })),
    }))
    .filter((product) => product.variants.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/crm/orders"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Retour aux commandes
        </Link>
        <h1 className="mt-2 font-semibold text-2xl text-foreground">
          Nouvelle commande
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisie manuelle d&apos;un achat reçu hors boutique (WhatsApp, téléphone, Instagram ou autre canal).
        </p>
      </div>

      <ManualOrderForm products={products} cities={cities} />
    </div>
  );
}
