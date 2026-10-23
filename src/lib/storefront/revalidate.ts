import { revalidatePath, revalidateTag } from "next/cache";
import { STOREFRONT_TAG } from "./tag";

/** Call after any successful mutation that can change what shoppers see. Cheap and idempotent. */
export function revalidateStorefront(): void {
  revalidateTag(STOREFRONT_TAG);
  revalidatePath("/", "layout"); // also drops ISR HTML/RSC for every storefront route
}
