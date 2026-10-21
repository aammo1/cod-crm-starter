import { NextResponse } from "next/server";
import { AuthGuardError, requireUser } from "@/lib/auth-guards";
import { contactEntrySchema } from "@/lib/api-schemas";
import {
  ContactValidationError,
  getCrmOrder,
  insertContact,
  parseCasablancaLocal,
} from "@/lib/services/orders";

export const runtime = "nodejs";

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

    const parsed = contactEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
        { status: 400 },
      );
    }

    if (!getCrmOrder(id)) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    let nextCallbackAtIso: string | null = null;
    const rawCallback = parsed.data.next_callback_at?.trim();
    if (rawCallback) {
      const conversion = parseCasablancaLocal(rawCallback);
      if (!conversion.ok) {
        return NextResponse.json(
          { error: conversion.error },
          { status: 400 },
        );
      }
      if (new Date(conversion.iso).getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "La date de rappel doit être dans le futur" },
          { status: 400 },
        );
      }
      nextCallbackAtIso = conversion.iso;
    }

    let contact;
    try {
      contact = insertContact({
        orderId: id,
        agentId: user.id,
        channel: parsed.data.channel,
        outcome: parsed.data.outcome,
        note: parsed.data.note ?? null,
        nextCallbackAt: nextCallbackAtIso,
      });
    } catch (error) {
      if (error instanceof ContactValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    if (!contact) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    const order = getCrmOrder(id);
    return NextResponse.json(
      { contact, confirmationStatus: order?.confirmationStatus ?? null },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }
}
