import { StoreImage } from "@/components/storefront/ui/store-image";
import Link from "next/link";
import { storeConfig } from "@/config";

export function Hero() {
  const { hero } = storeConfig.home;
  return (
    <section className="relative isolate flex min-h-[60vh] items-end overflow-hidden bg-store-muted">
      <StoreImage src={hero.image} alt="" priority sizes="100vw" className="-z-10 object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 text-white">
        <h1 className="font-heading text-3xl font-semibold sm:text-5xl">{hero.title}</h1>
        <p className="mt-3 max-w-xl text-base sm:text-lg">{hero.subtitle}</p>
        <Link href={hero.ctaHref} className="mt-6 inline-flex h-12 items-center rounded-store bg-store-accent px-6 font-semibold text-white">
          {hero.ctaLabel}
        </Link>
      </div>
    </section>
  );
}
