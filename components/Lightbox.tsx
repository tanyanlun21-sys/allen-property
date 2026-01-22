"use client";

import { useEffect } from "react";

export function Lightbox({
  open,
  urls,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  open: boolean;
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open) return null;
  const url = urls[index];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        className="relative max-w-6xl w-full"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="absolute -top-10 right-0 rounded-lg bg-white/10 px-3 py-1 text-white hover:bg-white/20"
          onClick={onClose}
        >
          Close ✕
        </button>

        <div className="relative w-full overflow-hidden rounded-2xl bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="w-full max-h-[85vh] object-contain select-none"
            draggable={false}
          />

          {urls.length > 1 && (
            <>
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20"
                onClick={onPrev}
              >
                ‹
              </button>
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20"
                onClick={onNext}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
