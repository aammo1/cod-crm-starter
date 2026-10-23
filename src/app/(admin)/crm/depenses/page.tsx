import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-guards";
import { adSpendTotals, listAdSpend } from "@/lib/services/ad-spend";
import { AdSpendWorkspace } from "@/components/crm/ad-spend-workspace";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dépenses pub · CRM",
  description: "Saisie quotidienne des dépenses publicitaires.",
  robots: { index: false, follow: false },
};

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Casablanca",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function casablancaDay(date: Date): string {
  return dayFormat.format(date);
}

export default async function AdSpendPage() {
  await requireAdmin();
  const now = new Date();
  const today = casablancaDay(now);
  const from = casablancaDay(new Date(now.getTime() - 29 * 86_400_000));
  const entries = listAdSpend({ from, to: today });
  const totals = adSpendTotals({ from, to: today, groupBy: "channel" });
  return (
    <AdSpendWorkspace
      initialEntries={entries}
      initialTotals={totals}
      initialFrom={from}
      initialTo={today}
      today={today}
    />
  );
}
