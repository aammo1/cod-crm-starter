import { useEffect, useRef } from "react";
import { normalizeMaPhoneClient } from "./phone";

/** Opt-in abandoned-lead beacon: once a valid phone is typed, post after 20 s idle or on page hide, once per change. */
export function useLeadCapture(
  on: boolean | undefined, name: string, phone: string, items: { variantId: string; qty: number }[], paused: boolean,
) {
  const sent = useRef("");
  const key = on ? JSON.stringify(items) : "";
  useEffect(() => {
    if (!on || paused || !normalizeMaPhoneClient(phone)) return;
    const body = JSON.stringify({ name: name.trim(), phone, items: JSON.parse(key), sourcePath: location.pathname });
    const send = () => {
      if (sent.current === body) return;
      sent.current = body;
      fetch("/api/store/leads", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    };
    const hide = () => { if (document.visibilityState === "hidden") send(); };
    const timer = setTimeout(send, 20_000);
    addEventListener("pagehide", send);
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); removeEventListener("pagehide", send); document.removeEventListener("visibilitychange", hide); };
  }, [on, paused, name, phone, key]);
}
