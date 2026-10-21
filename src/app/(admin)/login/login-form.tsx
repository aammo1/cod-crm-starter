"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LoginState {
  error: string | null;
}

export function LoginForm({
  action,
}: {
  action: (state: LoginState, formData: FormData) => Promise<LoginState>;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(action, {
    error: null,
  });

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-noir px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-4xl font-semibold tracking-wide text-white">
            Zehri
          </p>
          <p className="mt-2 text-sm text-white/50">Espace équipe</p>
        </div>

        <form
          action={formAction}
          className="rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="vous@zehri.ma"
                className="h-10 border-white/15 bg-white/10 text-white placeholder:text-white/30 focus-visible:border-white/40 focus-visible:ring-white/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">
                Mot de passe
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-10 border-white/15 bg-white/10 text-white focus-visible:border-white/40 focus-visible:ring-white/20"
              />
            </div>

            {state.error ? (
              <p role="alert" className="text-sm text-red-400">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending} className="h-10 w-full">
              {pending ? "Connexion…" : "Connexion"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}