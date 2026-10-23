import type { Metadata } from "next";
import { storeConfig } from "@/config";

/** Pure SEO helpers (no data access). */
export function ogLocale(locale: "fr" | "ar"): string {
  return locale === "ar" ? "ar_MA" : "fr_MA";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = storeConfig.domain.replace(/\/+$/, "");
  return path === "/" || path === "" ? `${base}/` : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/** Base Open Graph shared by every page; per-page metadata replaces (not merges) openGraph, so spread this. */
export function baseOpenGraph(extra: { title?: string; description?: string; images?: string[]; type?: "website" | "article" } = {}): OpenGraph {
  const images = extra.images?.length ? extra.images : storeConfig.seo.ogImage ? [storeConfig.seo.ogImage] : [];
  return {
    siteName: storeConfig.name,
    locale: ogLocale(storeConfig.locale),
    type: extra.type ?? "website",
    title: extra.title ?? storeConfig.seo.title,
    description: extra.description ?? storeConfig.seo.description,
    ...(images.length ? { images: images.map((url) => ({ url })) } : {}),
  } as OpenGraph;
}

/** Safe JSON-LD serializer: escapes `<` so content can never close the script element. */
export function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
