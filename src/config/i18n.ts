import { ar } from "./i18n-ar";
import { fr } from "./i18n-fr";

export type Locale = "fr" | "ar";
export type UiKey = keyof typeof fr;

/**
 * The locale is fixed per store at build time: next.config.ts inlines it as
 * NEXT_PUBLIC_STORE_LOCALE so the bundler drops the unused dictionary from client chunks.
 * Without it (plain node tests) both dictionaries are available.
 */
const BUILD_LOCALE = process.env.NEXT_PUBLIC_STORE_LOCALE;

function dictionary(locale: Locale): Record<UiKey, string> {
  if (BUILD_LOCALE === "ar") return ar;
  if (BUILD_LOCALE === "fr") return fr;
  return locale === "ar" ? ar : fr;
}

export function pieces(locale: Locale, n: number): string {
  return t(locale, n === 1 ? "piece" : "pieces", { n });
}

export function t(locale: Locale, key: UiKey, vars?: Record<string, string | number>): string {
  let s: string = dictionary(locale)[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const currencyLabel = (locale: Locale): string => (locale === "ar" ? "درهم" : "DH");

/** Integer MAD price: "199 DH" (fr) or "199 درهم" (ar). */
export function formatPrice(locale: Locale, n: number): string {
  return `${n} ${currencyLabel(locale)}`;
}

/** Pre-translated strings for the BuyBox client component (keeps the dictionary out of the client bundle). */
const BUY_BOX_KEYS = ["chooseOption", "packs", "bestValue", "quantity", "decrease", "increase", "soldOut", "orderNow", "addToCart", "viewOffer", "piece", "pieces"] as const;
export type BuyBoxLabels = Record<(typeof BUY_BOX_KEYS)[number], string> & { currency: string };

/** Server-side only: do not import from client components. */
export function buyBoxLabels(locale: Locale): BuyBoxLabels {
  const labels = { currency: currencyLabel(locale) } as BuyBoxLabels;
  for (const key of BUY_BOX_KEYS) labels[key] = t(locale, key);
  return labels;
}

const LANDING_KEYS = [
  "chooseOption", "packs", "bestValue", "differentOptions", "unit", "orderNow", "confirmOrder", "fullName", "phone",
  "phonePlaceholder", "phoneInvalid", "nameRequired", "cod", "sending", "soldOut", "subtotal", "shipping",
  "freeShipping", "total", "genericError", "retryLater", "piece", "pieces", "save", "retryLaterSeconds",
  "checkoutUncertain", "checkoutUncertainLocked", "phoneRecentlyOrdered", "packDiscount", "errorRetry", "contactWhatsapp", "leadNotice",
] as const;
export type LandingLabels = Record<(typeof LANDING_KEYS)[number], string> & { currency: string };

/** Server-side only: pre-translated strings for the landing client islands. */
export function landingLabels(locale: Locale): LandingLabels {
  const labels = { currency: currencyLabel(locale) } as LandingLabels;
  for (const key of LANDING_KEYS) labels[key] = t(locale, key);
  return labels;
}
