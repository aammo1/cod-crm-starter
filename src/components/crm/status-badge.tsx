import { cn } from "@/lib/utils";

export type ConfirmationStatus =
  | "new"
  | "no_answer"
  | "call_back_later"
  | "confirmed"
  | "cancelled";

export const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  new: "Nouvelle",
  no_answer: "Sans réponse",
  call_back_later: "Rappel",
  confirmed: "Confirmée",
  cancelled: "Annulée",
};

const CONFIRMATION_STYLES: Record<ConfirmationStatus, string> = {
  new: "border-[var(--crm-info)]/40 bg-[var(--crm-info-bg)] text-[var(--crm-info)]",
  no_answer: "border-[var(--crm-warning)]/40 bg-[var(--crm-warning-bg)] text-[var(--crm-warning)]",
  call_back_later: "border-[var(--crm-upsell)]/40 bg-[var(--crm-upsell-bg)] text-[var(--crm-upsell)]",
  confirmed: "border-[var(--crm-success)]/40 bg-[var(--crm-success-bg)] text-[var(--crm-success)]",
  cancelled: "border-[var(--crm-neutral)]/40 bg-[var(--crm-neutral-bg)] text-[var(--crm-neutral)]",
};

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone: "Téléphone",
  note: "Note",
};

export const OUTCOME_LABELS: Record<string, string> = {
  no_answer: "Sans réponse",
  call_back_later: "Rappel plus tard",
  note: "Note",
  confirmed_info: "Infos confirmées",
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  queued: "En file",
  submitting: "En cours d'envoi",
  submitted: "Transmise au transporteur",
  failed: "Échec",
  needs_review: "À vérifier",
};

export const UPSELL_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Accepté",
  declined: "Refusé",
};

export const COD_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "En attente de paiement",
  paid: "Payée",
};

export function isConfirmationStatus(value: string): value is ConfirmationStatus {
  return value in CONFIRMATION_LABELS;
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = isConfirmationStatus(status) ? status : "new";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        CONFIRMATION_STYLES[key],
        className,
      )}
    >
      {CONFIRMATION_LABELS[key]}
    </span>
  );
}
