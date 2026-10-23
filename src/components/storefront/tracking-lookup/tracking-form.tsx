"use client";

import { useEffect, useState, type FormEvent } from "react";
import { normalizeMaPhoneClient } from "@/components/storefront/funnel/phone";

const STATUSES = ["received", "confirmed", "shipped", "delivered", "refused", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

export type TrackingLabels = Record<Status | "orderNumber" | "phone" | "phonePlaceholder" | "phoneInvalid" | "submit"
  | "checking" | "trackingNumber" | "notFound" | "rateLimited" | "genericError", string>;

type Result = { status: Status; trackingNumber?: string };

export function TrackingForm({ labels }: { labels: TrackingLabels }) {
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("ref");
    if (initial) setRef(initial.slice(0, 40));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setResult(null);
    const normalized = normalizeMaPhoneClient(phone);
    if (!normalized) return setError(labels.phoneInvalid);
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/store/track", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRef: ref.trim(), phone: normalized }),
      });
      if (res.ok) {
        const data = (await res.json()) as Result;
        if (STATUSES.includes(data.status)) setResult(data); else setError(labels.genericError);
      } else if (res.status === 404) setError(labels.notFound);
      else if (res.status === 429) setError(labels.rateLimited);
      else setError(labels.genericError);
    } catch {
      setError(labels.genericError);
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 h-11 w-full rounded-store border border-store-border bg-store-bg px-3";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block text-sm font-medium">{labels.orderNumber}
        <input value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" autoComplete="off" required maxLength={40} className={field} />
      </label>
      <label className="block text-sm font-medium">{labels.phone}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" autoComplete="tel"
          required placeholder={labels.phonePlaceholder} className={field} />
      </label>
      <button type="submit" disabled={busy || !ref.trim() || !phone.trim()}
        className="h-11 w-full rounded-store bg-store-primary px-6 text-store-primary-fg disabled:opacity-60">
        {busy ? labels.checking : labels.submit}
      </button>
      <div aria-live="polite">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="rounded-store border border-store-border p-4">
            <p className="font-semibold">{labels[result.status]}</p>
            {result.trackingNumber && (
              <p className="mt-2 text-sm">{labels.trackingNumber} : <span dir="ltr">{result.trackingNumber}</span></p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
