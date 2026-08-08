"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1fmLDbJGz2uMSDpgF4JEeiWzMqTp0pRpJz2FshGGMzDM/edit?gid=33273299#gid=33273299";

export default function WorkingPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = "/";
        return;
      }

      setReady(true);
    });
  }, []);

  return (
    <main className="min-h-[calc(100vh-var(--topnav-offset,0px))] bg-[#05070A] text-white">
      <div className="flex h-[calc(100vh-var(--topnav-offset,0px))] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-cyan-400/10 bg-[#070D11] px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Working</h1>
            <p className="truncate text-xs text-zinc-400">Google Sheet</p>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {ready ? (
            <iframe
              title="Working Google Sheet"
              src={SHEET_URL}
              className="h-full w-full border-0 bg-white"
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              Loading...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
