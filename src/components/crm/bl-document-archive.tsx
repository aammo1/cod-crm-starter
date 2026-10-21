import Link from "next/link";
import { BlPrintActions } from "@/components/crm/bl-print-actions";
import { BlArchiveDisclosure } from "@/components/crm/bl-archive-disclosure";
import type { SavedBlArchiveResult } from "@/lib/services/bl-documents";

interface BlDocumentArchiveProps {
  archive: SavedBlArchiveResult;
  searchParams?: Record<string, string | string[] | undefined>;
}

function buildArchiveUrl(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  targetPage: number,
): string {
  const sp = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "documentsPage" || key === "archives") continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          sp.append(key, item);
        }
      } else if (typeof value === "string") {
        sp.set(key, value);
      }
    }
  }
  sp.set("archives", "1");
  if (targetPage > 1) {
    sp.set("documentsPage", String(targetPage));
  }
  const qs = sp.toString();
  return qs ? `/crm/expeditions?${qs}` : "/crm/expeditions";
}

export function BlDocumentArchive({
  archive,
  searchParams,
}: BlDocumentArchiveProps) {
  const archivesParam =
    typeof searchParams?.archives === "string"
      ? searchParams.archives
      : Array.isArray(searchParams?.archives)
        ? searchParams?.archives[0]
        : undefined;

  const docsPageParam =
    typeof searchParams?.documentsPage === "string"
      ? searchParams.documentsPage
      : Array.isArray(searchParams?.documentsPage)
        ? searchParams?.documentsPage[0]
        : undefined;

  const initiallyOpen =
    archivesParam === "1" ||
    (Boolean(docsPageParam) && Number.parseInt(docsPageParam || "0", 10) > 0);

  return (
    <BlArchiveDisclosure total={archive.total} initiallyOpen={initiallyOpen}>
      {archive.documents.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Aucun bon de livraison archivé.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {archive.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {doc.ref}
                    </span>
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {doc.parcelCount} colis
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {doc.savedAtLabel
                      ? `Enregistré le ${doc.savedAtLabel}`
                      : `Créé le ${doc.createdAtLabel}`}
                  </p>
                </div>
                <BlPrintActions noteId={doc.id} refCode={doc.ref} />
              </li>
            ))}
          </ul>

          {archive.pageCount > 1 ? (
            <nav
              aria-label="Pagination des archives"
              className="flex items-center justify-between pt-2 text-sm"
            >
              {archive.page > 1 ? (
                <Link
                  href={buildArchiveUrl(searchParams, archive.page - 1)}
                  scroll={false}
                  className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  ← Précédent
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">
                Page {archive.page} sur {archive.pageCount}
              </span>
              {archive.page < archive.pageCount ? (
                <Link
                  href={buildArchiveUrl(searchParams, archive.page + 1)}
                  scroll={false}
                  className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  Suivant →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </BlArchiveDisclosure>
  );
}
