"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

type Deal = {
  gross: number;
  commission_rate: number; // %
  deductions: number;
  notes: string | null;

  // generated columns (read-only)
  commission_amount?: number;
  net?: number;
};

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clampPercent(v: any) {
  const n = safeNum(v);
  return Math.max(0, Math.min(100, n));
}

/**
 * ✅ Smart availability label
 * - if no date OR date <= today => "Ready move in"
 * - else => "Available early/mid/end Feb"
 */
function availabilityLabel(availableFrom: any) {
  if (!availableFrom) return "Ready move in";

  const [y, m, d] = String(availableFrom).split("-").map(Number);
  if (!y || !m || !d) return "Ready move in";

  const from = new Date(y, m - 1, d, 0, 0, 0, 0);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (from.getTime() <= today.getTime()) return "Ready move in";

  const day = from.getDate();
  const bucket = day <= 10 ? "early" : day <= 20 ? "mid" : "end";
  const mon = from.toLocaleString("en-US", { month: "short" });

  return `Available ${bucket} ${mon}`;
}

/** ✅ 租客模板 */
function buildTenantText(item: any) {
  const condo = (item?.condo_name ?? "").trim() || "—";
  const sqft = item?.sqft ? `${item.sqft} sqft` : null;

  const bed = item?.bedrooms != null && item.bedrooms !== "" ? `${item.bedrooms} bedroom` : null;
  const bath =
    item?.bathrooms != null && item.bathrooms !== "" ? `${item.bathrooms} bathroom` : null;

  const cp =
    item?.carparks != null && item.carparks !== ""
      ? `${item.carparks} parking`
      : item?.carparks === 0
      ? `no parking`
      : null;

  const furnish =
    item?.furnish === "Fully"
      ? "Fully Furnished"
      : item?.furnish === "Partial"
      ? "Partial Furnished"
      : null;

  const price = item?.price != null && item.price !== "" ? rm(item.price) : null;

  const availText = availabilityLabel(item?.available_from);

  const lines: string[] = [];
  lines.push(condo);
  lines.push("");

  if (sqft) lines.push(sqft);

  if (bed || bath) {
    const parts = [bed, bath].filter(Boolean);
    if (parts.length) lines.push(parts.join(" "));
  }

  if (furnish) lines.push(furnish);
  if (cp) lines.push(cp);
  if (price) lines.push(price);

  if (availText) {
    lines.push("");
    lines.push(availText);
  }

  return lines.join("\n");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied ✅");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copied ✅");
  }
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [item, setItem] = useState<any>(null);

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState<any>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  const [photos, setPhotos] = useState<any[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [deletingPhotos, setDeletingPhotos] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [deal, setDeal] = useState<Deal>({
    gross: 0,
    commission_rate: 0,
    deductions: 0,
    notes: "",
  });

  const [loading, setLoading] = useState(true);
  const [savingDeal, setSavingDeal] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const photoUrls = useMemo(() => {
    return photos.map(
      (p) => supabase.storage.from("listing-photos").getPublicUrl(p.storage_path).data.publicUrl
    );
  }, [photos]);

  const localCommissionAmount = useMemo(() => {
    return (safeNum(deal.gross) * clampPercent(deal.commission_rate)) / 100;
  }, [deal.gross, deal.commission_rate]);

  const localNet = useMemo(() => {
    return Math.max(0, localCommissionAmount - safeNum(deal.deductions));
  }, [localCommissionAmount, deal.deductions]);

  const tenantText = useMemo(() => {
    if (!item) return "";
    return buildTenantText(item);
  }, [item]);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      window.location.href = "/";
      return;
    }

    const { data, error } = await supabase.from("listings").select("*").eq("id", id).single();
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    setItem(data);
    setInfoDraft(data);

    const { data: ph, error: phErr } = await supabase
      .from("listing_photos")
      .select("*")
      .eq("listing_id", id)
      .order("sort_order", { ascending: true });

    if (phErr) {
      setErr(phErr.message);
      setPhotos([]);
    } else {
      setPhotos(ph ?? []);
    }

    const { data: d, error: dErr } = await supabase
      .from("deals")
      .select("gross,commission_rate,deductions,notes,commission_amount,net")
      .eq("listing_id", id)
      .maybeSingle();

    if (dErr) {
      setErr(dErr.message);
      setDeal({ gross: 0, commission_rate: 0, deductions: 0, notes: "" });
    } else if (!d) {
      setDeal({ gross: 0, commission_rate: 0, deductions: 0, notes: "" });
    } else {
      setDeal({
        gross: safeNum(d.gross),
        commission_rate: clampPercent(d.commission_rate),
        deductions: safeNum(d.deductions),
        notes: d.notes ?? "",
        commission_amount: safeNum(d.commission_amount),
        net: safeNum(d.net),
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return (window.location.href = "/");

    const baseOrder = photos.length;

    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${userId}/${id}/${filename}`;

      const up = await supabase.storage.from("listing-photos").upload(path, f, {
        cacheControl: "3600",
        upsert: false,
      });
      if (up.error) {
        setErr(up.error.message);
        break;
      }

      const ins = await supabase.from("listing_photos").insert({
        listing_id: id,
        user_id: userId,
        storage_path: path,
        sort_order: baseOrder + idx,
      });

      if (ins.error) {
        await supabase.storage.from("listing-photos").remove([path]);
        setErr(ins.error.message);
        break;
      }
    }

    await load();
  };

  const deleteSelectedPhotos = async () => {
    if (selectedPhotoIds.size === 0) {
      alert("你还没勾选照片");
      return;
    }

    const ok = confirm(`确定要删除选中的 ${selectedPhotoIds.size} 张照片吗？不能撤回。`);
    if (!ok) return;

    setDeletingPhotos(true);
    setErr(null);

    try {
      const ids = Array.from(selectedPhotoIds);
      const toDelete = photos.filter((p) => selectedPhotoIds.has(p.id));
      const paths = toDelete.map((p) => p.storage_path).filter(Boolean);

      if (paths.length > 0) {
        const rmS = await supabase.storage.from("listing-photos").remove(paths);
        if (rmS.error) throw new Error(rmS.error.message);
      }

      const rmDb = await supabase.from("listing_photos").delete().in("id", ids);
      if (rmDb.error) throw new Error(rmDb.error.message);

      setSelectedPhotoIds(new Set());
      setManageOpen(false);
      await load();
    } catch (e: any) {
      setErr(e.message ?? "Delete failed");
    } finally {
      setDeletingPhotos(false);
    }
  };

  const deleteListing = async () => {
    const ok = confirm("确定要删除这个房源吗？照片与成交记录会一起删除，不能恢复。");
    if (!ok) return;

    setErr(null);

    const { data: ph, error: phErr } = await supabase
      .from("listing_photos")
      .select("storage_path")
      .eq("listing_id", id);

    if (phErr) return setErr(phErr.message);

    const paths = (ph ?? []).map((p: any) => p.storage_path).filter(Boolean);
    if (paths.length) {
      const rmS = await supabase.storage.from("listing-photos").remove(paths);
      if (rmS.error) return setErr(rmS.error.message);
    }

    const rmPhotosDb = await supabase.from("listing_photos").delete().eq("listing_id", id);
    if (rmPhotosDb.error) return setErr(rmPhotosDb.error.message);

    const rmDeal = await supabase.from("deals").delete().eq("listing_id", id);
    if (rmDeal.error) return setErr(rmDeal.error.message);

    const rmListing = await supabase.from("listings").delete().eq("id", id);
    if (rmListing.error) return setErr(rmListing.error.message);

    window.location.href = "/listings";
  };

  const saveListingInfo = async () => {
    if (!infoDraft) return;
    setSavingInfo(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return (window.location.href = "/");

    const payload = {
      condo_name: (infoDraft.condo_name ?? "").trim(),
      area: infoDraft.area?.trim() ? infoDraft.area.trim() : null,
      sqft: infoDraft.sqft === "" ? null : Number(infoDraft.sqft) || null,
      bedrooms: infoDraft.bedrooms === "" ? null : Number(infoDraft.bedrooms) || null,
      bathrooms: infoDraft.bathrooms === "" ? null : Number(infoDraft.bathrooms) || null,
      carparks: infoDraft.carparks === "" ? null : Number(infoDraft.carparks) || null,
      price: infoDraft.price === "" ? null : Number(infoDraft.price) || null,

      type: infoDraft.type,
      status: infoDraft.status,
      available_from: infoDraft.available_from || null,

      next_follow_up: infoDraft?.next_follow_up ? infoDraft.next_follow_up : null,
      furnish: infoDraft?.furnish || null,
      owner_whatsapp: infoDraft?.owner_whatsapp?.trim() ? infoDraft.owner_whatsapp.trim() : null,
      raw_text: infoDraft?.raw_text?.trim() ? infoDraft.raw_text.trim() : null,

      // ✅ Step 3：任何保存都刷新 last_update
      last_update: new Date().toISOString(),
    };

    const { error } = await supabase.from("listings").update(payload).eq("id", id);
    setSavingInfo(false);

    if (error) return setErr(error.message);

    setEditingInfo(false);
    await load();
  };

  const saveDeal = async () => {
    setSavingDeal(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return (window.location.href = "/");

    const res = await supabase.from("deals").upsert(
      {
        listing_id: id,
        user_id: userId,
        gross: safeNum(deal.gross),
        commission_rate: clampPercent(deal.commission_rate),
        deductions: safeNum(deal.deductions),
        notes: deal.notes?.trim() ? deal.notes : null,
      },
      { onConflict: "listing_id" }
    );

    setSavingDeal(false);
    if (res.error) return setErr(res.error.message);

    await load();
  };

  const clearDeal = async () => {
    const ok = confirm("确定要清空这组 Income/Deal 吗？（会从数据库删除这条 deal）");
    if (!ok) return;

    setErr(null);

    const rmQ = await supabase.from("deals").delete().eq("listing_id", id);
    if (rmQ.error) return setErr(rmQ.error.message);

    await load();
  };

  const openViewer = useCallback(
    (index: number) => {
      if (photoUrls.length === 0) return;
      setViewerIndex(Math.max(0, Math.min(index, photoUrls.length - 1)));
      setViewerOpen(true);
    },
    [photoUrls.length]
  );

  if (loading) return <main className="min-h-screen bg-black text-white p-6">Loading…</main>;
  if (!item) return <main className="min-h-screen bg-black text-white p-6">Not found.</main>;

  return (
    <main
  className="min-h-screen text-white bg-[#06070A]
  bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(600px_circle_at_80%_30%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(900px_circle_at_50%_90%,rgba(168,85,247,0.08),transparent_45%)]"
>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* 下面内容保持你原样（我没动 UI 结构） */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">{item.condo_name}</div>
            <div className="text-sm text-zinc-400">{item.area ?? "—"}</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={deleteListing}
              className="text-sm rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-red-300 hover:bg-zinc-800 hover:text-red-200
              shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            >
              Delete listing
            </button>
            <a href="/listings" className="text-sm text-zinc-300 hover:text-white">
              Back
            </a>
          </div>
        </div>

        <div className="mt-5">
          {/* ✅ 只显示 Carousel（不铺缩略图） */}
          <div className="cursor-zoom-in" onClick={() => openViewer(0)} title="Click to zoom">
            <PhotoCarousel urls={photoUrls} />
          </div>

          {/* ✅ Upload + Manage + Delete selected（红色） */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-300">
                <span className="rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 hover:bg-zinc-800 cursor-pointer inline-block
                shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
                  Upload photos
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadPhotos(e.target.files)}
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setManageOpen(true);
                  setSelectedPhotoIds(new Set());
                }}
                className="text-sm rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-zinc-200 hover:bg-zinc-800
                shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
              >
                Manage photos
              </button>

              <button
                type="button"
                disabled={!manageOpen || selectedPhotoIds.size === 0 || deletingPhotos}
                onClick={deleteSelectedPhotos}
                className="text-sm rounded-lg bg-transparent px-2 py-2 text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                {deletingPhotos ? "Deleting..." : "Delete selected"}
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Updated: {new Date(item.updated_at).toLocaleString()}
            </div>
          </div>

          {/* ✅ ✅ ✅ 租客模板区 */}
          <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-white">Tenant template</div>
                <div className="text-xs text-zinc-400 mt-1">
                  一键复制 / 一键 WhatsApp（直接贴给租客）
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyText(tenantText)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
                >
                  📋 Copy
                </button>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(tenantText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black hover:opacity-90"
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
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* Listing info */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 space-y-3 text-sm text-zinc-200
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">Listing info</div>

              {!editingInfo ? (
                <button
                  type="button"
                  onClick={() => {
                    setInfoDraft(item);
                    setEditingInfo(true);
                  }}
                  className="text-xs rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-zinc-200 hover:bg-white/10"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInfoDraft(item);
                      setEditingInfo(false);
                    }}
                    className="text-xs rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-zinc-200 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingInfo}
                    onClick={saveListingInfo}
                    className="text-xs rounded-lg px-3 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_6px_18px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.97]
disabled:opacity-40 disabled:shadow-none"
                  >
                    {savingInfo ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Type</div>
                {editingInfo ? (
                  <select
                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                    value={infoDraft?.type ?? "rent"}
                    onChange={(e) => setInfoDraft((d: any) => ({ ...d, type: e.target.value }))}
                  >
                    <option value="rent">rent</option>
                    <option value="sale">sale</option>
                  </select>
                ) : (
                  <div>{item.type}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Status</div>
                {editingInfo ? (
                  <select
                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                    value={infoDraft?.status ?? "available"}
                    onChange={(e) => setInfoDraft((d: any) => ({ ...d, status: e.target.value }))}
                  >
                    <option value="New">New</option>
<option value="Available">Available</option>
<option value="Follow-up">Follow-up</option>
<option value="Viewing">Viewing</option>
<option value="Negotiating">Negotiating</option>
<option value="Booked">Booked</option>
<option value="Closed">Closed</option>
<option value="Inactive">Inactive</option>
                  </select>
                ) : (
                  <div>{item.status}</div>
                )}
              </div>

              {/* ✅ Available date 可编辑 */}
              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Available from</div>
                {editingInfo ? (
                  <input
                    type="date"
                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                    value={infoDraft?.available_from ?? ""}
                    onChange={(e) =>
                      setInfoDraft((d: any) => ({ ...d, available_from: e.target.value }))
                    }
                  />
                ) : (
                  <div>{availabilityLabel(item.available_from)}</div>
                )}
              </div>

{/* ✅ Next follow-up */}
<div className="col-span-2">
  <div className="text-xs text-zinc-400 mb-1">Next follow-up</div>
  {editingInfo ? (
    <input
      type="date"
      className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
      value={infoDraft?.next_follow_up ?? ""}
      onChange={(e) =>
        setInfoDraft((d: any) => ({ ...d, next_follow_up: e.target.value }))
      }
    />
  ) : (
    <div>{item.next_follow_up ? new Date(item.next_follow_up).toLocaleDateString() : "—"}</div>
  )}
</div>

              {/* ✅ Furnish（Fully / Partial） */}
              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Furnish</div>
                {editingInfo ? (
                  <select
                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                    value={infoDraft?.furnish ?? ""}
                    onChange={(e) => setInfoDraft((d: any) => ({ ...d, furnish: e.target.value }))}
                  >
                    <option value="">— Select —</option>
                    <option value="Fully">Fully furnished</option>
                    <option value="Partial">Partial furnished</option>
                  </select>
                ) : (
                  <div>{item.furnish ?? "—"}</div>
                )}
              </div>
            </div>

{/* ✅ Owner WhatsApp（只在详情页显示，不影响 listing 卡片） */}
<div>
  <div className="text-xs text-zinc-400 mb-1">Owner WhatsApp</div>
  {editingInfo ? (
    <input
      className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
      value={infoDraft?.owner_whatsapp ?? ""}
      onChange={(e) =>
        setInfoDraft((d: any) => ({ ...d, owner_whatsapp: e.target.value }))
      }
      placeholder="e.g. 60123456789 / 0123456789"
    />
  ) : (
    <div>{item.owner_whatsapp ?? "—"}</div>
  )}
</div>
{/* ✅ Raw paste（从 Quick Add 进来的原始文字） */}
<div className="col-span-2">
  <div className="text-xs text-zinc-400 mb-1">Raw paste</div>

  {editingInfo ? (
    <textarea
      className="w-full min-h-28 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
      value={infoDraft?.raw_text ?? ""}
      onChange={(e) => setInfoDraft((d: any) => ({ ...d, raw_text: e.target.value }))}
      placeholder="paste text..."
    />
  ) : (
    <div className="whitespace-pre-wrap text-zinc-200">
      {item.raw_text ?? "—"}
    </div>
  )}
</div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Condo name</div>
              {editingInfo ? (
                <input
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={infoDraft?.condo_name ?? ""}
                  onChange={(e) => setInfoDraft((d: any) => ({ ...d, condo_name: e.target.value }))}
                />
              ) : (
                <div className="text-white font-medium">{item.condo_name}</div>
              )}
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-1">Area</div>
              {editingInfo ? (
                <input
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={infoDraft?.area ?? ""}
                  onChange={(e) => setInfoDraft((d: any) => ({ ...d, area: e.target.value }))}
                  placeholder="e.g. Mont Kiara"
                />
              ) : (
                <div>{item.area ?? "—"}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["sqft", "Sqft"],
                ["price", "Price (RM)"],
                ["bedrooms", "Bedrooms"],
                ["bathrooms", "Bathrooms"],
                ["carparks", "Carparks"],
              ].map(([key, label]) => (
                <div key={key}>
                  <div className="text-xs text-zinc-400 mb-1">{label}</div>
                  {editingInfo ? (
                    <input
                      type="number"
                      className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                      value={infoDraft?.[key] ?? ""}
                      onChange={(e) => setInfoDraft((d: any) => ({ ...d, [key]: e.target.value }))}
                    />
                  ) : (
                    <div>{item[key] ?? "—"}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Income / Deal */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 space-y-3
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">Income / Deal</div>
              <button
                onClick={clearDeal}
                className="text-xs rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-zinc-200 hover:bg-white/10"
              >
                Clear Deal
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Gross (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={deal.gross === 0 ? "" : String(deal.gross)}
                  onChange={(e) => setDeal((d) => ({ ...d, gross: safeNum(e.target.value) }))}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Commission (%)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={deal.commission_rate === 0 ? "" : String(deal.commission_rate)}
                  onChange={(e) =>
                    setDeal((d) => ({ ...d, commission_rate: clampPercent(e.target.value) }))
                  }
                />
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Deductions (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={deal.deductions === 0 ? "" : String(deal.deductions)}
                  onChange={(e) => setDeal((d) => ({ ...d, deductions: safeNum(e.target.value) }))}
                />
              </div>
            </div>

            <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Commission (RM):</span>
                <span className="font-semibold text-white">{rm(localCommissionAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Net:</span>
                <span className="font-semibold text-white">{rm(localNet)}</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-1">Notes</div>
              <textarea
                className="w-full min-h-20 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                value={deal.notes ?? ""}
                onChange={(e) => setDeal((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>

            <button
              onClick={saveDeal}
              disabled={savingDeal}
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_6px_18px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.97]
disabled:opacity-40 disabled:shadow-none"
            >
              {savingDeal ? "Saving..." : "Save income"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800
            shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
          >
            View dashboard →
          </a>

          <a
            href="/listings"
            className="inline-block rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800
            shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
          >
            Back to listings
          </a>
        </div>
      </div>

      {/* ✅ Viewer modal：hover 才显示 close + 动效 */}
      {viewerOpen && photoUrls.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setViewerOpen(false)}
        >
          <div
            className="relative max-w-5xl w-[95vw] max-h-[85vh] group"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrls[viewerIndex]}
              alt=""
              className="w-full h-[85vh] object-contain rounded-2xl bg-black"
            />

            <button
              type="button"
              onClick={() => setViewerOpen(false)}
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-200
                         -translate-y-1 group-hover:translate-y-0
                         rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
              title="Close"
            >
              ✕
            </button>

            {photoUrls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setViewerIndex((i) => (i - 1 + photoUrls.length) % photoUrls.length)
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setViewerIndex((i) => (i + 1) % photoUrls.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ✅ Manage modal：勾选要删的照片 */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setManageOpen(false)}
        >
          <div
            className="w-[95vw] max-w-3xl rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
            shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">Manage photos</div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {photos.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">No photos.</div>
            ) : (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((p, idx) => {
                  const url =
                    supabase.storage.from("listing-photos").getPublicUrl(p.storage_path).data
                      .publicUrl;
                  const checked = selectedPhotoIds.has(p.id);

                  return (
                    <label key={p.id} className="cursor-pointer select-none">
                      <div
                        className={`rounded-xl overflow-hidden bg-zinc-800 border ${
                          checked ? "border-white" : "border-transparent"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-28 w-full object-cover" />
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selectedPhotoIds);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setSelectedPhotoIds(next);
                          }}
                        />
                        <span>Select</span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            openViewer(idx);
                          }}
                          className="ml-auto text-zinc-300 hover:text-white"
                        >
                          Preview
                        </button>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <div className="text-xs text-zinc-400">Selected: {selectedPhotoIds.size}</div>

              <button
                type="button"
                disabled={selectedPhotoIds.size === 0 || deletingPhotos}
                onClick={deleteSelectedPhotos}
                className="rounded-lg px-3 py-2 text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                {deletingPhotos ? "Deleting..." : "Delete selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}