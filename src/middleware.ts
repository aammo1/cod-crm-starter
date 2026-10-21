import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { browserMutationAllowed } from "@/lib/browser-mutation";

const { auth } = NextAuth(authConfig);

const pageAuth = auth((req, event: NextFetchEvent) => {
  void event;
  if (!req.auth) {
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      req.nextUrl.host;
    const callbackPath = req.nextUrl.pathname + req.nextUrl.search;
    const loginUrl = new URL(`${proto}://${host}/login`);
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  if (path === "/api/admin" || path === "/api/crm" || path.startsWith("/api/admin/") || path.startsWith("/api/crm/")) {
    if (!browserMutationAllowed(request)) {
      return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
    }
    // Authorization remains in every handler, with live account/session checks.
    return NextResponse.next();
  }
  return pageAuth(request, event);
}

export const config = {
  matcher: ["/admin/:path*", "/crm/:path*", "/api/admin/:path*", "/api/crm/:path*"],
};
