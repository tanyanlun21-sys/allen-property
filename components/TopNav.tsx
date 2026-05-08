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
      <div className="mx-auto max-w-6xl px-4 py-4 relative flex items-center">
        <nav className="flex items-center gap-3">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-2xl px-4 py-3 text-sm md:text-base font-semibold transition " +
                  (active
                    ? "bg-white text-black"
                    : "bg-zinc-900 text-zinc-200 hover:bg-zinc-800")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <div className="text-base sm:text-xl font-semibold tracking-tight text-white">
            Allen Property Unit Collect
          </div>
        </div>

        <div className="ml-auto relative">
          <button
            onClick={async () => {
              const { supabase } = await import("@/lib/supabase");
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="rounded-lg bg-zinc-900 px-4 py-3 text-sm md:text-base text-zinc-200 hover:bg-zinc-800 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}