import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { crmOrderListQuerySchema } from "@/lib/api-schemas";
import { log } from "@/lib/log";
import {
  OrderExportTooLargeError,
  buildOrdersCsv,
  exportFileDate,
  resolveExportStatus,
} from "@/lib/services/order-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const admin = await requireAdmin();
    const sp = new URL(request.url).searchParams;
    const parsed = crmOrderListQuerySchema.safeParse(Object.fromEntries(sp.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }
    const tracking = (sp.get("tracking") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const d = parsed.data;
    const mine = sp.get("mine") === "1";
    const base = {
      archived: d.archived,
      q: d.q || undefined,
      assignedTo: mine ? admin.id : d.assignedTo || undefined,
      utmSource: d.utm_source || undefined,
      utmCampaign: d.utm_campaign || undefined,
      callbackDue: d.callbackDue,
      submission: d.submission,
      tracking: tracking.length > 0 ? tracking : undefined,
    };
    const filters = { ...base, status: resolveExportStatus(d.status, base) };

    let result;
    try {
      result = buildOrdersCsv(filters);
    } catch (error) {
      if (error instanceof OrderExportTooLargeError) {
        return NextResponse.json({ error: error.message }, { status: 413 });
      }
      throw error;
    }
    log.info("orders.export", { adminId: admin.id, rows: result.rowCount });
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="commandes-${exportFileDate()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
