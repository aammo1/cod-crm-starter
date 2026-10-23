import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-guards";
import { getUnpaidAging, listRemittances } from "@/lib/services/cod-remittances";
import { RemittanceWorkspace } from "@/components/crm/remittance-workspace";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Encaissements · CRM",
  description: "Rapprochement des remises COD du transporteur.",
  robots: { index: false, follow: false },
};

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Casablanca",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function RemittancesPage() {
  await requireAdmin();
  return (
    <RemittanceWorkspace
      initialRemittances={listRemittances()}
      initialAging={getUnpaidAging()}
      today={dayFormat.format(new Date())}
    />
  );
}
