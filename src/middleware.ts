import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { browserMutationAllowed } from "@/lib/browser-mutation";

const { auth } = NextAuth(authConfig);

function publicOrigin(): string | null {
  try {
    return process.env.CRM_PUBLIC_URL ? new URL(process.env.CRM_PUBLIC_URL).origin : null;
  } catch {
    return null;
  }
}

const pageAuth = auth((req, event: NextFetchEvent) => {
  void event;
  if (!req.auth) {
    // Configured public origin, never X-Forwarded-Host/Host: a spoofed header
    // must not steer (or poison a cached) login redirect to another host.
    const loginUrl = new URL("/login", publicOrigin() ?? req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

// HSTS decided at request time so it works in the standalone image (runtime env only).
function withHsts(res: Response): Response {
  if ((process.env.CRM_PUBLIC_URL ?? "").startsWith("https://")) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  return withHsts((await route(request, event)) ?? NextResponse.next());
}

function route(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  if (path === "/api/admin" || path === "/api/crm" || path.startsWith("/api/admin/") || path.startsWith("/api/crm/")) {
    if (!browserMutationAllowed(request)) {
      return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
    }
    // Authorization remains in every handler, with live account/session checks.
    return NextResponse.next();
  }
  if (!/^\/(admin|crm)(\/|$)/.test(path)) return NextResponse.next();
  return pageAuth(request, event);
}

export const config = {
  // Everything except build assets and static files; non-CRM paths only get the HSTS header.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|images/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|txt|xml)$).*)"],
};
