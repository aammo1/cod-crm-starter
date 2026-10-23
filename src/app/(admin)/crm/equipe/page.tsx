import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-guards";
import { listOtherAdmins, listTeamAgents } from "@/lib/services/team";
import { TeamWorkspace } from "@/components/crm/team-workspace";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Équipe · CRM",
  description: "Gestion des comptes agents de votre équipe.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function TeamPage() {
  const admin = await requireAdmin();
  const agents = listTeamAgents();
  const otherAdmins = listOtherAdmins(admin.id);

  return <TeamWorkspace initialAgents={agents} otherAdmins={otherAdmins} />;
}
