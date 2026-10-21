import type { Metadata } from "next";

import { StockWorkspace } from "@/components/crm/stock-workspace";
import type {
  StockMovementRow,
  StockVariantRow,
} from "@/components/crm/stock-tables";
import { requireUser } from "@/lib/auth-guards";
import { getDb } from "@/lib/db";
import { listProducts } from "@/lib/services/catalog";
import { balancesByProduct, listMovements } from "@/lib/services/inventory";
import { formatCasablanca } from "@/lib/services/orders";

export const metadata: Metadata = {
  title: "Stock — CRM",
  robots: { index: false },
};

export default async function StockPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const products = listProducts({ includeInactive: true });
  const balances = balancesByProduct(products.map((product) => product.id));

  const openingRows = getDb()
    .prepare(
      "SELECT variant_id, created_at FROM stock_movements WHERE kind = 'opening'",
    )
    .all() as Array<{ variant_id: string; created_at: string }>;
  const openedAtByVariant = new Map(
    openingRows.map((row) => [row.variant_id, row.created_at]),
  );
  const movedVariants = new Set((getDb().prepare("SELECT DISTINCT variant_id FROM stock_movements").all() as Array<{ variant_id: string }>).map((row) => row.variant_id));

  const variantRows: StockVariantRow[] = products.flatMap((product) =>
    product.variants.map((variant) => {
      const balance = balances.get(variant.variantId);
      const openedAt = openedAtByVariant.get(variant.variantId) ?? null;
      return {
        productId: product.id,
        colorId: variant.colorId,
        canOpen: !movedVariants.has(variant.variantId) && !(balance?.physical || balance?.reserved || balance?.quarantine),
        variantId: variant.variantId,
        sku: variant.sku,
        productName: product.name,
        colorName: variant.colorName,
        size: variant.size,
        physical: balance?.physical ?? 0,
        reserved: balance?.reserved ?? 0,
        quarantine: balance?.quarantine ?? 0,
        available: balance?.available ?? 0,
        openedAt,
        openedAtLabel: openedAt ? formatCasablanca(openedAt) : null,
      };
    }),
  );

  const variantBySku = new Map<string, StockVariantRow>();
  for (const row of variantRows) variantBySku.set(row.sku, row);
  const variantById = new Map<string, StockVariantRow>();
  for (const row of variantRows) variantById.set(row.variantId, row);

  const movementRows: StockMovementRow[] = listMovements({ limit: 200 }).map(
    (movement) => {
      const variant = variantById.get(movement.variant_id);
      const label = variant
        ? `${variant.sku} — ${variant.productName} (${variant.colorName} / ${variant.size})`
        : (variantBySku.get(movement.variant_id)?.sku ?? movement.variant_id);
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
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl text-foreground">Stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Disponible = physique − quarantaine − réservé · entrepôt ZEHRI
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
