"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureClickIds, captureFirstTouch, track } from "@/lib/storefront/track";

const META_ID = /^\d{5,20}$/;
const TIKTOK_ID = /^[A-Z0-9]{10,30}$/;

// One shared promise: the install effect registers first, so the PageView effect always runs after
// the stubs exist (same ordering as the previous synchronous install).
let loader: Promise<typeof import("./pixel-loader")> | undefined;
const loadPixels = () => (loader ??= import("./pixel-loader"));

export function Pixels({ metaPixelId, tiktokPixelId }: { metaPixelId?: string; tiktokPixelId?: string }) {
  const meta = metaPixelId && META_ID.test(metaPixelId) ? metaPixelId : undefined;
  const tiktok = tiktokPixelId && TIKTOK_ID.test(tiktokPixelId) ? tiktokPixelId : undefined;
  const pathname = usePathname();

  useEffect(captureFirstTouch, []);

  useEffect(() => {
    if (!meta && !tiktok) return;
    captureClickIds();
    let cancel: (() => void) | undefined;
    let cancelled = false;
    void loadPixels().then(({ installMeta, installTikTok, inject, scheduleLoad }) => {
      if (cancelled) return;
      if (meta) installMeta(meta);
      if (tiktok) installTikTok(tiktok);
      cancel = scheduleLoad(() => {
        if (meta) inject("https://connect.facebook.net/en_US/fbevents.js");
        if (tiktok) inject(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(tiktok)}&lib=ttq`);
      });
    });
    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [meta, tiktok]);

  useEffect(() => {
    if (!meta && !tiktok) return;
    let cancelled = false;
    void loadPixels().then(() => {
      if (cancelled) return;
      track("PageView");
      window.ttq?.page();
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, meta, tiktok]);

  return null;
}
