import type { CommerceOrderItem } from "@/lib/commerce-types";

type ItemLabel = Pick<CommerceOrderItem, "name" | "variant_label" | "options" | "quantity">;

/** Display only persisted snapshots, including variants since renamed or archived. */
export function orderItemLabel(item: ItemLabel): string {
  const variant = item.variant_label?.trim() || item.options
    ?.map((option) => `${option.name} : ${option.value}`).join(" / ");
  return `${item.name}${variant ? ` (${variant})` : ""} ×${item.quantity}`;
}

/** Keep parcel-nature concise; no customer data or current catalog lookup. */
export function shipmentDescription(items: ItemLabel[]): string {
  return Array.from(items.map(orderItemLabel).join(" ; ").replace(/\s+/g, " ").trim() || "Articles")
    .slice(0, 255).join("");
}
