import { createHmac } from "node:crypto";

/** Token for the loopback warm-up call; null when AUTH_SECRET is unset. */
export function warmupToken(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("storefront-warmup:v1").digest("hex");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  const token = warmupToken();
  if (!token) return;
  const origin = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(`${origin}/api/internal/warmup`, {
        method: "POST",
        headers: { "x-warmup-token": token },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      for (const path of ["/", "/boutique"]) {
        await fetch(`${origin}${path}`).then((r) => r.arrayBuffer()).catch(() => undefined);
      }
      console.log("[storefront] warm-up ok");
      return;
    } catch {
      if (attempt < 5) await sleep(2000);
    }
  }
  console.error("[storefront] warm-up failed");
}

/** Invalidate prerendered (empty-catalog) pages once after boot. Never throws. */
export function scheduleStorefrontWarmup(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const g = globalThis as { __storefrontWarmupScheduled?: boolean };
  if (g.__storefrontWarmupScheduled) return;
  g.__storefrontWarmupScheduled = true;
  setTimeout(() => void run().catch(() => undefined), 2000);
}
