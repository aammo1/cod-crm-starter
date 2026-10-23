import { tiktokEnabled, tiktokTick } from "@/lib/services/tiktok";
import { setAppState } from "@/lib/services/app-state";

export function startTikTokWorker() {
  if (!tiktokEnabled()) return;
  const global = globalThis as { __crmTikTokWorker?: NodeJS.Timeout };
  if (global.__crmTikTokWorker) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      setAppState("tiktok_last_tick", new Date().toISOString());
      await tiktokTick();
    }
    catch { console.error("[tiktok] conversion worker failed; will retry"); }
    finally { running = false; }
  };
  global.__crmTikTokWorker = setInterval(() => void run(), 5000);
  void run();
}
