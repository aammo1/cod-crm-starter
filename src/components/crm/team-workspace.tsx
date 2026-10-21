"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UsersIcon,
  UserXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeamAgent } from "@/lib/services/team";

const fieldClassName =
  "w-full border-input bg-background text-foreground placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring/20";

export function TeamWorkspace({ initialAgents }: { initialAgents: TeamAgent[] }) {
  const router = useRouter();

  // Create Agent Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createPending, setCreatePending] = useState(false);

  // Edit Name Dialog
  const [editingAgent, setEditingAgent] = useState<TeamAgent | null>(null);
  const [editName, setEditName] = useState("");
  const [editPending, setEditPending] = useState(false);

  // Reset Password Dialog
  const [resettingAgent, setResettingAgent] = useState<TeamAgent | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetPending, setResetPending] = useState(false);

  // Toggle Active State
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (createPending) return;

    if (!createName.trim()) {
      toast.error("Le nom est requis.");
      return;
    }
    if (!createEmail.trim()) {
      toast.error("L'adresse email est requise.");
      return;
    }
    if (createPassword.length < 12) {
      toast.error("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }

    setCreatePending(true);
    try {
      const response = await fetch("/api/crm/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          email: createEmail.trim(),
          password: createPassword,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        agent?: TeamAgent;
      } | null;

      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de créer le compte agent.");
        return;
      }

      toast.success(`Agent ${data?.agent?.name ?? createName} créé avec succès.`);
      setCreateOpen(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      router.refresh();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setCreatePending(false);
    }
  }

  function openEdit(agent: TeamAgent) {
    setEditingAgent(agent);
    setEditName(agent.name);
  }

  async function handleEditName(event: React.FormEvent) {
    event.preventDefault();
    if (!editingAgent || editPending) return;

    if (!editName.trim()) {
      toast.error("Le nom est requis.");
      return;
    }

    setEditPending(true);
    try {
      const response = await fetch(`/api/crm/team/${editingAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        agent?: TeamAgent;
      } | null;

      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de modifier le nom.");
        return;
      }

      toast.success("Nom mis à jour avec succès.");
      setEditingAgent(null);
      setEditName("");
      router.refresh();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setEditPending(false);
    }
  }

  function openResetPassword(agent: TeamAgent) {
    setResettingAgent(agent);
    setNewPassword("");
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!resettingAgent || resetPending) return;

    if (newPassword.length < 12) {
      toast.error("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }

    setResetPending(true);
    try {
      const response = await fetch(`/api/crm/team/${resettingAgent.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de réinitialiser le mot de passe.");
        return;
      }

      toast.success("Mot de passe réinitialisé. Les sessions actives ont été invalidées.");
      setResettingAgent(null);
      setNewPassword("");
      router.refresh();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setResetPending(false);
    }
  }

  async function toggleActive(agent: TeamAgent) {
    if (statusPendingId) return;

    const nextActive = !agent.isActive;
    setStatusPendingId(agent.id);

    try {
      const response = await fetch(`/api/crm/team/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        agent?: TeamAgent;
      } | null;

      if (!response.ok) {
        toast.error(data?.error ?? "Impossible de modifier le statut.");
        return;
      }

      toast.success(
        nextActive
          ? `Compte de ${agent.name} réactivé.`
          : `Compte de ${agent.name} désactivé. Les sessions actives ont été invalidées.`,
      );
      router.refresh();
    } catch {
      toast.error("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setStatusPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UsersIcon className="size-5 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Gestion de l&apos;équipe
            </h1>
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {initialAgents.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les comptes d&apos;agents pour le traitement et la confirmation des commandes.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] self-start sm:self-auto"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          Ajouter un agent
        </Button>
      </div>

      {initialAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <UsersIcon className="size-10 text-muted-foreground/50" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-foreground">Aucun agent configuré</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Commencez par ajouter un agent pour lui permettre de se connecter et de gérer les commandes.
          </p>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-6 min-h-[44px]"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            Ajouter un agent
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 sm:px-6">Agent</th>
                  <th scope="col" className="px-4 py-3 sm:px-6">Email</th>
                  <th scope="col" className="px-4 py-3 sm:px-6">Statut</th>
                  <th scope="col" className="px-4 py-3 text-right sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {initialAgents.map((agent) => (
                  <tr key={agent.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-4 sm:px-6">
                      <div className="font-medium text-foreground">{agent.name}</div>
                      <div className="font-mono text-xs text-muted-foreground/70 sm:hidden">
                        {agent.email}
                      </div>
                    </td>
                    <td className="hidden px-4 py-4 font-mono text-xs text-muted-foreground sm:table-cell sm:px-6">
                      {agent.email}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {agent.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--crm-success)]/40 bg-[var(--crm-success-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--crm-success)]">
                          <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--crm-neutral)]/40 bg-[var(--crm-neutral-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--crm-neutral)]">
                          <ShieldAlertIcon className="size-3.5" aria-hidden="true" />
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right sm:px-6">
                      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(agent)}
                          title="Modifier le nom"
                          aria-label={`Modifier le nom de ${agent.name}`}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          <PencilIcon className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Renommer</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openResetPassword(agent)}
                          title="Réinitialiser le mot de passe"
                          aria-label={`Réinitialiser le mot de passe de ${agent.name}`}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          <KeyRoundIcon className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Mot de passe</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={statusPendingId === agent.id}
                          onClick={() => toggleActive(agent)}
                          title={agent.isActive ? "Désactiver le compte" : "Réactiver le compte"}
                          aria-label={
                            agent.isActive
                              ? `Désactiver le compte de ${agent.name}`
                              : `Réactiver le compte de ${agent.name}`
                          }
                          className="min-h-[44px]"
                        >
                          {agent.isActive ? (
                            <>
                              <UserXIcon className="size-4 text-[var(--crm-danger)]" aria-hidden="true" />
                              <span className="hidden sm:inline">Désactiver</span>
                            </>
                          ) : (
                            <>
                              <UserCheckIcon className="size-4 text-[var(--crm-success)]" aria-hidden="true" />
                              <span className="hidden sm:inline">Réactiver</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Création Agent */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createPending) {
            setCreateOpen(open);
            if (!open) {
              setCreateName("");
              setCreateEmail("");
              setCreatePassword("");
            }
          }
        }}
      >
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Ajouter un nouvel agent</DialogTitle>
            <DialogDescription>
              Créez un compte pour un agent. L&apos;adresse email ne pourra plus être modifiée après création.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Nom complet</Label>
              <Input
                id="create-name"
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                placeholder="Ex. Sarah Bennani"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-email">Adresse email</Label>
              <Input
                id="create-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="Ex. sarah@example.com"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-password">Mot de passe temporaire</Label>
              <Input
                id="create-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                placeholder="Au moins 12 caractères"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className={fieldClassName}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 12 caractères. Transmettez ce mot de passe de manière sécurisée à l&apos;agent.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={createPending}
                onClick={() => setCreateOpen(false)}
                className="min-h-[44px]"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createPending} className="min-h-[44px]">
                {createPending ? "Création en cours…" : "Créer l'agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Modification Nom */}
      <Dialog
        open={editingAgent !== null}
        onOpenChange={(open) => {
          if (!editPending && !open) {
            setEditingAgent(null);
            setEditName("");
          }
        }}
      >
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Modifier le nom de l&apos;agent</DialogTitle>
            <DialogDescription>
              {editingAgent ? `Compte associé à ${editingAgent.email}` : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditName} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nouveau nom complet</Label>
              <Input
                id="edit-name"
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldClassName}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={editPending}
                onClick={() => setEditingAgent(null)}
                className="min-h-[44px]"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={editPending} className="min-h-[44px]">
                {editPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Réinitialisation Mot de passe */}
      <Dialog
        open={resettingAgent !== null}
        onOpenChange={(open) => {
          if (!resetPending && !open) {
            setResettingAgent(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="border border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définissez un nouveau mot de passe pour {resettingAgent?.name}. Toute session active de cet agent sera immédiatement invalidée.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">Nouveau mot de passe</Label>
              <Input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                placeholder="Au moins 12 caractères"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClassName}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 12 caractères. L&apos;agent devra se reconnecter avec ce nouveau mot de passe.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={resetPending}
                onClick={() => setResettingAgent(null)}
                className="min-h-[44px]"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={resetPending} className="min-h-[44px]">
                {resetPending ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
