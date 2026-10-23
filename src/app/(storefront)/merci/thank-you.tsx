"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice, t, type Locale } from "@/config/i18n";
import { readPendingOrder, type PendingOrder } from "@/stores/funnel";

export function ThankYou({ locale, storeSlug, whatsapp }: { locale: Locale; storeSlug: string; whatsapp: string }) {
  const [order, setOrder] = useState<PendingOrder | null>(null);
  useEffect(() => { setOrder(readPendingOrder(storeSlug)); }, [storeSlug]);

  const number = order?.orderId.slice(0, 8).toUpperCase();
  const message = number ? `${t(locale, "orderNumber")} ${number}` : "";
  const wa = `https://wa.me/${whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

  return (
    <div className="space-y-6">
      {order && (
        <section className="rounded-store border border-store-border p-4 text-start">
          <p className="font-semibold">{t(locale, "orderNumber")} : <span dir="ltr">{number}</span></p>
          <ul className="mt-3 space-y-1 text-sm">
            {order.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{l.qty} × {l.name}{l.optionsLabel ? ` (${l.optionsLabel})` : ""}</span>
                <span className="tabular-nums">{formatPrice(locale, l.unitPrice * l.qty)}</span>
              </li>
            ))}
            {!!order.totals.packDiscount && order.totals.packDiscount > 0 && (
              <li className="flex justify-between text-store-accent">
                <span>{t(locale, "packDiscount")}</span>
                <span className="tabular-nums">-{formatPrice(locale, order.totals.packDiscount)}</span>
              </li>
            )}
            <li className="flex justify-between">
              <span>{t(locale, "shipping")}</span>
              <span className="tabular-nums">{order.totals.shipping === 0 ? t(locale, "freeShipping") : formatPrice(locale, order.totals.shipping)}</span>
            </li>
          </ul>
          <p className="mt-3 flex justify-between border-t border-store-border pt-2 font-semibold">
            <span>{t(locale, "total")}</span>
            <span className="tabular-nums">{formatPrice(locale, order.totals.total)}</span>
          </p>
        </section>
      )}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-11 items-center rounded-store bg-store-primary px-6 text-store-primary-fg">
          {t(locale, "contactWhatsapp")}
        </a>
        {number && (
          <Link href={`/suivi?ref=${number}`} className="inline-flex h-11 items-center rounded-store border border-store-border px-6">
            {t(locale, "trackOrder")}
          </Link>
        )}
        <Link href="/" className="inline-flex h-11 items-center rounded-store border border-store-border px-6">
          {t(locale, "home")}
        </Link>
      </div>
    </div>
  );
}
