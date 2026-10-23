import { storeConfig } from "@/config";
import { normalizeMaPhone } from "@/lib/phone";
import { log } from "@/lib/log";
import { recordLead } from "@/lib/services/checkout-leads";
import { budgetKey, consumeBudgetsDetailed } from "@/lib/services/security-budgets";
import { guardStoreRequest, storeError } from "@/lib/storefront/browser-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Opt-in abandoned checkout lead. 404 when disabled. Valid input always gets
 * 204 (blocked/unknown variants/per-phone budget are silent: no information leak).
 */
export async function POST(request: Request) {
  if (!storeConfig.leads.enabled) return storeError("NOT_FOUND", "Introuvable.", 404);
  try {
    const guard = await guardStoreRequest(request, "store-lead", 8_192);
    if (!guard.ok) return guard.response;
    const raw = guard.body as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.phone !== "string" || raw.phone.length > 32
      || !Array.isArray(raw.items)) {
      return storeError("INVALID_REQUEST", "Demande invalide.", 400);
    }
    const phone = normalizeMaPhone(raw.phone);
    if (!phone) return storeError("INVALID_PHONE", "Numéro de téléphone invalide.", 400);
    // Hashed per-phone budget: a few updates per minute, extra writes are dropped silently.
    const limited = consumeBudgetsDetailed([
      { key: budgetKey("store-lead:phone", phone), limit: 6, windowMs: 60_000, scope: "phone" },
    ]);
    if (limited.limited) return NO_CONTENT();
    recordLead({ phone, name: raw.name, items: raw.items, sourcePath: raw.sourcePath });
    return NO_CONTENT();
  } catch (error) {
    log.warn("store.lead.failed", { message: error instanceof Error ? error.message : "unknown" });
    return storeError("SERVICE_UNAVAILABLE", "Service momentanément indisponible. Réessayez.", 503, 1);
  }
}
