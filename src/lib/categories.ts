/** Categories are store-owned string metadata, not a built-in niche enum.
 * TASK 20 COMPATIBILITY BRIDGE: old selectors may import these empty defaults;
 * catalog management must derive its editable suggestions from the catalog. */
export const CATEGORY_LABELS: Record<string, string> = {};
export const CATEGORY_SLUGS: string[] = [];
