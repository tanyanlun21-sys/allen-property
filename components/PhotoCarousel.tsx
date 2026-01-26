"use client";

import { useMemo, useRef, useState } from "react";

export function PhotoCarousel({ urls }: { urls: string[] }) {
  const list = useMemo(() => (urls ?? []).filter(Boolean), [urls]);
  const [i, setI] = useState(0);

  const has = list.length > 0;
  const canNav = list.length > 1;

  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

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
    <div
      className="relative rounded-2xl overflow-hidden bg-zinc-900 select-none"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        movedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return;
        const dx = Math.abs(e.clientX - startRef.current.x);
        const dy = Math.abs(e.clientY - startRef.current.y);
        if (dx > 8 && dx > dy) movedRef.current = true;
      }}
      onPointerUp={(e) => {
        if (!startRef.current) return;

        const dx = e.clientX - startRef.current.x;
        const dy = Math.abs(e.clientY - startRef.current.y);

        // 横向滑动才换图（阈值可调：30~60）
        if (Math.abs(dx) > 40 && Math.abs(dx) > dy) {
          if (dx < 0) next();
          else prev();
        }

        startRef.current = null;
      }}
      onClickCapture={(e) => {
        // 如果刚刚发生过横向滑动，拦截 click，避免卡片跳进详情
        if (movedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = false;
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={list[i]} alt="" className="w-full h-72 object-cover" draggable={false} />

      {canNav && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/90 px-4 py-3 text-black hover:bg-white"
            aria-label="Previous photo"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/90 px-4 py-3 text-black hover:bg-white"
            aria-label="Next photo"
          >
            ›
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {i + 1}/{list.length}
          </div>
        </>
      )}
    </div>
  );
}

// ✅ 兼容 default import（可选，但强烈建议留着）
export default PhotoCarousel;
