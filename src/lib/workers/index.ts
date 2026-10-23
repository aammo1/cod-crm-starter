import { ProviderError } from "@/lib/shipping/errors";
import { getProvider } from "@/lib/shipping";
import { syncCities } from "@/lib/shipping/ozon";
import { redactText } from "@/lib/shipping/redact";
import { startSubmissionWorker } from "@/lib/workers/submission";
import { startTrackingWorker } from "@/lib/workers/tracking";
import { startMetaWorker } from "@/lib/workers/meta";
import { startTikTokWorker } from "@/lib/workers/tiktok";

const CITIES_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function refreshCitiesLoop(): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      const count = await syncCities(getProvider());
      console.log(`[cities] synchronisation terminée (${count} villes)`);
    } catch (err) {
      // Non-fatal: retried on the next pass. Messages are already redacted
      // (ProviderError), redactText() is a belt-and-braces scrub.
      const message = redactText(err instanceof Error ? err.message : String(err));
      const kind = err instanceof ProviderError ? err.kind : "unknown";
      console.error(`[cities] échec de synchronisation (${kind}): ${message}`);
    }
  };
  await run();
  setInterval(() => void run(), CITIES_SYNC_INTERVAL_MS);
}

/** Idempotent workers entrypoint — extended by tasks 09/14 (submission, tracking). */
export function startWorkers(): void {
  const g = globalThis as { __crmWorkersStarted?: boolean };
  if (g.__crmWorkersStarted) return;
  g.__crmWorkersStarted = true;
  // Isolated: one worker failing to boot must not silently disable the others.
  startSafely("submission", startSubmissionWorker);
  startSafely("tracking", startTrackingWorker);
  startSafely("meta", startMetaWorker);
  startSafely("tiktok", startTikTokWorker);
  void refreshCitiesLoop();
}

function startSafely(name: string, start: () => void): void {
  try {
    start();
  } catch (err) {
    console.error(
      `[workers] démarrage ${name} en échec : ${redactText(err instanceof Error ? err.message : String(err))}`,
    );
  }
}

/** Which worker timers are registered in this process (consumed by /api/health). */
export function workerHealth(): { submission: { enabled: boolean }; tracking: { enabled: boolean }; meta: { enabled: boolean }; tiktok: { enabled: boolean } } {
  const g = globalThis as {
    __crmSubmissionWorker?: NodeJS.Timeout;
    __crmTrackingWorker?: NodeJS.Timeout;
    __crmMetaWorker?: NodeJS.Timeout;
    __crmTikTokWorker?: NodeJS.Timeout;
  };
  return {
    submission: { enabled: !!g.__crmSubmissionWorker },
    tracking: { enabled: !!g.__crmTrackingWorker },
    meta: { enabled: !!g.__crmMetaWorker },
    tiktok: { enabled: !!g.__crmTikTokWorker },
  };
}
