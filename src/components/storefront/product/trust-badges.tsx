import { storeConfig } from "@/config";

export function TrustBadges() {
  const badges = storeConfig.product.trustBadges;
  if (badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {badges.map((b) => (
        <li key={b} className="inline-flex items-center gap-1.5 rounded-store bg-store-muted px-3 py-1.5">
          <span aria-hidden>✓</span>
          {b}
        </li>
      ))}
    </ul>
  );
}
