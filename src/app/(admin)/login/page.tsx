import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/auth-guards";
import { getStoreSettings } from "@/lib/services/store-settings";
import { LoginForm, type LoginState } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

const PLACEHOLDER_ORIGIN = "http://callback.invalid";

/** Same-origin /crm or /admin path only; backslashes/control chars are rejected. */
function safeCallbackPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || /[\\\u0000-\u001f]/.test(raw)) return "/crm";
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return "/crm";
    if (!/^\/(crm|admin)(\/|$)/.test(url.pathname)) return "/crm";
    return url.pathname + url.search;
  } catch {
    return "/crm";
  }
}

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const redirectTo = safeCallbackPath(searchParams?.callbackUrl);

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

  return <LoginForm action={login} storeName={getStoreSettings().storeName} />;
}
