"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CityTariff } from "@/lib/services/city-tariffs";

const MAX_ROWS = 500;

interface Draft { courier: string; fee: string; ignores: boolean }

const toDraft = (t: CityTariff): Draft => ({
  courier: t.courierCost === null ? "" : String(t.courierCost),
  fee: t.customerFeeOverride === null ? "" : String(t.customerFeeOverride),
  ignores: t.overrideIgnoresFreeThreshold,
});

function parseMad(raw: string): number | null | "invalid" {
  const v = raw.trim();
  if (v === "") return null;
  if (!/^\d{1,7}$/.test(v)) return "invalid";
  return Number(v);
}

export function CityTariffsManager({ initialTariffs, initialDefaultCost }: {
  initialTariffs: CityTariff[]; initialDefaultCost: number | null;
}) {
  const router = useRouter();
  const [tariffs, setTariffs] = useState(initialTariffs);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [query, setQuery] = useState("");
  const [defaultCost, setDefaultCost] = useState(initialDefaultCost === null ? "" : String(initialDefaultCost));
  const [csv, setCsv] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = useRef(false);

  async function post(key: string, body: unknown, success: string): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true; setBusyKey(key);
    try {
      const response = await fetch("/api/crm/city-tariffs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) { toast.error(data?.error ?? "Enregistrement impossible."); return false; }
      toast.success(success);
      return true;
    } catch { toast.error("Erreur de connexion."); return false; }
    finally { busy.current = false; setBusyKey(null); }
  }

  async function refresh() {
    const response = await fetch("/api/crm/city-tariffs");
    if (response.ok) { const data = await response.json(); setTariffs(data.tariffs); setDrafts({}); }
    router.refresh();
  }

  async function saveCity(t: CityTariff) {
    const d = drafts[t.cityId] ?? toDraft(t);
    const courierCost = parseMad(d.courier); const customerFeeOverride = parseMad(d.fee);
    if (courierCost === "invalid" || customerFeeOverride === "invalid") { toast.error("Montants entiers en MAD uniquement."); return; }
    if (await post(`c${t.cityId}`, { cityId: t.cityId, courierCost, customerFeeOverride, overrideIgnoresFreeThreshold: d.ignores }, `Tarif enregistré : ${t.cityName}.`)) await refresh();
  }

  async function saveDefault() {
    const value = parseMad(defaultCost);
    if (value === "invalid") { toast.error("Montant entier en MAD uniquement."); return; }
    await post("default", { defaultCourierCost: value }, "Coût par défaut enregistré.");
  }

  async function importCsv() {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > MAX_ROWS) { toast.error(`Maximum ${MAX_ROWS} lignes.`); return; }
    const rows: Array<Record<string, unknown>> = [];
    for (const [i, line] of lines.entries()) {
      const cells = line.split(/[;\t,]/).map((c) => c.trim());
      if (i === 0 && cells[1] && !/^\d/.test(cells[1])) continue; // header row
      const courierCost = parseMad(cells[1] ?? ""); const customerFeeOverride = parseMad(cells[2] ?? "");
      if (!cells[0] || courierCost === "invalid" || customerFeeOverride === "invalid") { toast.error(`Ligne ${i + 1} invalide.`); return; }
      rows.push({ cityName: cells[0], courierCost, customerFeeOverride, overrideIgnoresFreeThreshold: ["1", "oui", "true"].includes((cells[3] ?? "").toLowerCase()) });
    }
    if (!rows.length) { toast.error("Aucune ligne à importer."); return; }
    if (await post("csv", { rows }, `${rows.length} ligne(s) importée(s).`)) { setCsv(""); await refresh(); }
  }

  const q = query.trim().toLocaleLowerCase("fr");
  const visible = tariffs.filter((t) => !q || t.cityName.toLocaleLowerCase("fr").includes(q));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">Coût livreur par défaut (MAD)
          <Input type="number" min={0} step={1} inputMode="numeric" className="w-40" value={defaultCost} onChange={(e) => setDefaultCost(e.target.value)} placeholder="Non défini" />
        </label>
        <Button type="button" variant="secondary" disabled={busyKey !== null} onClick={saveDefault}>Enregistrer</Button>
      </div>
      <Input aria-label="Rechercher une ville" placeholder="Rechercher une ville…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
        {visible.length === 0 && <li className="py-2 text-muted-foreground">Aucune ville.</li>}
        {visible.map((t) => {
          const d = drafts[t.cityId] ?? toDraft(t);
          const set = (patch: Partial<Draft>) => setDrafts((cur) => ({ ...cur, [t.cityId]: { ...d, ...patch } }));
          return (
            <li key={t.cityId} className="flex flex-wrap items-end gap-2 py-2">
              <span className="min-w-32 flex-1 font-medium">{t.cityName}</span>
              <label className="flex flex-col gap-1 text-xs">Coût livreur
                <Input type="number" min={0} step={1} inputMode="numeric" className="w-24" value={d.courier} onChange={(e) => set({ courier: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs">Frais client
                <Input type="number" min={0} step={1} inputMode="numeric" className="w-24" value={d.fee} onChange={(e) => set({ fee: e.target.value })} />
              </label>
              <label className="flex items-center gap-1 pb-2 text-xs">
                <input type="checkbox" checked={d.ignores} disabled={d.fee.trim() === ""} onChange={(e) => set({ ignores: e.target.checked })} />Ignorer la livraison offerte
              </label>
              <Button type="button" size="sm" variant="outline" disabled={busyKey !== null} onClick={() => saveCity(t)}>Enregistrer</Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">Import en masse (CSV collé)
          <Textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)}
            placeholder={"ville;coût livreur;frais client;ignorer livraison offerte (oui/non)\nCasablanca;25;;\nLaâyoune;45;60;oui"} />
        </label>
        <div><Button type="button" variant="secondary" disabled={busyKey !== null || !csv.trim()} onClick={importCsv}>Importer</Button></div>
      </div>
    </div>
  );
}
