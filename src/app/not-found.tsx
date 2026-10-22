import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
        Page introuvable
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Retourner à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
