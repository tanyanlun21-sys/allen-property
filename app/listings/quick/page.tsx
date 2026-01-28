"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ListingType = "rent" | "sale";
type ListingStatus =
  | "New"
  | "Available"
  | "Follow-up"
  | "Viewing"
  | "Negotiating"
  | "Booked"
  | "Closed"
  | "Inactive";

function toNullableNumber(v: any): number | null {
  const t = String(v ?? "").replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function guessType(raw: string): ListingType {
  const s = raw.toLowerCase();
  if (/(sale|sell|for sale|出售|卖)/i.test(s)) return "sale";
  return "rent";
}

function guessFurnish(raw: string): "Fully" | "Partial" | null {
  const s = raw.toLowerCase();
  if (/(fully|full furnish|fully furnished|全配)/i.test(s)) return "Fully";
  if (/(partial|partly|semi|部分)/i.test(s)) return "Partial";
  return null;
}

function guessStatus(raw: string): ListingStatus {
  const s = raw.toLowerCase();
  // 你V1默认 New，但如果文字明显写 available 就给 Available
  if (/\bavailable\b|可入住|现房/i.test(s)) return "Available";
  if (/\bbooked\b|已订/i.test(s)) return "Booked";
  if (/\bclosed\b|完成|成交/i.test(s)) return "Closed";
  if (/\binactive\b|下架/i.test(s)) return "Inactive";
  return "New";
}

function extractCondoName(raw: string) {
  // 取第一行当 condo 名（最符合你实际复制格式）
  const first = raw.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? "";
  return first;
}

function extractArea(raw: string) {
  // 简单策略：如果第二行很短（<40）当 area
  const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
  const second = lines[1] ?? "";
  if (second && second.length <= 40 && !/\d/.test(second)) return second;
  return null;
}

function extractPrice(raw: string) {
  // RM1800 / RM 1,800 / 1800
  const m = raw.match(/RM\s*([\d,]{3,})/i);
  if (m?.[1]) return toNullableNumber(m[1]);
  // fallback: 4-6 digits standalone (防误判太小数字)
  const m2 = raw.match(/(?:^|\s)(\d{4,6})(?:\s|$)/);
  return m2?.[1] ? toNullableNumber(m2[1]) : null;
}

function extractSqft(raw: string) {
  const m = raw.match(/(\d{3,5})\s*(sqft|sq\.?ft)/i);
  return m?.[1] ? toNullableNumber(m[1]) : null;
}

function extractRoomsBath(raw: string) {
  // "3R 2B" or "3 Bedroom 2 Bathroom"
  const r1 = raw.match(/(\d)\s*R\b/i);
  const b1 = raw.match(/(\d)\s*B\b/i);

  const r2 = raw.match(/(\d)\s*(bedroom|bed)\b/i);
  const b2 = raw.match(/(\d)\s*(bathroom|bath)\b/i);

  const bedrooms = toNullableNumber(r1?.[1] ?? r2?.[1]);
  const bathrooms = toNullableNumber(b1?.[1] ?? b2?.[1]);

  return { bedrooms, bathrooms };
}

function extractCarparks(raw: string) {
  // "2 parking" / "2cp"
  const m = raw.match(/(\d)\s*(parking|park|cp)\b/i);
  return m?.[1] ? toNullableNumber(m[1]) : null;
}

function extractAvailableFrom(raw: string) {
  // 支持：2026-01-28 / 2026/1/28
  const m = raw.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export default function QuickAddPage() {
  const [raw, setRaw] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => {
    const condo_name = extractCondoName(raw);
    const area = extractArea(raw);
    const type = guessType(raw);
    const status = guessStatus(raw);
    const furnish = guessFurnish(raw);
    const price = extractPrice(raw);
    const sqft = extractSqft(raw);
    const { bedrooms, bathrooms } = extractRoomsBath(raw);
    const carparks = extractCarparks(raw);
    const available_from = extractAvailableFrom(raw);

    return {
      condo_name,
      area,
      type,
      status,
      furnish,
      price,
      sqft,
      bedrooms,
      bathrooms,
      carparks,
      available_from,
    };
  }, [raw]);

  const canSave = preview.condo_name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) {
      window.location.href = "/";
      return;
    }

    // ✅ next_follow_up = 明天（你要的 Today/Inbox 工作流）
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ✅ status=Available 才保留 available_from，否则清空
    const availableFrom =
      preview.status === "Available" ? (preview.available_from ?? null) : null;

    const payload: any = {
      user_id: userId,

      condo_name: preview.condo_name.trim(),
      area: preview.area ? preview.area.trim() : null,

      type: preview.type,
      status: "New", // ✅ Quick Add 强制 New（你要“自动进Inbox”）
      furnish: preview.furnish,

      price: preview.price,
      sqft: preview.sqft,
      bedrooms: preview.bedrooms,
      bathrooms: preview.bathrooms,
      carparks: preview.carparks,

      available_from: availableFrom,

      // ✅ 工作队列字段
      inbox: true,
      next_follow_up: tomorrow.toISOString(),
      priority: 2,

      // ✅ 快速存原文 & link
      raw_text: raw.trim() ? raw.trim() : null,
    

      // ✅ 你已有 last_update trigger 也没关系；这里写不写都行
      last_update: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("listings")
      .insert(payload)
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    window.location.href = `/listings/${data.id}`;
  };

  return (
    <main
  className="min-h-screen text-white bg-[#06070A]
  bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(600px_circle_at_80%_30%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(900px_circle_at_50%_90%,rgba(168,85,247,0.08),transparent_45%)]"
>
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Quick Add</div>
            <div className="text-sm text-zinc-400">
              Paste owner/tenant message → Save → goes to Inbox.
            </div>
          </div>
          <a href="/listings" className="text-sm text-zinc-300 hover:text-white">
            Back
          </a>
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 space-y-3
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Paste text</div>
            <textarea
              className="w-full min-h-44 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none"
              placeholder={`Example:\nPlaza Damas 3\n750 sqft\n1 Bedroom 1 Bathroom\nFully furnished\n2 parking\nRM1800`}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs text-zinc-400 mb-1">Source link (optional)</div>
            <input
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
              placeholder="iProperty / Drive / WhatsApp link..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-zinc-800 p-3 text-sm text-zinc-200 space-y-1">
            <div className="text-xs text-zinc-400">Preview</div>
            <div className="font-semibold text-white">{preview.condo_name || "—"}</div>
            <div className="text-zinc-300">{preview.area ?? "—"}</div>
            <div className="text-zinc-300">
              {preview.type.toUpperCase()} • New (forced) • {preview.furnish ?? "—"}
            </div>
            <div className="text-zinc-300">
              {preview.sqft ?? "—"} sqft • {preview.bedrooms ?? "—"}R • {preview.bathrooms ?? "—"}B •{" "}
              {preview.carparks ?? "—"}CP
            </div>
            <div className="text-zinc-300">RM {preview.price ?? "—"}</div>
          </div>

          {err && <div className="text-sm text-red-400">{err}</div>}

          <button
            disabled={!canSave}
            onClick={save}
            className="w-full rounded-lg bg-cyan-400 text-black font-semibold disabled:opacity-60
            hover:bg-cyan-300 active:scale-[0.98]
shadow-[0_10px_30px_rgba(34,211,238,0.18)]"
          >
            {saving ? "Saving..." : "Save to Inbox"}
          </button>

          <div className="text-xs text-zinc-500">
            Save will: inbox=true, status=New, follow-up=tomorrow, priority=2
          </div>
        </div>
      </div>
    </main>
  );
}