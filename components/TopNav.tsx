"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/listings") return pathname === "/listings" || pathname.startsWith("/listings/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/listings", label: "Listings" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/income", label: "Income" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-900 bg-black/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Property Tracker</div>
          <div className="text-xs text-zinc-400 hidden sm:block">
            Listings • Deals • Dashboard
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-lg px-3 py-2 text-sm transition " +
                  (active
                    ? "bg-white text-black font-medium"
                    : "bg-zinc-900 text-zinc-200 hover:bg-zinc-800")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}