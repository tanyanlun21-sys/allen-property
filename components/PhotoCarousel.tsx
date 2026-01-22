"use client";

import { useMemo, useState } from "react";

export function PhotoCarousel({ urls }: { urls: string[] }) {
  const list = useMemo(() => (urls ?? []).filter(Boolean), [urls]);
  const [i, setI] = useState(0);

  const has = list.length > 0;
  const canNav = list.length > 1;

  const prev = () => setI((x) => (x - 1 + list.length) % list.length);
  const next = () => setI((x) => (x + 1) % list.length);

  if (!has) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-6 text-sm text-zinc-400">
        No photos yet.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={list[i]}
        alt=""
        className="w-full h-72 object-cover"
        draggable={false}
      />

      {canNav && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10
                       rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
            aria-label="Previous"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10
                       rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
            aria-label="Next"
          >
            ›
          </button>

          <div className="absolute bottom-3 right-3 z-10 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {i + 1}/{list.length}
          </div>
        </>
      )}
    </div>
  );
}
