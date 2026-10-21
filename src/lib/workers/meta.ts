import { metaEnabled, metaTick } from "@/lib/services/meta";
import { setAppState } from "@/lib/services/app-state";

export function startMetaWorker() {
  if (!metaEnabled()) return;
  const global = globalThis as { __zehriMetaWorker?: NodeJS.Timeout };
  if (global.__zehriMetaWorker) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      setAppState("meta_last_tick", new Date().toISOString());
      await metaTick();
    }
    catch { console.error("[meta] conversion worker failed; will retry"); }
    finally { running = false; }
  };
  global.__zehriMetaWorker = setInterval(() => void run(), 5000);
  void run();
}
