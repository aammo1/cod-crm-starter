import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { CatalogAgentError, requireCatalogAgent } from "@/lib/catalog-agent-auth";
import { listProducts } from "@/lib/services/catalog";
import { applyCatalogOperation, catalogReceipt, findCatalogProduct, previewCatalogOperation } from "@/lib/services/catalog-agent";
import { InventoryConflictError, InventoryValidationError } from "@/lib/services/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function failure(error: unknown): NextResponse {
  if (error instanceof CatalogAgentError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Requête invalide." }, { status: 400, headers });
  if (error instanceof InventoryConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers });
  if (error instanceof InventoryValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
  return NextResponse.json({ error: "Échec de l’opération catalogue. Vérifiez le reçu avant de réessayer." }, { status: 500, headers });
}

export async function GET(request: Request) {
  try {
    requireCatalogAgent(request);
    const query = new URL(request.url).searchParams;
    const command = query.get("command") ?? "capabilities";
    let result: unknown;
    switch (command) {
      case "capabilities": result = {
        schemaVersion: 2, commands: ["list", "show", "preview", "apply", "receipt", "upload"],
        operations: ["create", "edit", "archive", "restore"], stock: "initial-on-create-only",
        category: "free-text", variantIdentity: { create: "key", initialStock: "variantKey", edit: "id", receipt: "variantIds" },
        maxVariants: 100, maxOptionAxes: 3,
        currency: "MAD", language: "fr", maxImagesPerGallery: 30, previewLifetimeMinutes: 30,
      }; break;
      case "list": result = { products: listProducts({ includeInactive: true }) }; break;
      case "show": result = { product: findCatalogProduct(query.get("target") ?? "") }; break;
      case "receipt": result = { receipt: catalogReceipt(query.get("requestId") ?? "") }; break;
      default: throw new CatalogAgentError("Commande inconnue.");
    }
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), operation: z.unknown() }).strict(),
  z.object({ action: z.literal("apply"), operation: z.unknown(), preview: z.string().min(1).max(2000) }).strict(),
]);
export async function POST(request: Request) {
  try {
    requireCatalogAgent(request);
    const body = bodySchema.parse(await request.json().catch(() => null));
    if (body.action === "preview") return NextResponse.json(previewCatalogOperation(body.operation), { headers });
    const result = applyCatalogOperation(body.operation, body.preview);
    revalidatePath("/", "layout");
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
