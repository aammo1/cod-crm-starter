import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MANUAL_ORDER_SOURCES,
  MANUAL_ORDER_SOURCE_LABELS,
  type ManualOrderSource,
} from "@/lib/manual-order-schema";
import { fieldClassName } from "./types";

export function CustomerFields({
  formUid,
  isSubmitting,
  clientErrors,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  source,
  setSource,
}: {
  formUid: string;
  isSubmitting: boolean;
  clientErrors: Record<string, string>;
  customerName: string;
  setCustomerName: (value: string) => void;
  customerPhone: string;
  setCustomerPhone: (value: string) => void;
  source: ManualOrderSource;
  setSource: (value: ManualOrderSource) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Client & Canal d&apos;origine
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Customer Name */}
        <div>
          <Label htmlFor={`${formUid}-name`} className="text-xs font-medium text-muted-foreground">
            Nom complet du client <span className="text-[var(--crm-danger)]">*</span>
          </Label>
          <Input
            id={`${formUid}-name`}
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="ex : Fatima Zahra"
            disabled={isSubmitting}
            className={`mt-1.5 ${fieldClassName} ${
              clientErrors.customerName ? "border-[var(--crm-danger)]/60 focus-visible:ring-[var(--crm-danger)]/20" : ""
            }`}
          />
          {clientErrors.customerName ? (
            <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
              {clientErrors.customerName}
            </p>
          ) : null}
        </div>

        {/* Customer Phone */}
        <div>
          <Label htmlFor={`${formUid}-phone`} className="text-xs font-medium text-muted-foreground">
            Numéro de téléphone marocain <span className="text-[var(--crm-danger)]">*</span>
          </Label>
          <Input
            id={`${formUid}-phone`}
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="ex : 0612345678"
            disabled={isSubmitting}
            className={`mt-1.5 ${fieldClassName} ${
              clientErrors.customerPhone ? "border-[var(--crm-danger)]/60 focus-visible:ring-[var(--crm-danger)]/20" : ""
            }`}
          />
          {clientErrors.customerPhone ? (
            <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
              {clientErrors.customerPhone}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Formats acceptés : 06XXXXXXXX, 07XXXXXXXX ou +212…
            </p>
          )}
        </div>

        {/* Order Source */}
        <div>
          <Label htmlFor={`${formUid}-source`} className="text-xs font-medium text-muted-foreground">
            Canal de réception <span className="text-[var(--crm-danger)]">*</span>
          </Label>
          <div className="mt-1.5">
            <Select
              value={source}
              onValueChange={(val) => setSource(val as ManualOrderSource)}
              disabled={isSubmitting}
            >
              <SelectTrigger id={`${formUid}-source`} className={fieldClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_ORDER_SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>
                    {MANUAL_ORDER_SOURCE_LABELS[src]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </section>
  );
}
