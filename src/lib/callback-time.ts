export const CASABLANCA_TIMEZONE = "Africa/Casablanca";

/**
 * Formatter for extracting Africa/Casablanca local date and time parts.
 */
const casablancaPartsDtf = new Intl.DateTimeFormat("en-US", {
  timeZone: CASABLANCA_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function getCasablancaParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const parts: Record<string, string> = {};
  for (const part of casablancaPartsDtf.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute: parts.minute,
  };
}

/**
 * Formats a Date instant into a datetime-local string (YYYY-MM-DDTHH:mm)
 * according to Africa/Casablanca wall time.
 */
export function formatCasablancaWallTime(date: Date): string {
  const p = getCasablancaParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * "Dans 1 h" shortcut: current instant plus one elapsed hour (3600 seconds),
 * formatted as Africa/Casablanca wall time.
 */
export function getInOneHourCasablanca(now: Date = new Date()): string {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  return formatCasablancaWallTime(oneHourLater);
}

/**
 * "Demain" shortcut: tomorrow's Africa/Casablanca calendar date at 10:00.
 * Uses explicit calendar arithmetic in Africa/Casablanca.
 */
export function getTomorrowCasablancaAt10(now: Date = new Date()): string {
  const p = getCasablancaParts(now);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);

  // Advancing via UTC date performs pure Gregorian calendar arithmetic without DST shift issues
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = nextDay.getUTCFullYear();
  const nm = String(nextDay.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(nextDay.getUTCDate()).padStart(2, "0");

  return `${ny}-${nm}-${nd}T10:00`;
}

/**
 * Human-readable display of a date or ISO string in Africa/Casablanca timezone.
 * Safe for client-side rendering (no database or server-only dependencies).
 */
const casablancaDisplayDtf = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CASABLANCA_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCasablancaDisplay(dateOrIso: string | Date): string {
  const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  return casablancaDisplayDtf.format(d);
}
