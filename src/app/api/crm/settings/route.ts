import { NextResponse } from "next/server";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { browserMutationAllowed } from "@/lib/browser-mutation";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { getStoreSettings, updateStoreSettings } from "@/lib/services/store-settings";
import { storeSettingsUpdateSchema } from "@/lib/store-settings-schema";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(error: unknown) {
  if (error instanceof AuthGuardError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof RequestBodyError) {
    return json({ error: error.message }, error.status);
  }
  return json({ error: "Impossible de charger ou d’enregistrer les paramètres." }, 500);
}

export async function GET() {
  try {
    await requireAdmin();
    return json({ settings: getStoreSettings() });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    if (!browserMutationAllowed(request)) {
      return json({ error: "Origine non autorisée." }, 403);
    }
    const parsed = storeSettingsUpdateSchema.safeParse(await readLimitedJson(request, 4096));
    if (!parsed.success) {
      return json({ error: "Paramètres invalides. Vérifiez les champs et leurs limites." }, 400);
    }
    return json({ settings: updateStoreSettings(parsed.data) });
  } catch (error) {
    return failure(error);
  }
}
