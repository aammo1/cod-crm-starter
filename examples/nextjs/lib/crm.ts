import "server-only";
import { createStorefrontClient } from "../../../integrations/storefront-client";

/** Request-time configuration: builds need no secrets and keys never enter RSC props. */
export function crm() {
  return createStorefrontClient({
    baseUrl: process.env.CRM_BASE_URL ?? "",
    apiKey: process.env.CRM_STOREFRONT_KEY ?? "",
    timeoutMs: 5000,
    maxRetries: 1,
  });
}
