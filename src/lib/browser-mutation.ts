/** Edge-safe: never trust Host/X-Forwarded-Host to choose the allowed origin. */
export function browserMutationAllowed(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const allowed = new Set<string>();
  // Canonical CRM origin and explicit additional browser origins only.
  for (const value of [process.env.CRM_PUBLIC_URL ?? "", ...(process.env.SECURITY_ALLOWED_ORIGINS ?? "").split(",")]) {
    try {
      const origin = value.trim();
      const url = new URL(origin);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      // Do not silently widen malformed URLs, paths, userinfo or wildcards.
      if (origin !== url.origin && origin !== `${url.origin}/`) continue;
      if (url.hostname.includes("*")) continue;
      if (url.protocol === "https:" || (url.protocol === "http:" && (local || process.env.NODE_ENV !== "production"))) allowed.add(url.origin);
    } catch { /* Invalid configuration never authorizes a request. */ }
  }
  return allowed.has(request.headers.get("origin") ?? "");
}
