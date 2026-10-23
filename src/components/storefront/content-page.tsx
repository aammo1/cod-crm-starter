/** Renders a title and paragraphs from plain config text (blank-line separated). */
export function ContentPage({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  const paragraphs = text ? text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold">{title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">{p}</p>
        ))}
        {children}
      </div>
    </main>
  );
}
