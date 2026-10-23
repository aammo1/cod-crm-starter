/** Server component. Messages rotate with a tiny CSS-only fade (no JS). */
export function AnnouncementBar({ messages }: { messages: string[] }) {
  const n = messages.length;
  const dur = n * 4;
  const on = (100 / n - 3).toFixed(2);
  const off = (100 / n).toFixed(2);
  return (
    <div className="bg-store-primary text-store-primary-fg text-center text-xs sm:text-sm">
      {n === 1 ? (
        <p className="px-4 py-2">{messages[0]}</p>
      ) : (
        <div className="grid h-9 place-items-center overflow-hidden">
          <style>{`.sf-ann{opacity:0;animation:sf-ann ${dur}s infinite}@keyframes sf-ann{0%,${on}%{opacity:1}${off}%,100%{opacity:0}}@media (prefers-reduced-motion:reduce){.sf-ann{animation:none}.sf-ann:first-child{opacity:1}}`}</style>
          {messages.map((m, i) => (
            <p key={m} className="sf-ann col-start-1 row-start-1 px-4" style={{ animationDelay: `${i * 4}s` }}>
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
