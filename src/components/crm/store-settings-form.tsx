"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeSettingsSchema, type StoreSettings } from "@/lib/store-settings-schema";

const numericFields = [
  { key: "shippingFeeMad", label: "Frais de livraison (MAD)", min: 0, max: Number.MAX_SAFE_INTEGER },
  { key: "freeShippingThresholdMad", label: "Livraison offerte dès (MAD)", min: 0, max: Number.MAX_SAFE_INTEGER },
  { key: "upsellWindowSeconds", label: "Durée de l’offre (secondes)", min: 1, max: 300 },
  { key: "upsellDiscountPercent", label: "Réduction de l’offre (%)", min: 1, max: 90 },
] as const;

export function StoreSettingsForm({ initialSettings }: { initialSettings: StoreSettings }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = storeSettingsSchema.safeParse({
      storeName: form.get("storeName"),
      upsellEnabled: form.get("upsellEnabled") === "on",
      ...Object.fromEntries(numericFields.map(({ key }) => [key, Number(form.get(key))])),
    });
    if (!parsed.success) {
      setError("Vérifiez le nom et les valeurs indiquées. Les montants doivent être des entiers positifs ou nuls.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/crm/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Impossible d’enregistrer les paramètres.");
        return;
      }
      toast.success("Paramètres enregistrés.");
      router.refresh();
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-busy={pending} className="flex max-w-3xl flex-col gap-5">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
        <legend className="sr-only">Règles de la boutique</legend>
        <Card>
          <CardHeader>
            <CardTitle><h2>Identité</h2></CardTitle>
            <CardDescription>Le nom affiché dans votre espace équipe et à la connexion.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="storeName">Nom de la boutique</Label>
            <Input id="storeName" name="storeName" defaultValue={initialSettings.storeName} required maxLength={120} className="min-h-11" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><h2>Livraison</h2></CardTitle>
            <CardDescription>Montants entiers en MAD. Un seuil de 0 offre la livraison sur toutes les nouvelles commandes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {numericFields.slice(0, 2).map(({ key, label, min, max }) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} name={key} type="number" inputMode="numeric" min={min} max={max} step={1} required defaultValue={initialSettings[key]} className="min-h-11" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><h2>Offre complémentaire</h2></CardTitle>
            <CardDescription>La réduction concerne uniquement l’offre complémentaire après commande.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <label htmlFor="upsellEnabled" className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input id="upsellEnabled" name="upsellEnabled" type="checkbox" defaultChecked={initialSettings.upsellEnabled} className="size-5 accent-primary" aria-describedby="upsell-help" />
              Activer les offres complémentaires
            </label>
            <p id="upsell-help" className="text-sm text-muted-foreground">Une fois désactivée, aucune offre ne sera proposée sur les nouvelles commandes.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              {numericFields.slice(2).map(({ key, label, min, max }) => (
                <div key={key} className="flex flex-col gap-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} name={key} type="number" inputMode="numeric" min={min} max={max} step={1} required defaultValue={initialSettings[key]} className="min-h-11" aria-describedby={`${key}-help`} />
                  <p id={`${key}-help`} className="text-xs text-muted-foreground">De {min} à {max}{key === "upsellWindowSeconds" ? " secondes" : " %"}.</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </fieldset>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Devise : MAD · Langue : français · Fuseau horaire : Africa/Casablanca.
        Le dépôt principal conserve son identifiant MAIN, quel que soit le nom de la boutique.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Pour les nouvelles commandes et offres uniquement.</p>
        <Button type="submit" disabled={pending} className="min-h-11">{pending ? "Enregistrement…" : "Enregistrer les paramètres"}</Button>
      </div>
    </form>
  );
}
