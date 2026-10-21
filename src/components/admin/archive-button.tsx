"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function ArchiveButton({
  productId,
  active,
}: {
  productId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/${active ? "archive" : "restore"}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Une erreur est survenue.");
        return;
      }
      toast.success(active ? "Produit archivé." : "Produit restauré.");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Une erreur réseau est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg px-2 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      {active ? "Archiver" : "Restaurer"}
    </button>
  );
}
