import { normalizeMaPhoneCore } from "@/lib/phone-core";

/** Client-side check; shares one dependency-free normalizer with the server. Returns +2126XXXXXXXX or null. */
export function normalizeMaPhoneClient(input: string): string | null {
  return normalizeMaPhoneCore(input);
}
