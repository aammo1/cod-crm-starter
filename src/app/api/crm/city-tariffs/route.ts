import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import {
  CityTariffError, defaultCourierCost, listCityTariffs, setDefaultCourierCost,
  upsertCityTariff, upsertCityTariffs, type CityTariffInput,
} from "@/lib/services/city-tariffs";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 128 * 1024;
const MAX_ROWS = 500;

const cost = z.number().int("Montant entier requis.").min(0, "Montant positif requis.").max(1_000_000, "Montant trop élevé.").nullable();
const tariffFields = {
  courierCost: cost.default(null),
  customerFeeOverride: cost.default(null),
  overrideIgnoresFreeThreshold: z.boolean().default(false),
};
const singleSchema = z.object({ cityId: z.number().int().positive(), ...tariffFields }).strict();
const bulkSchema = z.object({
  rows: z.array(z.object({
    cityId: z.number().int().positive().optional(),
    cityName: z.string().trim().min(1).max(120).optional(),
    ...tariffFields,
  }).strict().refine((r) => r.cityId !== undefined || r.cityName !== undefined, "Ville requise (cityId ou cityName)."))
    .min(1, "Aucune ligne.").max(MAX_ROWS, `Maximum ${MAX_ROWS} lignes.`),
}).strict();
const defaultSchema = z.object({ defaultCourierCost: cost }).strict();

const fold = (s: string) => s.trim().toLocaleLowerCase("fr");

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ tariffs: listCityTariffs(), defaultCourierCost: defaultCourierCost() });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();
    let body: unknown;
    try { body = await readLimitedJson(request, MAX_BODY_BYTES); }
    catch (error) {
      if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const fail = (issue?: z.ZodIssue) => NextResponse.json({ error: issue?.message ?? "Requête invalide." }, { status: 400 });
    try {
      if (body && typeof body === "object" && "defaultCourierCost" in body) {
        const parsed = defaultSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.issues[0]);
        setDefaultCourierCost(parsed.data.defaultCourierCost);
        return NextResponse.json({ ok: true, defaultCourierCost: defaultCourierCost() });
      }
      if (body && typeof body === "object" && "rows" in body) {
        const parsed = bulkSchema.safeParse(body);
        if (!parsed.success) return fail(parsed.error.issues[0]);
        const byName = new Map(listCityTariffs().map((t) => [fold(t.cityName), t.cityId] as const));
        const inputs: CityTariffInput[] = [];
        for (const [i, row] of parsed.data.rows.entries()) {
          const cityId = row.cityId ?? byName.get(fold(row.cityName ?? ""));
          if (cityId === undefined) return NextResponse.json({ error: `Ligne ${i + 1} : ville inconnue « ${row.cityName} ».` }, { status: 400 });
          inputs.push({ cityId, courierCost: row.courierCost, customerFeeOverride: row.customerFeeOverride,
            overrideIgnoresFreeThreshold: row.overrideIgnoresFreeThreshold });
        }
        return NextResponse.json({ ok: true, updated: upsertCityTariffs(inputs, user.id) });
      }
      const parsed = singleSchema.safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues[0]);
      return NextResponse.json({ ok: true, tariff: upsertCityTariff(parsed.data, user.id) });
    } catch (error) {
      if (error instanceof CityTariffError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
