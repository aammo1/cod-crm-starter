import { Banknote, Phone, RefreshCw, ShieldCheck, Star, Truck } from "lucide-react";
import { storeConfig } from "@/config";

const ICONS = { truck: Truck, cash: Banknote, refresh: RefreshCw, shield: ShieldCheck, phone: Phone, star: Star } as const;

export function Guarantees() {
  const items = storeConfig.home.guarantees;
  if (items.length === 0) return null;
  return (
    <section className="bg-store-muted py-10">
      <ul className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((g) => {
          const Icon = ICONS[g.icon];
          return (
            <li key={g.title} className="flex gap-3">
              <Icon className="mt-0.5 size-6 shrink-0 text-store-accent" aria-hidden />
              <div>
                <h3 className="font-semibold">{g.title}</h3>
                <p className="mt-1 text-sm text-store-fg/70">{g.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
