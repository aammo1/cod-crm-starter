import { metaEnabled, metaTick } from "@/lib/services/meta";
import { log } from "@/lib/log";
import { recordWorkerError, recordWorkerTick } from "@/lib/services/worker-status";

export const WORKER_INTERVAL_MS = 5000;

export function startMetaWorker() {
  if (!metaEnabled()) return;
  const global = globalThis as { __crmMetaWorker?: NodeJS.Timeout };
  if (global.__crmMetaWorker) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await metaTick();
      recordWorkerTick("meta");
    }
    catch (err) {
      log.error("meta.worker_failed", { error: err });
      recordWorkerError("meta", err);
    }
    finally { running = false; }
  };
  global.__crmMetaWorker = setInterval(() => void run(), WORKER_INTERVAL_MS);
  void run();
}
