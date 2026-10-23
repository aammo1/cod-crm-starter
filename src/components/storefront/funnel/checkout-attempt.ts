// Pure checkout-attempt logic (no React, no browser APIs) so it can be unit-tested.

export interface StoredAttempt {
  key: string;
  /** JSON of the normalized { name, phone, items } sent to the server. */
  payload: string;
  eventId: string;
  /** True after a timeout/network/5xx result: the order may already exist. */
  uncertain: boolean;
  createdAt: number;
}

export interface AttemptDecision {
  attempt: StoredAttempt;
  /** The uncertain attempt differs from what the shopper now typed: do not submit silently. */
  locked: boolean;
  /** Attempt is new and must be persisted. */
  fresh: boolean;
}

/**
 * While an attempt is uncertain the same key and the original payload are always reused;
 * edited form values never rotate the key. Otherwise a changed payload starts a new attempt.
 */
export function decideAttempt(
  stored: StoredAttempt | null, payload: string, now: number, mint: () => { key: string; eventId: string },
): AttemptDecision {
  if (stored && stored.uncertain) return { attempt: stored, locked: stored.payload !== payload, fresh: false };
  if (stored && stored.payload === payload) return { attempt: stored, locked: false, fresh: false };
  const ids = mint();
  return { attempt: { key: ids.key, eventId: ids.eventId, payload, uncertain: false, createdAt: now }, locked: false, fresh: true };
}

export type AttemptOutcome = "clear" | "uncertain" | "keep";

/** What to do with the stored record after a non-2xx (or lost) response. */
export function attemptOutcome(status: number, code: string): AttemptOutcome {
  if (status === 0 || status >= 500) return "uncertain";
  if (code === "PHONE_RECENTLY_ORDERED") return "clear";
  // Rate limits, request timeouts and 409 receipt conflicts must never rotate the key.
  if (status === 408 || status === 409 || status === 429) return "keep";
  if (status >= 400) return "clear";
  return "keep";
}

export interface FailureLabels {
  genericError: string;
  phoneInvalid: string;
  phoneRecentlyOrdered: string;
  retryLaterSeconds: string; // contains {s}
  checkoutUncertain: string;
  checkoutUncertainLocked: string;
}

export interface FailureView {
  message: string;
  /** Show the message under the phone field. */
  phoneField: boolean;
  whatsapp: boolean;
  /** Offer "retry stored payload". */
  retry: boolean;
  /** Seconds to disable submit. */
  cooldown: number;
}

export function describeFailure(
  f: { status: number; code: string; retryAfter?: number; uncertain: boolean }, labels: FailureLabels,
): FailureView {
  const base = { phoneField: false, whatsapp: false, retry: false, cooldown: 0 };
  if (f.code === "UNCERTAIN_LOCKED") return { ...base, message: labels.checkoutUncertainLocked, whatsapp: true, retry: true };
  if (f.code === "INVALID_PHONE") return { ...base, message: labels.phoneInvalid, phoneField: true };
  if (f.code === "PHONE_RECENTLY_ORDERED") return { ...base, message: labels.phoneRecentlyOrdered, whatsapp: true };
  if (f.status === 429) {
    const s = Math.max(1, Math.ceil(f.retryAfter ?? 5));
    return { ...base, message: labels.retryLaterSeconds.split("{s}").join(String(s)), cooldown: s };
  }
  if (f.uncertain) return { ...base, message: labels.checkoutUncertain, whatsapp: true, retry: true };
  return { ...base, message: labels.genericError };
}
