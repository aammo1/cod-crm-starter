import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-4xl font-semibold text-plum sm:text-5xl">
        Page introuvable
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
         La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button asChild className="mt-8 bg-pink font-medium text-white hover:bg-pink/90">
        <Link href="/">Retourner à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
