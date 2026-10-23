import rawStoreConfig from "../../../store.config";
import { getDb } from "@/lib/db";
import { getAppState, setAppState } from "@/lib/services/app-state";
import {
  DEFAULT_STORE_SETTINGS,
  STORE_CURRENCY,
  storeSettingsSchema,
  storeSettingsUpdateSchema,
  type PublicStoreSettings,
  type StoreSettings,
} from "@/lib/store-settings-schema";

export const STORE_SETTINGS_KEY = "store_settings";

/** Missing state has defaults without writing any boot-time seed data. */
export function getStoreSettings(): StoreSettings {
  const value = getAppState(STORE_SETTINGS_KEY);
  // Raw config name (not the zod loader) keeps this service loadable in node tests.
  if (value === null) return { ...DEFAULT_STORE_SETTINGS, storeName: rawStoreConfig.name };
  // Fail closed on corrupt state rather than silently changing checkout policy.
  return storeSettingsSchema.parse(JSON.parse(value));
}

/**
 * Validated partial update; read/merge/write is serialized across DB connections.
 * Only the six safe settings are stored, together as one app_state JSON object.
 *
 * Changes apply to NEW checkouts/offers only. Order creation must persist its
 * pricing rules, computed prices/totals, discount and absolute offer deadline
 * atomically with its receipt. Replays return that receipt's original snapshot.
 * Later upsell resolution must use checkout's stored shipping rules and offered
 * price/deadline, never reload current settings or recalculate the offer price.
 * This service does not mutate orders, receipts, deadlines or stock locations.
 */
export function updateStoreSettings(input: unknown): StoreSettings {
  const update = storeSettingsUpdateSchema.parse(input);
  return getDb().transaction(() => {
    const settings = storeSettingsSchema.parse({ ...getStoreSettings(), ...update });
    setAppState(STORE_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }).immediate();
}

/** Pass a captured settings snapshot to avoid a second read during checkout. */
export function getPublicStoreSettings(
  settings: Readonly<StoreSettings> = getStoreSettings(),
): PublicStoreSettings {
  return {
    storeName: settings.storeName,
    currency: STORE_CURRENCY,
    shippingFeeMad: settings.shippingFeeMad,
    freeShippingThresholdMad: settings.freeShippingThresholdMad,
  };
}
