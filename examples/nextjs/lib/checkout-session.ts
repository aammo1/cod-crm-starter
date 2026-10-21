import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { configuredOrigin, StorefrontError } from "../../../integrations/storefront-client";

export class PublicError extends Error {
  constructor(readonly status: number, readonly code: string) { super("Demande invalide."); }
}
interface Session {
  sid: string; expires: number;
  order?: { attempt: string; id: string; token: string };
}
const lifetime = 60 * 60;
const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-crm-checkout" : "crm-checkout-dev";
function secret() {
  const value = process.env.STOREFRONT_SESSION_SECRET;
  if (!value || value.length < 32) throw new PublicError(503, "CONFIGURATION_ERROR");
  return createHash("sha256").update(value).digest();
}
export function storefrontOrigin() {
  return configuredOrigin(process.env.STOREFRONT_ORIGIN ?? "");
}
/** Exact configured origin, never Host/X-Forwarded-Host/Referer inference. */
export function requireOwnOrigin(request: Request) {
  if (request.headers.get("origin") !== storefrontOrigin() ||
      (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
    throw new PublicError(403, "ORIGIN_FORBIDDEN");
  }
}

// Copyable SINGLE long-lived Node process example. Global cap survives session
// rotation; map is bounded. Multi-replica/serverless requires shared atomic limits.
const buckets = new Map<string, { count: number; until: number }>();
function consume(key: string, max: number) {
  const now = Date.now();
  for (const [id, value] of buckets) if (value.until <= now) buckets.delete(id);
  const bucket = buckets.get(key) ?? { count: 0, until: now + 60_000 };
  if (bucket.count >= max || (!buckets.has(key) && buckets.size >= 1000)) throw new PublicError(429, "RATE_LIMITED");
  bucket.count++;
  buckets.set(key, bucket);
}
export function rateLimit(session?: Session) {
  consume("global", 60);
  if (session) consume(`session:${session.sid}`, 20);
  else consume("bootstrap", 20);
}
export function newSession(): Session {
  return { sid: randomBytes(24).toString("base64url"), expires: Date.now() + lifetime * 1000 };
}
export function readSession(request: Request): Session | undefined {
  const cookies = (request.headers.get("cookie") ?? "").split(";").map((s) => s.trim());
  const matches = cookies.filter((s) => s.startsWith(`${cookieName()}=`));
  if (matches.length !== 1) return undefined;
  const encoded = matches[0].slice(cookieName().length + 1);
  if (encoded.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined;
  const key = secret();
  try {
    const data = Buffer.from(encoded, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(`checkout-v1:${storefrontOrigin()}`));
    decipher.setAuthTag(data.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString()) as Session;
    if (!/^[A-Za-z0-9_-]{32}$/.test(value.sid) || !Number.isSafeInteger(value.expires) || value.expires <= Date.now()) return undefined;
    return value;
  } catch { return undefined; }
}
export function requireSession(request: Request) {
  const session = readSession(request);
  if (!session) throw new PublicError(401, "CHECKOUT_SESSION_REQUIRED");
  return session;
}
export function withSession(response: NextResponse, session: Session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  cipher.setAAD(Buffer.from(`checkout-v1:${storefrontOrigin()}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  response.cookies.set(cookieName(), Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
    maxAge: Math.max(0, Math.floor((session.expires - Date.now()) / 1000)),
  });
  return response;
}
export function boundKey(session: Session, scope: string, attempt: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(attempt)) throw new PublicError(400, "INVALID_ATTEMPT");
  return createHmac("sha256", secret()).update(JSON.stringify([session.sid, scope, attempt])).digest("hex");
}

/** Streaming byte cap and deadline, including chunked/no Content-Length requests. */
export async function readBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") ||
      request.headers.has("content-encoding")) throw new PublicError(415, "JSON_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new PublicError(413, "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new PublicError(400, "INVALID_REQUEST");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new PublicError(408, "BODY_TIMEOUT")); }, 5000);
    });
    const reading = (async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new PublicError(413, "PAYLOAD_TOO_LARGE"); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    })();
    return await Promise.race([reading, timeout]);
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(400, "INVALID_REQUEST");
  } finally { if (timer) clearTimeout(timer); }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function publicFailure(error: unknown) {
  let status = 503; let code = "SERVICE_UNAVAILABLE"; let retry: number | undefined;
  if (error instanceof PublicError) { status = error.status; code = error.code; }
  else if (error instanceof StorefrontError) {
    // CRM authentication/config failures are operational, not browser authentication.
    if ([400, 404, 409, 413, 429].includes(error.status)) { status = error.status; code = error.code; }
    retry = error.retryAfterSeconds;
  }
  const response = json({ error: { code, message: "La demande n’a pas pu aboutir. Réessayez avec la même tentative." } }, status);
  if (status === 429 || retry !== undefined) response.headers.set("Retry-After", String(retry ?? 60));
  return response;
}
