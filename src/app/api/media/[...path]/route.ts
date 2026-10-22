import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  contentTypeForStoredName,
  ensureUploadDir,
  isSafeStoredName,
} from "@/lib/uploads";

export const runtime = "nodejs";

// File contents are only read at runtime; never prerender or cache at build.
export const dynamic = "force-dynamic";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function notFound(): NextResponse {
  return NextResponse.json({ error: "Introuvable" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await params;

  // Flat storage: exactly one segment — no subdirectories, no traversal.
  if (segments.length !== 1) return notFound();

  let name: string;
  try {
    name = decodeURIComponent(segments[0]);
  } catch {
    return notFound();
  }
  if (!isSafeStoredName(name)) return notFound();

  const contentType = contentTypeForStoredName(name);
  if (!contentType) return notFound();

  const dir = path.resolve(ensureUploadDir());
  const filePath = path.resolve(dir, name);
  if (!filePath.startsWith(dir + path.sep)) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return notFound();
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": IMMUTABLE_CACHE,
      // Uploaded bytes are only magic-checked: never let a browser run them as a document.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
