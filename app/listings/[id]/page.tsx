"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

/* ================== Types ================== */
type Deal = {
  gross: number;
  commission_rate: number;
  deductions: number;
  notes: string | null;
  commission_amount?: number;
  net?: number;
};

/* ================== Utils ================== */
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPercent(v: any) {
  const n = safeNum(v);
  return Math.max(0, Math.min(100, n));
}

/* ✅ 自动 availability 文案 */
function availabilityLabel(availableFrom: any) {
  if (!availableFrom) return "Ready move in";

  const [y, m, d] = String(availableFrom).split("-").map(Number);
  if (!y || !m || !d) return "Ready move in";

  const from = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (from <= today) return "Ready move in";

  const day = from.getDate();
  const bucket = day <= 10 ? "early" : day <= 20 ? "mid" : "end";
  const mon = from.toLocaleString(undefined, { month: "short" });

  return `Available ${bucket} ${mon}`;
}

/* ================== Tenant text ================== */
function buildTenantText(item: any) {
  const lines: string[] = [];

  lines.push(item?.condo_name || "—");
  lines.push("");

  if (item?.sqft) lines.push(`${item.sqft} sqft`);
  if (item?.bedrooms || item?.bathrooms)
    lines.push(`${item.bedrooms ?? "-"} bedroom ${item.bathrooms ?? "-"} bathroom`);
  if (item?.furnish === "Fully") lines.push("Fully Furnished");
  if (item?.furnish === "Partial") lines.push("Partial Furnished");
  if (item?.carparks !== null) lines.push(`${item.carparks} parking`);
  if (item?.price) lines.push(rm(item.price));

  lines.push("");
  lines.push(availabilityLabel(item?.available_from));

  return lines.join("\n");
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  alert("Copied ✅");
}

/* ================== Page ================== */
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState<any>(null);

  const photoUrls = useMemo(
    () =>
      photos.map(
        (p) => supabase.storage.from("listing-photos").getPublicUrl(p.storage_path).data.publicUrl
      ),
    [photos]
  );

  const tenantText = useMemo(() => (item ? buildTenantText(item) : ""), [item]);

  async function load() {
    setLoading(true);

    const { data } = await supabase.from("listings").select("*").eq("id", id).single();
    setItem(data);
    setInfoDraft(data);

    const { data: ph } = await supabase
      .from("listing_photos")
      .select("*")
      .eq("listing_id", id)
      .order("sort_order");

    setPhotos(ph || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <main className="min-h-screen bg-black text-white p-6">Loading…</main>;
  if (!item) return <main className="min-h-screen bg-black text-white p-6">Not found.</main>;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PhotoCarousel urls={photoUrls} />

        {/* ✅ Tenant template */}
        <div className="mt-4 rounded-2xl bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-white">Tenant template</div>
              <div className="text-xs text-zinc-400">一键复制 / 一键 WhatsApp</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyText(tenantText)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
              >
                Copy
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(tenantText)}`}
                target="_blank"
                className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black"
              >
                WhatsApp
              </a>
            </div>
          </div>

          <textarea
            readOnly
            value={tenantText}
            className="mt-4 w-full min-h-40 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none"
          />
        </div>

        {/* ✅ Listing info */}
        <div className="mt-6 rounded-2xl bg-zinc-900 p-5 text-sm">
          <div className="flex justify-between">
            <div className="text-base font-semibold">Listing info</div>
            <button onClick={() => setEditingInfo(!editingInfo)} className="text-xs text-zinc-400">
              {editingInfo ? "Cancel" : "Edit"}
            </button>
          </div>

          <div className="mt-3 space-y-2 text-zinc-300">
            <div>Status: {item.status}</div>
            <div>Available: {availabilityLabel(item.available_from)}</div>
            <div>Furnish: {item.furnish ?? "-"}</div>
            <div>Price: {item.price ? rm(item.price) : "-"}</div>
          </div>
        </div>
      </div>
    </main>
  );
}