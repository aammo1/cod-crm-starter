import { createHash, randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { CatalogAgentError, requireCatalogAgent } from "@/lib/catalog-agent-auth";
import { ensureUploadDir, MAX_UPLOAD_BYTES, matchesImageMagic } from "@/lib/uploads";
import { readLimitedFormData, RequestBodyError } from "@/lib/request-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    requireCatalogAgent(request);
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const form = await readLimitedFormData(request, MAX_UPLOAD_BYTES + 65_536);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new CatalogAgentError("Fournissez une image JPG, PNG ou WebP de 5 Mo maximum.");
    }
    const input = Buffer.from(await file.arrayBuffer());
    if (!matchesImageMagic(file.type, input)) throw new CatalogAgentError("Format d’image invalide.");
    let bytes: Buffer;
    try {
      bytes = await sharp(input, { limitInputPixels: 40_000_000, animated: false })
        .rotate().resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
    } catch { throw new CatalogAgentError("Image illisible ou dimensions trop importantes."); }
    const name = `catalog-${createHash("sha256").update(bytes).digest("hex")}.webp`;
    if (!dryRun) {
      const dir = ensureUploadDir();
      const temporary = path.join(dir, `.catalog-upload-${randomUUID()}`);
      try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, path.join(dir, name));
      } finally { await unlink(temporary).catch(() => undefined); }
    }
    return NextResponse.json({ path: `/api/media/${name}`, bytes: bytes.length, dryRun }, { headers });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof CatalogAgentError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Échec du téléversement de l’image." }, { status: 400, headers });
  }
}
