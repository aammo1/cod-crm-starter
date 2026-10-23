import Link from "next/link";
import { storeConfig } from "@/config";

export function Cta() {
  const cta = storeConfig.home.cta;
  if (!cta) return null;
  return (
    <section className="bg-store-primary py-12 text-center text-store-primary-fg">
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="font-heading text-2xl font-semibold">{cta.title}</h2>
        <p className="mt-2">{cta.text}</p>
        <Link href={cta.href} className="mt-6 inline-flex h-12 items-center rounded-store bg-store-accent px-6 font-semibold text-store-accent-fg">
          {cta.label}
        </Link>
      </div>
    </section>
  );
}
