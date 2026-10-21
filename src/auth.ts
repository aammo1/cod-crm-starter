import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateCredentials } from "@/lib/services/credentials";
import { authConfig, type Role } from "@/auth.config";

export type { Role };

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; sessionVersion?: number } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    sessionVersion?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: authenticateCredentials,
    }),
  ],
});
