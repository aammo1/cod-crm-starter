"use client";

import { preload } from "react-dom";
import { DEVICE_SIZES, IMAGE_SIZES } from "@/config/image-sizes";
import { useCallback, useEffect, useRef, useState } from "react";

export const VARIANT_IMAGES_EVENT = "storefront:variant-images";
export interface VariantImagesDetail { productId: string; images: string[] }

const SIZES = "(max-width: 768px) 100vw, 50vw";
const ALL_WIDTHS = [...IMAGE_SIZES, ...DEVICE_SIZES].sort((a, b) => a - b);

// Same /_next/image URLs, widths and quality as next/image, without bundling next's image
// helpers into the product page's first-load JS (the server-side StoreImage uses them instead).
const optimized = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

function GalleryImage({ src, alt, thumb, priority }: { src: string; alt: string; thumb?: boolean; priority?: boolean }) {
  const widths = thumb ? [ALL_WIDTHS.find((w) => w >= 64)!, ALL_WIDTHS.find((w) => w >= 128)!] : ALL_WIDTHS;
  const srcSet = thumb
    ? `${optimized(src, widths[0])} 1x, ${optimized(src, widths[1])} 2x`
    : widths.map((w) => `${optimized(src, w)} ${w}w`).join(", ");
  const fallback = optimized(src, widths[thumb ? 1 : widths.length - 1]);
  const sizes = thumb ? undefined : SIZES;
  if (priority) preload(fallback, { as: "image", imageSrcSet: srcSet, imageSizes: sizes, fetchPriority: "high" });
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallback}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      decoding="async"
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

export function Gallery({ productId, name, images, initial }: { productId: string; name: string; images: string[]; initial?: string[] }) {
  const [current, setCurrent] = useState(initial?.length ? initial : images);
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent<VariantImagesDetail>).detail;
      if (!detail || detail.productId !== productId) return;
      const next = detail.images.length ? detail.images : images;
      setCurrent((prev) => (prev.join("|") === next.join("|") ? prev : next));
    }
    window.addEventListener(VARIANT_IMAGES_EVENT, onChange);
    return () => window.removeEventListener(VARIANT_IMAGES_EVENT, onChange);
  }, [productId, images]);

  useEffect(() => {
    setActive(0);
    const el = scroller.current;
    if (el) el.scrollTo({ left: 0 });
  }, [current]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }, []);

  function goTo(index: number) {
    scroller.current?.children[index]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  if (current.length === 0) return <div className="aspect-square rounded-store bg-store-muted" aria-hidden />;

  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-store bg-store-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {current.map((src, i) => (
          <div key={src} className="relative aspect-square min-w-full snap-center">
            <GalleryImage src={src} alt={i === 0 ? name : `${name} ${i + 1}`} priority={i === 0} />
          </div>
        ))}
      </div>
      {current.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {current.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${name} ${i + 1}`}
              aria-current={i === active}
              className={`relative size-16 shrink-0 overflow-hidden rounded-store border-2 ${
                i === active ? "border-store-primary" : "border-transparent"
              }`}
            >
              <GalleryImage src={src} alt="" thumb />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
