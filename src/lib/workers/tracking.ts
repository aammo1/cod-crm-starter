import { redactText } from "@/lib/shipping/redact";
import { pollIntervalMs, pollOnce } from "@/lib/services/tracking";
import { TRACKING_LAST_TICK_KEY, setAppState } from "@/lib/services/app-state";

/**
 * Tracking poller (task-14): one pass on boot, then every
 * OZON_POLL_INTERVAL_MIN minutes (default 30, floor 5). Ticks are serialized —
 * a tick is skipped if the previous poll is still running, so bulk calls never
 * overlap. All polling logic lives in services/tracking.ts (timer-free).
 */
export function startTrackingWorker(): void {
  const g = globalThis as {
    __crmTrackingWorker?: NodeJS.Timeout;
    __crmTrackingRunning?: boolean;
  };
  if (g.__crmTrackingWorker) return;

  if (process.env.DELIVERY_PROVIDER === "mock") {
    console.log("[tracking] MOCK provider actif — aucun appel réel à Ozon");
  }

  const tick = async (): Promise<void> => {
    if (g.__crmTrackingRunning) {
      console.warn("[tracking] sondage précédent encore en cours — tick ignoré");
      return;
    }
    g.__crmTrackingRunning = true;
    try {
      // /api/health liveness signal — a failed write must never break the poll.
      try {
        setAppState(TRACKING_LAST_TICK_KEY, new Date().toISOString());
      } catch {
        // Health signal only.
      }
      await pollOnce();
    } catch (err) {
      console.error(
        `[tracking] échec du sondage : ${redactText(err instanceof Error ? err.message : String(err))}`,
      );
    } finally {
      g.__crmTrackingRunning = false;
    }
  };

  void tick();
  g.__crmTrackingWorker = setInterval(() => void tick(), pollIntervalMs());
}
