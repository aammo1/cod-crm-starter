import type { Metadata } from "next";

import { StockWorkspace } from "@/components/crm/stock-workspace";
import type {
  StockMovementRow,
  StockVariantRow,
} from "@/components/crm/stock-tables";
import { requireUser } from "@/lib/auth-guards";
import { getDb } from "@/lib/db";
import { listProducts } from "@/lib/services/catalog";
import { DEFAULT_LOCATION, listStockVariants, listMovements } from "@/lib/services/inventory";
import { formatCasablanca } from "@/lib/services/orders";

export const metadata: Metadata = {
  title: "Stock — CRM",
  robots: { index: false },
};

export default async function StockPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const products = listProducts({ includeInactive: true });
  const productImages = new Map(products.map((product) => [product.id, product.images]));

  const openingRows = getDb()
    .prepare(
      "SELECT variant_id, created_at FROM stock_movements WHERE kind = 'opening'",
    )
    .all() as Array<{ variant_id: string; created_at: string }>;
  const openedAtByVariant = new Map(
    openingRows.map((row) => [row.variant_id, row.created_at]),
  );
  const movedVariants = new Set((getDb().prepare("SELECT DISTINCT variant_id FROM stock_movements").all() as Array<{ variant_id: string }>).map((row) => row.variant_id));

  const variantRows: StockVariantRow[] = listStockVariants({ includeInactive: true }).map(
    (variant) => {
      const openedAt = openedAtByVariant.get(variant.variantId) ?? null;
      return {
        ...variant,
        label: variant.label.trim() || "Standard",
        images: variant.images.length ? variant.images : productImages.get(variant.productId) ?? [],
        canOpen: !movedVariants.has(variant.variantId) && !(variant.physical || variant.reserved || variant.quarantine),
        openedAt,
        openedAtLabel: openedAt ? formatCasablanca(openedAt) : null,
      };
    },
  );

  const variantById = new Map<string, StockVariantRow>();
  for (const row of variantRows) variantById.set(row.variantId, row);

  const movementRows: StockMovementRow[] = listMovements({ limit: 200 }).map(
    (movement) => {
      const variant = variantById.get(movement.variant_id);
      const label = variant
        ? `${variant.sku} — ${variant.productName} (${variant.label}${variant.options.length ? ` · ${variant.options.map((option) => `${option.name} : ${option.value}`).join(" · ")}` : ""})${!variant.active || !variant.productActive ? " · Archivé" : ""}`
        : movement.variant_id;
      return {
        id: movement.id,
        dateLabel: formatCasablanca(movement.created_at),
        variantLabel: label,
        kind: movement.kind,
        qty: movement.qty,
        reason: movement.reason,
        orderId: movement.order_id,
        actor: movement.actor,
        source: movement.source,
        ref: movement.ref,
      };
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl text-foreground">Stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Disponible = physique − quarantaine − réservé · entrepôt {DEFAULT_LOCATION}
        </p>
      </div>

      <StockWorkspace
        variantRows={variantRows}
        movementRows={movementRows}
        isAdmin={isAdmin}
      />
    </div>
  );
}
