import { NextResponse } from "next/server";
import { normalizeMaPhone } from "@/lib/phone";
import { lookupOrderTracking } from "@/lib/services/order-tracking-lookup";
import { budgetKey, consumeBudgetsDetailed, peekBudgets } from "@/lib/services/security-budgets";
import { guardStoreRequest, storeError } from "@/lib/storefront/browser-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NOT_FOUND = () => storeError("NOT_FOUND", "Commande introuvable. Vérifiez le numéro et le téléphone.", 404);

export async function POST(request: Request) {
  try {
    const guard = await guardStoreRequest(request, "store-track", 2_048);
    if (!guard.ok) return guard.response;
    const raw = guard.body as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || typeof raw.orderRef !== "string" || typeof raw.phone !== "string" || raw.orderRef.length > 64 || raw.phone.length > 32) {
      return storeError("INVALID_REQUEST", "Demande invalide.", 400);
    }
    const phone = normalizeMaPhone(raw.phone);
    if (!phone) return storeError("INVALID_PHONE", "Numéro de téléphone invalide.", 400);
    // Only failed lookups consume the per-phone budget, so knowing a phone
    // number cannot lock its owner out; we still refuse when already exhausted.
    const phoneBudget = { key: budgetKey("store-track:phone", phone), limit: 8, windowMs: 10 * 60_000, scope: "phone" as const };
    const wait = peekBudgets([phoneBudget]);
    if (wait) return storeError("RATE_LIMITED", "Réessayez dans quelques instants.", 429, wait);
    const result = lookupOrderTracking(raw.orderRef, phone);
    if (!result) {
      const limited = consumeBudgetsDetailed([phoneBudget]);
      if (limited.limited) return storeError("RATE_LIMITED", "Réessayez dans quelques instants.", 429, limited.retryAfterSeconds);
      return NOT_FOUND();
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return storeError("SERVICE_UNAVAILABLE", "Service momentanément indisponible. Réessayez.", 503, 1);
  }
}
