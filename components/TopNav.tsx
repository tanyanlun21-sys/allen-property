"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/listings") return pathname === "/listings" || pathname.startsWith("/listings/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/";
  const [navHidden, setNavHidden] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isLoginPage) {
      document.documentElement.style.setProperty("--topnav-offset", "0px");
      return;
    }

    const setOffset = () => {
      const h = headerRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--topnav-offset", navHidden ? "0px" : h + "px");
    };

    setOffset();
    window.addEventListener("resize", setOffset);
    return () => window.removeEventListener("resize", setOffset);
  }, [isLoginPage, navHidden]);

  useEffect(() => {
    if (isLoginPage) return;

    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;

      if (y < 24) {
        setNavHidden(false);
      } else if (y > lastY + 8) {
        setNavHidden(true);
      } else if (y < lastY - 8) {
        setNavHidden(false);
      }

      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLoginPage]);

  const tabs = [
    { href: "/listings", label: "Listings" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/income", label: "Income" },
  ];

  return (
    <>
      <header ref={headerRef} className={`sticky top-0 z-40 w-full overflow-hidden border-b border-cyan-400/10 bg-gradient-to-r from-[#05070A]/95 via-[rgba(8,20,32,0.96)] to-[#05070A]/95 backdrop-blur shadow-[0_-10px_24px_rgba(34,211,238,0.08)] transition-transform duration-300 ease-out ${!isLoginPage && navHidden ? "-translate-y-full" : "translate-y-0"}`}>
        <div className="w-full px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid w-full grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 items-center gap-2 justify-self-start text-white topnav-brand sm:col-start-2 sm:row-start-1 sm:justify-self-center">
              <span className="inline-flex shrink-0 rounded-full bg-amber-300/10 p-1">
                <svg className="h-8 w-8 sm:h-9 sm:w-9" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C8.13401 2 5 5.13401 5 9C5 13.25 11.5 21 12 21C12.5 21 19 13.25 19 9C19 5.13401 15.866 2 12 2Z" fill="#F6C143" />
                  <path d="M12 6.5L8.5 10V13H11V16H13V13H15.5V10L12 6.5Z" fill="#101010" />
                </svg>
              </span>
              <span className="truncate text-[22px] font-semibold leading-none tracking-tight sm:text-3xl">
                Allen Property Unit Collect
              </span>
            </div>

            {!isLoginPage && (
            <button
              onClick={async () => {
                const { supabase } = await import("@/lib/supabase");
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="justify-self-end rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 sm:px-4 sm:py-3 sm:text-base sm:col-start-3 sm:row-start-1"
            >
              Logout
            </button>
            )}

            {!isLoginPage && (
            <nav className="col-span-2 row-start-2 flex w-full items-center justify-center gap-2 overflow-x-auto pb-1 sm:col-span-1 sm:col-start-1 sm:row-start-1 sm:justify-self-start sm:justify-start sm:overflow-visible sm:pb-0">
              {tabs.map((t) => {
                const active = isActive(pathname, t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={
                      "shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition sm:px-4 sm:py-3 sm:text-base " +
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
            )}
          </div>
        </div>
      </header>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@700&display=swap');
        .topnav-brand {
          font-family: 'Kalam', cursive;
        }
      `}</style>
    </>
  );
}
