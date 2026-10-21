import type { AssistantPageContext } from "@/lib/assistant-contract";

type Filters = NonNullable<AssistantPageContext["filters"]>;

export function buildAssistantPageContext(pathname: string, query: string, selection: Partial<AssistantPageContext> = {}): AssistantPageContext {
  const context: AssistantPageContext = { pathname };
  if (pathname === "/crm/orders") {
    const params = new URLSearchParams(query);
    const statuses = ["all", "new", "no_answer", "call_back_later", "confirmed", "cancelled"];
    const rawSubmission = (params.get("submission") ?? "").split(",").map((s) => s.trim()).filter((s) => ["queued", "submitting", "submitted", "failed", "needs_review", "cancelled"].includes(s));
    const submission = rawSubmission.filter((s): s is NonNullable<Filters["submission"]>[number] => s !== "cancelled");
    const tracking = (params.get("tracking") ?? "").split(",").map((s) => s.trim()).filter((s): s is NonNullable<Filters["tracking"]>[number] => ["in_transit", "out_for_delivery", "at_facility", "unknown"].includes(s));
    const callbackDue = params.get("callbackDue") === "1";
    let status = params.get("status") ?? "";
    if (!statuses.includes(status)) status = callbackDue || rawSubmission.length || tracking.length ? "all" : "new";
    if (callbackDue && status !== "all" && status !== "call_back_later") status = "all";
    const rawPage = Number(params.get("page") ?? "1");
    const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(100, rawPage) : 1;
    context.filters = { status: status as Filters["status"], callbackDue, submission: [...new Set(submission)], tracking: [...new Set(tracking)], page, pageSize: 20, ...(params.get("q") ? { q: params.get("q")!.slice(0, 100) } : {}) };
  }
  if (pathname === "/crm/stock" && selection.productId) context.productId = selection.productId;
  if (pathname === "/crm/expeditions") {
    if (selection.blId) context.blId = selection.blId;
    if (selection.selectedParcelIds?.length) context.selectedParcelIds = selection.selectedParcelIds.slice(0, 10);
    if (selection.selectionCount !== undefined) context.selectionCount = selection.selectionCount;
  }
  // The server validates the full request. Keep its Zod schemas out of the
  // browser bundle and this per-page adapter limited to known fields.
  return context;
}
