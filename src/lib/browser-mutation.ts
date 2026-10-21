/** Edge-safe: never trust Host/X-Forwarded-Host to choose the allowed origin. */
export function browserMutationAllowed(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const allowed = new Set<string>();
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  // Explicit additional origins for staging/custom admin domains.
  for (const value of (process.env.SECURITY_ALLOWED_ORIGINS ?? "").split(",")) {
    try {
      const url = new URL(value.trim());
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol === "https:" || (url.protocol === "http:" && (local || process.env.NODE_ENV !== "production"))) allowed.add(url.origin);
    } catch { /* Invalid configuration never authorizes a request. */ }
  }
  return allowed.has(request.headers.get("origin") ?? "");
}
