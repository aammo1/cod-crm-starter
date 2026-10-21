"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — silently ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copier"
      aria-label={label ? `Copier ${label}` : "Copier"}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {copied ? (
        <CheckIcon className="size-3 shrink-0 text-[var(--crm-success)]" aria-hidden />
      ) : (
        <CopyIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="truncate">{label ?? value}</span>
    </button>
  );
}
