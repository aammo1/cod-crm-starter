import { redactText } from "@/lib/shipping/redact";

// Server-only structured logger. One JSON line per event in production
// (LOG_FORMAT=pretty for humans). Never pass PII on purpose: sensitive keys are
// replaced and every string passes through redactText (Ozon credential URLs).

type Level = "debug" | "info" | "warn" | "error";

const DENY_KEYS = new Set([
  "phone", "customerphone", "name", "customername", "address", "token", "password",
  "secret", "authorization", "cookie", "apikey", "api_key", "email",
]);
const MAX_DEPTH = 4;
const MAX_STRING = 1000;

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const text = redactText(value);
    return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean" || value === undefined) {
    return value;
  }
  if (value instanceof Error) return sanitizeLogValue(value.message, depth);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeLogValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = DENY_KEYS.has(key.toLowerCase()) ? "[redacted]" : sanitizeLogValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function formatLog(
  level: Level,
  event: string,
  fields: Record<string, unknown> = {},
  format: "json" | "pretty" = logFormat(),
  ts: string = new Date().toISOString(),
): string {
  const safe = sanitizeLogValue(fields) as Record<string, unknown>;
  const safeEvent = redactText(event);
  if (format === "pretty") {
    const rest = Object.entries(safe)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    return `${ts} ${level.toUpperCase()} ${safeEvent}${rest ? ` ${rest}` : ""}`;
  }
  // Reserved keys win over caller fields.
  return JSON.stringify({ ...safe, ts, level, event: safeEvent }).replace(/[\r\n]+/g, " ");
}

function logFormat(): "json" | "pretty" {
  const configured = process.env.LOG_FORMAT;
  if (configured === "json" || configured === "pretty") return configured;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  if (level === "debug" && process.env.NODE_ENV === "production" && process.env.LOG_LEVEL !== "debug") return;
  const line = formatLog(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>): void => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>): void => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>): void => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>): void => emit("error", event, fields),
};
