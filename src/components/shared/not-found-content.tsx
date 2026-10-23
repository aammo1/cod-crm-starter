import Link from "next/link";

const TEXT = {
  fr: { title: "Page introuvable", body: "La page que vous cherchez n'existe pas ou a été déplacée.", home: "Retourner à l'accueil" },
  ar: { title: "الصفحة غير موجودة", body: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.", home: "العودة إلى الصفحة الرئيسية" },
} as const;

export function NotFoundContent({ locale = "fr", href = "/" }: { locale?: "fr" | "ar"; href?: string }) {
  const t = TEXT[locale];
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">{t.body}</p>
      <Link
        href={href}
        className="mt-8 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t.home}
      </Link>
    </div>
  );
}
