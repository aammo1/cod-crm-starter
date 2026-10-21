import { getDb } from "@/lib/db";

/** app_state keys holding the ISO heartbeat of each worker's last tick. */
export const SUBMISSION_LAST_TICK_KEY = "submission_last_tick";
export const TRACKING_LAST_TICK_KEY = "tracking_last_tick";

export function getAppState(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
