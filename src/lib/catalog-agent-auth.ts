import { createHash, timingSafeEqual } from "node:crypto";

export class CatalogAgentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function catalogAgentKey(): string {
  const key = process.env.CATALOG_AGENT_KEY;
  if (!key || key.length < 32) {
    throw new CatalogAgentError("L’accès catalogue automatisé n’est pas configuré.", 503);
  }
  return key;
}

export function requireCatalogAgent(request: Request): void {
  const key = catalogAgentKey();
  const supplied = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) {
    throw new CatalogAgentError("Identifiant catalogue invalide.", 401);
  }
}
