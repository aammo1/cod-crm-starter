import { CityCombobox } from "@/components/crm/city-combobox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldClassName, type SerializableCity } from "./types";

export function ShippingFields({
  formUid,
  isSubmitting,
  clientErrors,
  cities,
  selectedCityId,
  setSelectedCityId,
  address,
  setAddress,
  note,
  setNote,
}: {
  formUid: string;
  isSubmitting: boolean;
  clientErrors: Record<string, string>;
  cities: SerializableCity[];
  selectedCityId: string;
  setSelectedCityId: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Livraison & Notes internes (optionnels)
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* City */}
        <div>
          <Label htmlFor={`${formUid}-city`} className="text-xs font-medium text-muted-foreground">
            Ville de livraison
          </Label>
          <div className="mt-1.5">
            <CityCombobox
              id={`${formUid}-city`}
              cities={cities}
              value={selectedCityId === "none" ? "" : selectedCityId}
              onChange={(next) => setSelectedCityId(next || "none")}
              disabled={isSubmitting || cities.length === 0}
              noneLabel="Non renseignée (à préciser à la confirmation)"
              className={fieldClassName}
            />
          </div>
          {cities.length === 0 ? (
            <p className="mt-1 text-[11px] text-[var(--crm-warning)]">
              Aucune ville synchronisée. La ville pourra être choisie lors de la confirmation.
            </p>
          ) : null}
        </div>

        {/* Address */}
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`${formUid}-address`} className="text-xs font-medium text-muted-foreground">
              Adresse de livraison
            </Label>
            <span className="text-[11px] text-muted-foreground">{address.length}/500</span>
          </div>
          <Textarea
            id={`${formUid}-address`}
            value={address}
            onChange={(e) => setAddress(e.target.value.slice(0, 500))}
            placeholder="Quartier, résidence, rue, n°…"
            rows={2}
            disabled={isSubmitting}
            className={`mt-1.5 ${fieldClassName} ${
              clientErrors.address ? "border-[var(--crm-danger)]/60" : ""
            }`}
          />
          {clientErrors.address ? (
            <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
              {clientErrors.address}
            </p>
          ) : null}
        </div>

        {/* Internal note */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${formUid}-note`} className="text-xs font-medium text-muted-foreground">
              Note interne (attribuée dans le journal de contact)
            </Label>
            <span className="text-[11px] text-muted-foreground">{note.length}/2000</span>
          </div>
          <Textarea
            id={`${formUid}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 2000))}
            placeholder="Instructions particulières de livraison, créneau préféré par le client, contexte…"
            rows={3}
            disabled={isSubmitting}
            className={`mt-1.5 ${fieldClassName} ${
              clientErrors.note ? "border-[var(--crm-danger)]/60" : ""
            }`}
          />
          {clientErrors.note ? (
            <p className="mt-1 text-xs text-[var(--crm-danger)]" role="alert">
              {clientErrors.note}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cette note sera consignée dans l&apos;historique de la commande avec la mention du canal choisi.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
