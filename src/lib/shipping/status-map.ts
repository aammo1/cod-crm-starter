/**
 * Normalized tracking status vocabulary (task-14).
 *
 * The raw → key mappings are INTENTIONALLY EMPTY: Ozon's tracking response
 * schema and status strings are unverified (docs/ozon-api.md §5, §9 item 1)
 * and live verification is PENDING owner authorization. No status meaning may
 * be invented — every raw value normalizes to "unknown" until the exact raw
 * strings are observed live and recorded here.
 */
export const TRACKING_STATUSES = [
  "delivered",
  "refused",
  "cancelled",
  "return_in_transit",
  "in_transit",
  "at_facility",
  "out_for_delivery",
  "unknown",
] as const;

export type NormalizedTrackingStatus = (typeof TRACKING_STATUSES)[number];

/** Raw Ozon status string → normalized key. Empty until live verification. */
export const STATUS_MAP: Record<string, NormalizedTrackingStatus> = {};

// "TRACKING-NUMBER" ≈ "tracking_number" — mirrors the key matching used by the
// adapter (src/lib/shipping/ozon.ts) so STATUS_MAP entries tolerate casing and
// separator variants of the same raw string.
function keyOf(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Maps a raw provider status onto the normalized vocabulary. Unmapped / empty
 * / null values normalize to "unknown" — never guess a meaning.
 */
export function normalizeStatus(rawStatus: string | null): NormalizedTrackingStatus {
  const trimmed = rawStatus?.trim();
  if (!trimmed) return "unknown";
  const direct = STATUS_MAP[trimmed];
  if (direct) return direct;
  const wanted = keyOf(trimmed);
  for (const [raw, target] of Object.entries(STATUS_MAP)) {
    if (keyOf(raw) === wanted) return target;
  }
  return "unknown";
}
