export class RequestBodyError extends Error {
  constructor(public status: 400 | 413) {
    super(status === 413 ? "Requête trop volumineuse." : "Requête invalide.");
  }
}

/** Enforce actual streamed bytes, including when Content-Length is absent/false. */
export async function readLimitedBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit) {
    await request.body?.cancel().catch(() => undefined);
    throw new RequestBodyError(413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError(413);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readLimitedJson(request: Request, limit: number): Promise<unknown> {
  const bytes = await readLimitedBytes(request, limit);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestBodyError(400); }
}

export async function readLimitedFormData(request: Request, limit: number): Promise<FormData> {
  const bytes = await readLimitedBytes(request, limit);
  try {
    return await new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch { throw new RequestBodyError(400); }
}

/** Like readLimitedJson but returns null for malformed bodies; oversized bodies still throw 413. */
export async function readLimitedJsonOrNull(request: Request, limit: number): Promise<unknown> {
  try { return await readLimitedJson(request, limit); }
  catch (error) {
    if (error instanceof RequestBodyError && error.status === 413) throw error;
    return null;
  }
}
