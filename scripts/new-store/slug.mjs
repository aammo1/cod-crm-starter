// Slug and domain helpers for the new-store wizard (pure, no side effects).
import crypto from "node:crypto";

const ARABIC = {
  "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ى": "a", "ة": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j",
  "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s",
  "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l",
  "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ء": "",
};

const latin = (value) => String(value ?? "").trim()
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

// Latin-only slug (empty for non-Latin input).
export function slugify(value) {
  return latin(value);
}

// Latin slug, falling back to a basic Arabic transliteration. May return "".
export function slugifyWithArabic(value) {
  const direct = latin(value);
  if (direct) return direct;
  const mapped = [...String(value ?? "").normalize("NFKC")].map((c) => ARABIC[c] ?? c).join("");
  return latin(mapped);
}

export function randomStoreSlug() {
  return `store-${crypto.randomBytes(3).toString("hex")}`;
}

// Unique category slugs; empty slugs become cat-<n> (1-based index).
export function categorySlugs(labels) {
  const used = new Set();
  return labels.map((label, i) => {
    const base = slugifyWithArabic(label) || `cat-${i + 1}`;
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return { slug, label };
  });
}

// Returns the origin; throws Error with a French message on invalid input.
export function normalizeDomain(value) {
  const v = String(value ?? "").trim();
  const explicit = /^([a-z][a-z0-9+.-]*):\/\//i.exec(v);
  if (explicit && !/^https?$/i.test(explicit[1])) throw new Error("URL invalide (ex. https://maboutique.ma)");
  let url;
  try { url = new URL(explicit ? v : `https://${v}`); } catch { throw new Error("URL invalide (ex. https://maboutique.ma)"); }
  if (!url.hostname) throw new Error("URL invalide (ex. https://maboutique.ma)");
  if (url.protocol === "http:" && url.hostname !== "localhost") {
    throw new Error("HTTPS requis : utilisez https://… (http:// n'est accepté que pour localhost)");
  }
  return url.origin;
}
