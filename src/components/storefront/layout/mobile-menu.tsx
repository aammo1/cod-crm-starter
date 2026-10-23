"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function MobileMenu({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className="group md:hidden">
      <summary
        aria-label={label}
        className="inline-flex size-10 cursor-pointer list-none items-center justify-center rounded-store hover:bg-store-muted [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </summary>
      <nav className="absolute inset-x-0 top-full border-b border-store-border bg-store-bg shadow-md">
        <ul className="flex flex-col py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block px-4 py-3 text-base hover:bg-store-muted">{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
