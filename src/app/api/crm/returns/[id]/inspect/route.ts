import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { inspectReturnSchema } from "@/lib/api-schemas";
import { getDb, getOrder, type OrderItem } from "@/lib/db";
import {
  getDispatchedVariants,
  InventoryConflictError,
  receiveReturnLines,
  resolveVariantForLine,
  type ReturnLineInput,
} from "@/lib/services/inventory";
import { getReturn } from "@/lib/services/returns";
import { getSubmission } from "@/lib/services/submissions";

export const runtime = "nodejs";

class ReturnInspectError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "ReturnInspectError";
  }
}

/** Main items + accepted upsell lines — every line the parcel could contain. */
function parcelLines(order: NonNullable<ReturnType<typeof getOrder>>): OrderItem[] {
  const upsell =
    order.upsellStatus === "accepted" ? (order.upsellItems ?? []) : [];
  return [...order.items, ...upsell];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const parsed = inspectReturnSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const actor = user.name ?? user.email ?? user.id;
    const db = getDb();

    // One immediate transaction: the status guard, the quantity checks and the
    // stock mutation (receiveReturn runs as a savepoint) either all happen or
    // none do — two concurrent inspections can never both see `received`.
    const result = db
      .transaction(() => {
        const current = getReturn(id);
        if (!current) {
          throw new ReturnInspectError(404, "Retour introuvable.");
        }
        if (current.status === "inspected") {
          throw new ReturnInspectError(409, "Retour déjà inspecté.");
        }
        if (current.status === "returning") {
          throw new ReturnInspectError(
            409,
            "Marquez d'abord le colis comme reçu avant l'inspection.",
          );
        }

        const submission = getSubmission(current.submissionId);
        if (!submission) {
          throw new ReturnInspectError(
            404,
            "Soumission transporteur introuvable.",
          );
        }
        const order = getOrder(submission.orderId);
        if (!order) {
          throw new ReturnInspectError(404, "Commande introuvable.");
        }

        const items = parcelLines(order);

        // Every line must resolve to a variant that was actually dispatched;
        // per-variant totals are bounded by the dispatched quantity inside
        // receiveReturnLines (a main item and an upsell may share a variant).
        const dispatched = new Set(
          getDispatchedVariants(submission.orderId).map((d) => d.variantId),
        );
        if (dispatched.size === 0) {
          throw new ReturnInspectError(
            409,
            "Impossible de déterminer les variantes expédiées pour ce retour — inspection manuelle requise.",
          );
        }

        const perVariant = new Map<string, ReturnLineInput>();
        const seen = new Set<number>();
        for (const line of parsed.data.lines) {
          if (line.lineIndex >= items.length) {
            throw new ReturnInspectError(400, "Ligne d'article introuvable.");
          }
          if (seen.has(line.lineIndex)) {
            throw new ReturnInspectError(400, "Ligne d'article en double.");
          }
          seen.add(line.lineIndex);
          const item = items[line.lineIndex];
          const variantId = resolveVariantForLine(item);
          if (!variantId || !dispatched.has(variantId)) {
            throw new ReturnInspectError(
              409,
              `${item.name} (${item.color} / ${item.size}) ne correspond à aucune variante expédiée — inspection manuelle requise.`,
            );
          }
          if (line.sellable + line.damaged > item.quantity) {
            throw new ReturnInspectError(
              400,
              `Quantités trop élevées pour ${item.name} (${item.quantity} paire(s) commandée(s)).`,
            );
          }
          const entry = perVariant.get(variantId) ?? {
            variantId,
            sellableQty: 0,
            damagedQty: 0,
          };
          entry.sellableQty += line.sellable;
          entry.damagedQty += line.damaged;
          perVariant.set(variantId, entry);
        }
        const lines = [...perVariant.values()];
        const totals = {
          sellable: lines.reduce((n, l) => n + l.sellableQty, 0),
          damaged: lines.reduce((n, l) => n + l.damagedQty, 0),
        };
        if (totals.sellable + totals.damaged === 0) {
          throw new ReturnInspectError(
            400,
            "Indiquez au moins une paire vendable ou endommagée.",
          );
        }

        // Stable per-return ref: a return is inspected exactly once.
        try {
          receiveReturnLines(
            current.submissionId,
            submission.orderId,
            lines,
            actor,
            `ret-${current.id}`,
          );
        } catch (error) {
          if (error instanceof InventoryConflictError) {
            throw new ReturnInspectError(409, error.message);
          }
          throw error;
        }
        // receiveReturnLines sets status/quantities/inspected_at; the inspection
        // reason (required, trimmed by the schema) is recorded here in the
        // same transaction.
        db.prepare("UPDATE returns SET reason = ? WHERE id = ?").run(
          parsed.data.reason,
          id,
        );
        return {
          orderId: submission.orderId,
          sellableQty: totals.sellable,
          damagedQty: totals.damaged,
        };
      })
      .immediate();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ReturnInspectError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
