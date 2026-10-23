import type { ManualOrderInput } from "@/lib/manual-order-schema";

export type PostOrderResult =
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string; uncertain: boolean }
  | { kind: "success"; orderId: string; replay: boolean }
  | { kind: "network" };

/** POST /api/crm/orders and classify the outcome (no UI side effects). */
export async function postManualOrder(payload: ManualOrderInput): Promise<PostOrderResult> {
  try {
    const response = await fetch("/api/crm/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | { orderId?: string; totals?: { itemsSubtotal: number; shipping: number; total: number }; error?: string }
      | null;

    if (response.status === 409) {
      return {
        kind: "conflict",
        message:
          data?.error ??
          "Conflit (409) : Cet identifiant de requête a déjà été utilisé pour une autre commande ou avec des données différentes.",
      };
    }

    if (!response.ok || !data?.orderId) {
      return {
        kind: "error",
        message:
          data?.error ??
          `Une erreur est survenue lors de la création de la commande (${response.status}).`,
        uncertain: response.status >= 500,
      };
    }

    return { kind: "success", orderId: data.orderId, replay: response.status === 200 };
  } catch (err) {
    console.error("Network error during manual order creation:", err);
    return { kind: "network" };
  }
}
