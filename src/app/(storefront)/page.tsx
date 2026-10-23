import type { Metadata } from "next";
import { storeConfig } from "@/config";
import { Hero } from "@/components/storefront/home/hero";
import { Categories } from "@/components/storefront/home/categories";
import { BestSellers } from "@/components/storefront/home/best-sellers";
import { Guarantees } from "@/components/storefront/home/guarantees";
import { Testimonials } from "@/components/storefront/home/testimonials";
import { Faq } from "@/components/storefront/home/faq";
import { Cta } from "@/components/storefront/home/cta";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: storeConfig.seo.title },
  description: storeConfig.seo.description,
  alternates: { canonical: "/" },
};

const SECTIONS = {
  hero: Hero, categories: Categories, bestSellers: BestSellers,
  guarantees: Guarantees, testimonials: Testimonials, faq: Faq, cta: Cta,
} as const;

export default function HomePage() {
  return (
    <main>
      {storeConfig.home.sections.map((id) => {
        const Section = SECTIONS[id];
        return <Section key={id} />;
      })}
    </main>
  );
}
