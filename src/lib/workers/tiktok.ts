import { tiktokEnabled, tiktokTick } from "@/lib/services/tiktok";
import { log } from "@/lib/log";
import { recordWorkerError, recordWorkerTick } from "@/lib/services/worker-status";

export const WORKER_INTERVAL_MS = 5000;

export function startTikTokWorker() {
  if (!tiktokEnabled()) return;
  const global = globalThis as { __crmTikTokWorker?: NodeJS.Timeout };
  if (global.__crmTikTokWorker) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tiktokTick();
      recordWorkerTick("tiktok");
    }
    catch (err) {
      log.error("tiktok.worker_failed", { error: err });
      recordWorkerError("tiktok", err);
    }
    finally { running = false; }
  };
  global.__crmTikTokWorker = setInterval(() => void run(), WORKER_INTERVAL_MS);
  void run();
}
