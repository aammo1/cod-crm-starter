import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/auth-guards";
import { LoginForm, type LoginState } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false },
};

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const rawTarget = searchParams?.callbackUrl || "/crm";
  const redirectTo =
    rawTarget.startsWith("/") && !rawTarget.startsWith("//") ? rawTarget : "/crm";

  if (user) redirect(redirectTo);

  async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo,
      });
    } catch (error) {
      if (error instanceof AuthError) return { error: "Identifiants invalides." };
      throw error;
    }
    return { error: null };
  }

  return <LoginForm action={login} />;
}