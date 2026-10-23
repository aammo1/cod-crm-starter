import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { crmOrderListQuerySchema } from "@/lib/api-schemas";
import { listOrders } from "@/lib/services/orders";
import { manualOrderInputSchema } from "@/lib/manual-order-schema";
import {
  createManualOrder,
  ManualOrderError,
} from "@/lib/services/manual-orders";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireUser();

    const url = new URL(request.url);
    const parsed = crmOrderListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const result = listOrders({
      archived: parsed.data.archived,
      status: parsed.data.status,
      q: parsed.data.q,
      assignedTo: parsed.data.assignedTo,
      utmSource: parsed.data.utm_source,
      utmCampaign: parsed.data.utm_campaign,
      callbackDue: parsed.data.callbackDue,
      submission: parsed.data.submission,
      page: parsed.data.page,
    });

    return NextResponse.json({ orders: result.orders, total: result.total });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireUser();

    let body: unknown;
    try {
      body = await readLimitedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json(
        { error: "Corps de requête invalide" },
        { status: 400 },
      );
    }

    const parsed = manualOrderInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    const result = createManualOrder(parsed.data, user);
    return NextResponse.json(
      {
        orderId: result.orderId,
        totals: result.totals,
      },
      { status: result.isReplay ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    if (error instanceof ManualOrderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    log.error("manual_order_create_failed", {
      kind: error instanceof Error ? error.name : "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la création de la commande." },
      { status: 500 },
    );
  }
}
