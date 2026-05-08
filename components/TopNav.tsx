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
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-gradient-to-r from-[#05070A] via-[rgba(8,20,32,0.9)] to-[#05070A] backdrop-blur">
        <div className="mx-auto max-w-6xl w-[96vw] px-4 py-4 relative flex items-center">
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
            <div className="flex items-center gap-3 text-white text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight topnav-brand">
              <span className="inline-flex rounded-full bg-amber-300/10 p-1">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C8.13401 2 5 5.13401 5 9C5 13.25 11.5 21 12 21C12.5 21 19 13.25 19 9C19 5.13401 15.866 2 12 2Z" fill="#F6C143"/>
                  <path d="M12 6.5L8.5 10V13H11V16H13V13H15.5V10L12 6.5Z" fill="#101010"/>
                </svg>
              </span>
              <span>Allen Property Unit Collect</span>
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
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap');
        .topnav-brand {
          font-family: 'Playfair Display', Georgia, serif;
        }
      `}</style>
    </>
  );
}