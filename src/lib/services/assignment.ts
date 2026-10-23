import type Database from "better-sqlite3";
import type { StoreSettings } from "@/lib/store-settings-schema";

export const ASSIGNMENT_CURSOR_KEY = "assignment_cursor";
const OPEN_STATUSES = "'new','no_answer','call_back_later'";

type AssignmentMode = StoreSettings["assignmentMode"];
interface AgentRow { id: string; created_at: string }

/**
 * Chooses the agent for a NEW order, or null (manual mode, or no eligible agent).
 * Eligible = active users with role 'agent' (admins are never auto-assigned).
 * Must run inside the caller's write transaction (checkout/manual creation use
 * immediate transactions), so cursor read/advance is serialized and rolls back
 * together with the order insert. Synchronous and deterministic.
 */
export function pickAssignee(db: Database.Database, mode: AssignmentMode): string | null {
  if (mode === "manual") return null;
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  const agents = db.prepare(
    "SELECT id, created_at FROM users WHERE role = 'agent' AND is_active = 1 ORDER BY created_at, id",
  ).all() as AgentRow[];
  if (agents.length === 0) return null;

  let candidates = agents;
  if (mode === "least_loaded") {
    const loads = new Map(
      (db.prepare(
        `SELECT assigned_to AS id, COUNT(*) AS n FROM orders
         WHERE assigned_to IS NOT NULL AND archived_at IS NULL
           AND confirmation_status IN (${OPEN_STATUSES}) GROUP BY assigned_to`,
      ).all() as { id: string; n: number }[]).map((r) => [r.id, r.n]),
    );
    const min = Math.min(...agents.map((a) => loads.get(a.id) ?? 0));
    candidates = agents.filter((a) => (loads.get(a.id) ?? 0) === min);
  }

  const cursorRow = db.prepare("SELECT value FROM app_state WHERE key = ?").get(ASSIGNMENT_CURSOR_KEY) as
    | { value: string } | undefined;
  let chosen = candidates[0];
  if (cursorRow) {
    // The cursor user may since have been deactivated: position by its stable sort key.
    const last = db.prepare("SELECT id, created_at FROM users WHERE id = ?").get(cursorRow.value) as AgentRow | undefined;
    if (last) {
      chosen = candidates.find((a) => a.created_at > last.created_at || (a.created_at === last.created_at && a.id > last.id))
        ?? candidates[0];
    }
  }
  db.prepare(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(ASSIGNMENT_CURSOR_KEY, chosen.id);
  return chosen.id;
}
