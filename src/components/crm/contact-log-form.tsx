"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  PhoneOffIcon,
  StickyNoteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCasablancaWallTime,
  getInOneHourCasablanca,
  getTomorrowCasablancaAt10,
} from "@/lib/callback-time";

type OutcomeType = "no_answer" | "call_back_later" | "note" | "confirmed_info";

interface ContactLogFormProps {
  orderId: string;
  orderStatus?: string;
}

export function ContactLogForm({ orderId, orderStatus }: ContactLogFormProps) {
  const router = useRouter();
  const isTerminal = orderStatus === "confirmed" || orderStatus === "cancelled";

  const [outcome, setOutcome] = useState<OutcomeType>(
    isTerminal ? "note" : "no_answer",
  );
  const [channel, setChannel] = useState<string>("phone");
  const [note, setNote] = useState("");
  const [nextCallbackAt, setNextCallbackAt] = useState("");
  // Set on focus (not render) to avoid an SSR/client hydration mismatch.
  const [minCallbackAt, setMinCallbackAt] = useState<string>();
  const [pending, setPending] = useState(false);

  const submitting = useRef(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  function handleSelectOutcome(newOutcome: OutcomeType) {
    if (isTerminal && (newOutcome === "no_answer" || newOutcome === "call_back_later")) {
      return;
    }
    setOutcome(newOutcome);
    if (newOutcome === "note") {
      setChannel("note");
    } else if (channel === "note") {
      setChannel("phone");
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    if (outcome === "call_back_later" && !nextCallbackAt.trim()) {
      toast.error("Veuillez sélectionner une date et heure de rappel.");
      dateInputRef.current?.focus();
      return;
    }

    if (outcome === "note" && !note.trim()) {
      toast.error("Veuillez saisir une note.");
      return;
    }

    submitting.current = true;
    setPending(true);

    try {
      const response = await fetch(`/api/crm/orders/${orderId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          outcome,
          note: note.trim() ? note.trim() : undefined,
          next_callback_at:
            outcome === "call_back_later" && nextCallbackAt.trim()
              ? nextCallbackAt.trim()
              : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        toast.error(data?.error ?? "Erreur lors de l'enregistrement.");
        return;
      }

      setNote("");
      setNextCallbackAt("");
      toast.success("Contact enregistré.");
      router.refresh();
    } catch {
      toast.error("Erreur lors de l'enregistrement.");
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  const allowedChannels =
    outcome === "note"
      ? [
          { value: "note", label: "Note" },
          { value: "phone", label: "Téléphone" },
          { value: "whatsapp", label: "WhatsApp" },
        ]
      : [
          { value: "phone", label: "Téléphone" },
          { value: "whatsapp", label: "WhatsApp" },
        ];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isTerminal ? (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          Commande{" "}
          <span className="font-semibold text-foreground">
            {orderStatus === "confirmed" ? "confirmée" : "annulée"}
          </span>{" "}
          — les actions de statut sont verrouillées. Vous pouvez consigner une note
          d&apos;historique ci-dessous.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectOutcome("no_answer")}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                outcome === "no_answer"
                  ? "border-[var(--crm-warning)]/60 bg-[var(--crm-warning-bg)] text-[var(--crm-warning)] shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
              }`}
            >
              <PhoneOffIcon className="size-4 text-[var(--crm-warning)]" aria-hidden />
              Sans réponse
            </button>

            <button
              type="button"
              onClick={() => handleSelectOutcome("call_back_later")}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                outcome === "call_back_later"
                  ? "border-[var(--crm-upsell)]/60 bg-[var(--crm-upsell-bg)] text-[var(--crm-upsell)] shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
              }`}
            >
              <CalendarClockIcon className="size-4 text-[var(--crm-upsell)]" aria-hidden />
              Programmer un rappel
            </button>

            <span className="mx-1 hidden h-6 w-px bg-border sm:inline-block" />

            <button
              type="button"
              onClick={() => handleSelectOutcome("note")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                outcome === "note"
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <StickyNoteIcon className="size-3.5" aria-hidden />
              Note
            </button>

            <button
              type="button"
              onClick={() => handleSelectOutcome("confirmed_info")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                outcome === "confirmed_info"
                  ? "border-[var(--crm-success)]/50 bg-[var(--crm-success-bg)] text-[var(--crm-success)]"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <CheckCircle2Icon className="size-3.5 text-[var(--crm-success)]" aria-hidden />
              Infos confirmées
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {outcome === "no_answer" &&
              "Enregistre un appel sans réponse et met à jour le statut en « Sans réponse »."}
            {outcome === "call_back_later" &&
              "Définit une date de rappel et met à jour le statut en « Rappel plus tard »."}
            {outcome === "note" &&
              "Consigne une note d'échange sans modifier le statut de la commande."}
            {outcome === "confirmed_info" &&
              "Note les précisions obtenues auprès de la cliente."}
          </p>
        </div>
      )}

      {outcome === "confirmed_info" ? (
        <div className="rounded-lg border border-[var(--crm-warning)]/30 bg-[var(--crm-warning-bg)] p-3 text-xs text-[var(--crm-warning)]">
          <p className="font-semibold">
            Information importante : « Infos confirmées » ne remplace pas la confirmation
          </p>
          <p className="mt-1 text-[var(--crm-warning)]/80">
            Cette action consigne simplement l&apos;obtention des renseignements dans le journal.
            Pour réserver les articles et lancer l&apos;expédition, veuillez utiliser le bouton{" "}
            <strong className="text-foreground">Confirmer la commande</strong>.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-channel" className="text-muted-foreground">
            Canal
          </Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger
              id="contact-channel"
              className="w-full border-input bg-card text-foreground"
            >
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              {allowedChannels.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {outcome === "call_back_later" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="contact-callback" className="text-foreground font-medium">
                Date et heure du rappel <span className="text-[var(--crm-danger)]">*</span>
              </Label>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--crm-upsell)]">
                <ClockIcon className="size-3" aria-hidden />
                Heure de Casablanca
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <span className="text-[11px] text-muted-foreground">Raccourcis :</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNextCallbackAt(getInOneHourCasablanca())}
                className="h-6 px-2 text-[11px] border-border bg-card text-foreground hover:bg-muted"
              >
                Dans 1 h
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNextCallbackAt(getTomorrowCasablancaAt10())}
                className="h-6 px-2 text-[11px] border-border bg-card text-foreground hover:bg-muted"
              >
                Demain 10:00
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  dateInputRef.current?.focus();
                  try {
                    (dateInputRef.current as HTMLInputElement & { showPicker?: () => void })?.showPicker?.();
                  } catch {
                    // Ignore if showPicker is unsupported
                  }
                }}
                className="h-6 px-2 text-[11px] border-border bg-card text-foreground hover:bg-muted"
              >
                Choisir une date
              </Button>
            </div>

            <Input
              id="contact-callback"
              ref={dateInputRef}
              type="datetime-local"
              required
              min={minCallbackAt}
              onFocus={() => setMinCallbackAt(formatCasablancaWallTime(new Date()))}
              value={nextCallbackAt}
              onChange={(event) => setNextCallbackAt(event.target.value)}
              className="border-input bg-card text-foreground"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-note" className="text-muted-foreground">
          Note {outcome === "note" ? <span className="text-[var(--crm-danger)]">*</span> : "(optionnelle)"}
        </Label>
        <Textarea
          id="contact-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            outcome === "no_answer"
              ? "Précisions sur la tentative d'appel (optionnel)…"
              : outcome === "call_back_later"
                ? "Motif ou consignes particulières pour le rappel (optionnel)…"
                : outcome === "confirmed_info"
                  ? "Détails des informations confirmées avec la cliente…"
                  : "Détails de l'échange…"
          }
          className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
          rows={2}
          required={outcome === "note"}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={
            pending ||
            (outcome === "call_back_later" && !nextCallbackAt.trim()) ||
            (outcome === "note" && !note.trim())
          }
          className={
            outcome === "no_answer"
              ? "bg-[var(--crm-warning)] text-white hover:opacity-90"
              : outcome === "call_back_later"
                ? "bg-[var(--crm-upsell)] text-white hover:opacity-90"
                : outcome === "confirmed_info"
                  ? "bg-[var(--crm-success)] text-white hover:opacity-90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
          }
        >
          {pending
            ? "Enregistrement…"
            : outcome === "no_answer"
              ? "Enregistrer : Sans réponse"
              : outcome === "call_back_later"
                ? "Programmer le rappel"
                : outcome === "confirmed_info"
                  ? "Enregistrer les infos confirmées"
                  : "Enregistrer la note"}
        </Button>

        {outcome === "call_back_later" && !nextCallbackAt.trim() ? (
          <span className="text-xs text-muted-foreground">
            Sélectionnez une date/heure pour enregistrer
          </span>
        ) : null}
      </div>
    </form>
  );
}
