import { createMockProvider } from "./mock";
import { createOzonProvider } from "./ozon";
import type { DeliveryProvider } from "./provider";

type MockProvider = ReturnType<typeof createMockProvider>;

/**
 * DELIVERY_PROVIDER=mock selects the in-memory mock; unset = real Ozon adapter.
 *
 * The mock is ONE shared instance per process (kept on globalThis so Next's
 * separately bundled route/worker modules and dev reloads all see the same
 * state): submission, tracking and BL paths must observe the same parcels.
 */
export function getProvider(): DeliveryProvider {
  if (process.env.DELIVERY_PROVIDER === "mock") {
    const g = globalThis as { __crmMockProvider?: MockProvider };
    return (g.__crmMockProvider ??= createMockProvider());
  }
  return createOzonProvider();
}
