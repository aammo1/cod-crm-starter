import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

export type Role = "admin" | "agent";

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    sessionVersion?: number;
  }
}

// Edge-safe base config (no provider touches the database here). Middleware
// imports this via src/middleware.ts; the full config with the credentials
// provider lives in src/auth.ts.
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  // Rolling 7-day window (default 30): an idle or copied token expires sooner.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  callbacks: {
    jwt({ token, user }): JWT {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "agent";
        if (typeof user.sessionVersion === "number") {
          token.sessionVersion = user.sessionVersion;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = (token.id ?? token.sub) as string;
      session.user.role = token.role as Role;
      session.user.sessionVersion =
        typeof token.sessionVersion === "number" ? token.sessionVersion : undefined;
      return session;
    },
    // Middleware only checks that the user is logged in; role checks are
    // enforced server-side in pages and route handlers (src/lib/auth-guards.ts).
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;