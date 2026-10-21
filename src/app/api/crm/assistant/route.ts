import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import { createCrmAssistant, assistantErrorMessage } from "@/lib/assistant";
import { assistantRequestSchema, ASSISTANT_TOOL_LABELS, type AssistantEvent, type AssistantSource } from "@/lib/assistant-contract";
import { claimAssistantRequest } from "@/lib/assistant-limits";
import { browserMutationAllowed } from "@/lib/browser-mutation";

export const runtime = "nodejs";
export const maxDuration = 65;

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 40000) { await reader.cancel(); throw new Error("size"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    if (!browserMutationAllowed(request)) {
      return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
    }
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return NextResponse.json({ error: "L’assistant n’est pas encore configuré. Ajoutez OPENROUTER_API_KEY sur le serveur." }, { status: 503 });
    }
    const body = await readBody(request).catch(() => null);
    const parsed = assistantRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Conversation invalide ou trop longue. Démarrez une nouvelle conversation." }, { status: 400 });
    const release = claimAssistantRequest(user.id);
    if (!release) return NextResponse.json({ error: "Une réponse est déjà en cours ou la limite de 60 demandes par heure est atteinte. Réessayez plus tard." }, { status: 429 });

    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(60000)]);
    const sources = new Map<string, AssistantSource>();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AssistantEvent) => {
          if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          send({ type: "status", text: "Analyse de votre demande…" });
          // Occasional comic grumpiness, never two catchphrase turns in a row.
          const lastAnswer = parsed.data.messages.filter((message) => message.role === "assistant").at(-1)?.content ?? "";
          const mood = !lastAnswer.toLowerCase().includes("jmaa karraak") && randomInt(6) === 0 ? "grumpy" : "cheerful";
          send({ type: "mood", mood });
          const match = parsed.data.context?.pathname.match(/^\/crm\/orders\/([^/]+)$/);
          const pageOrderId = match && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
          const agent = createCrmAssistant((source) => sources.set(source.href, source), pageOrderId ?? parsed.data.orderId, mood, parsed.data.context);
          const result = await agent.stream({ messages: parsed.data.messages, abortSignal: signal });
          let hasText = false;
          let failed = false;
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") { hasText = true; send({ type: "text", text: part.text }); }
            if (part.type === "tool-call") send({ type: "status", text: ASSISTANT_TOOL_LABELS[part.toolName] ?? "Consultation du CRM…" });
            if (part.type === "error") { failed = true; send({ type: "error", text: assistantErrorMessage(part.error) }); }
            if (part.type === "abort") { failed = true; send({ type: "error", text: assistantErrorMessage(null) }); }
          }
          if (!hasText && !failed) send({ type: "error", text: "Aucune réponse exploitable. Reformulez votre demande." });
          send({ type: "sources", sources: [...sources.values()].slice(0, 12) });
          send({ type: "done" });
        } catch (error) {
          send({ type: "error", text: assistantErrorMessage(error) });
        } finally {
          release();
          if (!abort.signal.aborted) controller.close();
        }
      },
      cancel() { abort.abort(); release(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
    } });
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    return NextResponse.json({ error: "L’assistant est temporairement indisponible." }, { status: 500 });
  }
}
