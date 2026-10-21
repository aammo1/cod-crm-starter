import type { Metadata } from "next";

import { BlBuilder } from "@/components/crm/bl-builder";
import { BlDocumentArchive } from "@/components/crm/bl-document-archive";
import { requireUser } from "@/lib/auth-guards";
import {
  getSavedBlDocuments,
  parseDocumentsPage,
} from "@/lib/services/bl-documents";
import { getShipmentBoard } from "@/lib/services/expeditions";

export const metadata: Metadata = {
  title: "Expéditions — CRM",
  robots: { index: false },
};

interface ExpeditionsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExpeditionsPage({
  searchParams,
}: ExpeditionsPageProps) {
  const user = await requireUser();
  const sp = searchParams ? await searchParams : undefined;
  const page = parseDocumentsPage(sp?.documentsPage);

  const board = getShipmentBoard();
  const archive = getSavedBlDocuments(page);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-semibold text-2xl text-foreground">
          Expéditions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Constituez les bons de livraison, imprimez les étiquettes puis
          déclarez la remise au livreur colis par colis.
        </p>
      </div>

      <BlBuilder
        assistantEnabled={user.role === "admin"}
        ready={board.ready}
        operations={board.operations}
        savedNotes={board.savedNotes}
        dispatched={board.dispatched}
      />

      <BlDocumentArchive archive={archive} searchParams={sp} />
    </div>
  );
}
