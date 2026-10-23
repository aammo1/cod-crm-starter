import type { Metadata } from "next";
import { LeadsWorkspace } from "@/components/crm/leads-workspace";
import { requireUser } from "@/lib/auth-guards";
import { LEAD_RETENTION_DAYS, listOpenLeads } from "@/lib/services/checkout-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paniers abandonnés · CRM",
  robots: { index: false, follow: false },
};

export default async function LeadsPage() {
  await requireUser();
  return <LeadsWorkspace initialLeads={listOpenLeads()} retentionDays={LEAD_RETENTION_DAYS} />;
}
