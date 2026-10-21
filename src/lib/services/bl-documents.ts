import { getDb } from "@/lib/db";
import { formatCasablanca } from "@/lib/services/orders";

export interface SavedBlDocument {
  id: string;
  ref: string;
  createdAt: string;
  savedAt: string | null;
  createdAtLabel: string;
  savedAtLabel: string | null;
  parcelCount: number;
}

export interface SavedBlArchiveResult {
  documents: SavedBlDocument[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const BL_DOCUMENTS_PAGE_SIZE = 25;

export function parseDocumentsPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 ? raw : 1;
  }
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  }
  return 1;
}

function safeFormatCasablanca(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return formatCasablanca(iso);
  } catch {
    return iso;
  }
}

export function getSavedBlDocuments(pageInput: number = 1): SavedBlArchiveResult {
  const page = Number.isInteger(pageInput) && pageInput > 0 ? pageInput : 1;
  const db = getDb();

  const totalRow = db
    .prepare("SELECT COUNT(*) AS n FROM delivery_notes WHERE status = 'saved'")
    .get() as { n: number } | undefined;
  const total = totalRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / BL_DOCUMENTS_PAGE_SIZE));
  const offset = (page - 1) * BL_DOCUMENTS_PAGE_SIZE;

  // Query only saved delivery notes directly, counting whole notes and their attached parcels
  const rows = db
    .prepare(
      `SELECT dn.id, dn.ref, dn.created_at, dn.saved_at,
              (SELECT COUNT(*) FROM delivery_note_parcels dnp WHERE dnp.delivery_note_id = dn.id) AS parcel_count
       FROM delivery_notes dn
       WHERE dn.status = 'saved'
       ORDER BY COALESCE(dn.saved_at, dn.created_at) DESC, dn.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(BL_DOCUMENTS_PAGE_SIZE, offset) as Array<{
      id: string;
      ref: string;
      created_at: string;
      saved_at: string | null;
      parcel_count: number;
    }>;

  const documents: SavedBlDocument[] = rows.map((row) => ({
    id: row.id,
    ref: row.ref,
    createdAt: row.created_at,
    savedAt: row.saved_at,
    createdAtLabel: safeFormatCasablanca(row.created_at) ?? row.created_at,
    savedAtLabel: safeFormatCasablanca(row.saved_at),
    parcelCount: row.parcel_count,
  }));

  return {
    documents,
    total,
    page,
    pageSize: BL_DOCUMENTS_PAGE_SIZE,
    pageCount,
  };
}
