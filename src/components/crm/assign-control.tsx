"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CrmAgentOption {
  id: string;
  name: string;
  role: string;
}

async function assign(orderId: string, agentId: string): Promise<boolean> {
  const response = await fetch(`/api/crm/orders/${orderId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });
  if (response.ok) return true;
  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  toast.error(data?.error ?? "Erreur lors de l'assignation.");
  return false;
}

export function AssignControl({
  orderId,
  currentAssignedTo,
  currentUserId,
  isAdmin,
  agents,
}: {
  orderId: string;
  currentAssignedTo: string | null;
  currentUserId: string;
  isAdmin: boolean;
  agents: CrmAgentOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(agentId: string) {
    setPending(true);
    const ok = await assign(orderId, agentId);
    if (ok) {
      toast.success("Commande assignée.");
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentAssignedTo !== currentUserId ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run("me")}
        >
          <UserCheckIcon aria-hidden />
          Me l&apos;assigner
        </Button>
      ) : null}
      {isAdmin ? (
        <Select
          value={currentAssignedTo ?? undefined}
          onValueChange={(agentId) => run(agentId)}
          disabled={pending}
        >
          <SelectTrigger
            aria-label="Assigner à un agent"
            className="w-56 border-input bg-card text-foreground"
          >
            <SelectValue placeholder="Assigner à…" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name} {agent.role === "admin" ? "(admin)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
