import { mkdirSync } from "node:fs";
import path from "node:path";

/** Flat storage dir: `UPLOAD_DIR` wins, else sibling `uploads/` of the SQLite file. */
export function getUploadDir(): string {
  return (
    process.env.UPLOAD_DIR ||
    path.join(path.dirname(process.env.DB_PATH || "./data/crm.db"), "uploads")
  );
}

let preparedDir: string | null = null;

/** mkdirSync(recursive) on first use, memoized; returns the (created) dir. */
export function ensureUploadDir(): string {
  const dir = getUploadDir();
  if (preparedDir !== dir) {
    mkdirSync(dir, { recursive: true });
    preparedDir = dir;
  }
  return dir;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Image content types accepted for upload, mapped to the stored extension. */
export function extensionForContentType(type: string): string | null {
  return CONTENT_TYPE_EXT[type] ?? null;
}

/** Content type to serve for a stored filename; null for anything not an image we wrote. */
export function contentTypeForStoredName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXT_CONTENT_TYPE[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** Magic-byte sniff: declared image types must match the actual bytes. */
export function matchesImageMagic(type: string, bytes: Uint8Array): boolean {
  switch (type) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      );
    case "image/webp":
      return (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    default:
      return false;
  }
}

const STORED_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Names are always generated server-side: `<nanoid>-<sanitized>.<ext>`.
 * A stored name is safe only if it is a flat, dot-free, allowlisted filename —
 * anything else (traversal, subdirectories, encoded chars) must 404.
 */
export function isSafeStoredName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    STORED_NAME_RE.test(name) &&
    !name.includes("..") &&
    !name.startsWith(".")
  );
}

/** Reduce the client-supplied name to a safe basename chunk (path, dirs and odd chars dropped). */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "");
  const trimmed = cleaned.slice(0, 64).replace(/[.\-]+$/, "");
  return trimmed.length > 0 ? trimmed : "image";
}
