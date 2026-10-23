import type { Locale } from "@/config/i18n";

export interface FunnelProps {
  locale: Locale;
  storeSlug: string;
  /** wa.me format, digits only. */
  whatsapp: string;
  shippingFeeMad: number;
  freeShippingThresholdMad: number;
}
