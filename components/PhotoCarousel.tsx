"use client";

import React, { useMemo, useRef, useState } from "react";

export default function PhotoCarousel({ urls }: { urls: string[] }) {
  const list = useMemo(() => (urls ?? []).filter(Boolean), [urls]);
  const [i, setI] = useState(0);

  const has = list.length > 0;
  const canNav = list.length > 1;

  // 用来判断：刚刚是否发生“横向滑动”
  const movedRef = useRef(false);

  // 记录起点
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // 防止快速连触造成重复触发
  const lockRef = useRef(false);

  const prev = () =>
    setI((x) => (x - 1 + list.length) % Math.max(1, list.length));
  const next = () => setI((x) => (x + 1) % Math.max(1, list.length));

  if (!has) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-6 text-sm text-zinc-400">
        No photos yet.
      </div>
    );
  }

  // ✅ 可调参数：手机左右滑动阈值
  const SWIPE_THRESHOLD = 35; // 30~60 都可以，越小越敏感
  const MOVE_HINT = 8; // 判定开始横滑的最小位移

  const handleSwipeEnd = (dx: number, dy: number) => {
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    }
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-zinc-900 select-none"
      style={{
        // 允许上下滚动，但横向由我们接管
        touchAction: "pan-y",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      // -------------------------
      // Pointer Events（桌面/部分手机）
      // -------------------------
      onPointerDown={(e) => {
        movedRef.current = false;
        lockRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };

        // ✅ iOS/移动端关键：捕获 pointer，避免 move/up 丢失
        try {
          (e.currentTarget as any).setPointerCapture?.(e.pointerId);
        } catch {}
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return;

        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;

        if (Math.abs(dx) > MOVE_HINT && Math.abs(dx) > Math.abs(dy)) {
          movedRef.current = true;
        }
      }}
      onPointerUp={(e) => {
        if (!startRef.current) return;

        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;

        startRef.current = null;

        if (lockRef.current) return;
        lockRef.current = true;

        handleSwipeEnd(dx, dy);

        // 小延迟解锁，防止重复触发
        setTimeout(() => {
          lockRef.current = false;
        }, 50);
      }}
      onPointerCancel={() => {
        startRef.current = null;
      }}
      // ✅ 如果刚刚发生横滑：阻止 click 冒泡（避免进入详情）
      onClickCapture={(e) => {
        if (movedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = false;
        }
      }}
      // -------------------------
      // Touch Events（iPhone Safari 最稳）
      // -------------------------
      onTouchStart={(e) => {
        const t = e.touches[0];
        movedRef.current = false;
        lockRef.current = false;
        startRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchMove={(e) => {
        if (!startRef.current) return;
        const t = e.touches[0];

        const dx = t.clientX - startRef.current.x;
        const dy = t.clientY - startRef.current.y;

        if (Math.abs(dx) > MOVE_HINT && Math.abs(dx) > Math.abs(dy)) {
          movedRef.current = true;
          // ✅ 横滑时阻止页面跟着滚/触发点击
          e.preventDefault();
        }
      }}
      onTouchEnd={(e) => {
        if (!startRef.current) return;

        const t = e.changedTouches[0];
        const dx = t.clientX - startRef.current.x;
        const dy = t.clientY - startRef.current.y;

        startRef.current = null;

        if (lockRef.current) return;
        lockRef.current = true;

        handleSwipeEnd(dx, dy);

        setTimeout(() => {
          lockRef.current = false;
        }, 50);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={list[i]}
        alt=""
        className="w-full h-72 object-cover"
        draggable={false}
      />

      {/* 左右按钮（点击不会进入详情） */}
      {canNav && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/40 text-white flex items-center justify-center"
            aria-label="Previous photo"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/40 text-white flex items-center justify-center"
            aria-label="Next photo"
          >
            ›
          </button>

          <div className="absolute bottom-3 right-3 z-10 rounded-full bg-black/40 px-3 py-1 text-xs text-white">
            {i + 1}/{list.length}
          </div>
        </>
      )}
    </div>
  );
}