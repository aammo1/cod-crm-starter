import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { readLimitedFormData, RequestBodyError } from "@/lib/request-body";
import { AuthGuardError, requireAdmin } from "@/lib/auth-guards";
import {
  MAX_UPLOAD_BYTES,
  ensureUploadDir,
  extensionForContentType,
  isSafeStoredName,
  matchesImageMagic,
  sanitizeOriginalName,
} from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthGuardError) return error.toResponse();
    throw error;
  }

  let form: FormData;
  try {
    form = await readLimitedFormData(request, 10 * MAX_UPLOAD_BYTES + 65_536);
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0 || files.length > 10) {
    return NextResponse.json({ error: "Envoyez entre 1 et 10 fichiers." }, { status: 400 });
  }

  for (const file of files) {
    if (file.size === 0) {
      return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
    }
    if (extensionForContentType(file.type) === null || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error:
            file.size > MAX_UPLOAD_BYTES
              ? "Fichier trop volumineux (5 Mo maximum)."
              : "Format de fichier non autorisé (JPG, PNG ou WebP uniquement).",
        },
        { status: 400 }
      );
    }
  }

  const dir = ensureUploadDir();
  const urls: string[] = [];
  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!matchesImageMagic(file.type, bytes)) {
        return NextResponse.json(
          { error: "Format de fichier non autorisé (JPG, PNG ou WebP uniquement)." },
          { status: 400 }
        );
      }
      const ext = extensionForContentType(file.type) as string;
      const name = `${nanoid(12)}-${sanitizeOriginalName(file.name)}.${ext}`;
      if (!isSafeStoredName(name)) {
        throw new Error("generated upload name failed safety check");
      }
      await writeFile(path.join(dir, name), bytes);
      urls.push(`/api/media/${name}`);
    }
  } catch {
    return NextResponse.json(
      { error: "Échec de l'enregistrement du fichier." },
      { status: 500 }
    );
  }

  return NextResponse.json({ files: urls }, { status: 201 });
}
