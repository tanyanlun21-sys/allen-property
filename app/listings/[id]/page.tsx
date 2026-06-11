"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type Deal = {
  gross: number;
  commission_rate: number;
  tenancy: number; // �?新增
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
 * �?Smart availability label
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

function isStudioBedrooms(value: any) {
  return value === 0 || value === "0" || String(value ?? "").toLowerCase() === "studio";
}

/** �?租客模板 */
function buildTenantText(item: any) {
  const condo = (item?.condo_name ?? "").trim() || "-";
  const sqft = item?.sqft ? `${item.sqft} sqft` : null;

  const bed = isStudioBedrooms(item?.bedrooms)
    ? "Studio"
    : item?.bedrooms != null && item.bedrooms !== ""
    ? `${item.bedrooms} bedroom`
    : null;
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
    alert("Copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copied");
  }
}

async function copyPhotoLinks(urls: string[]) {
  if (urls.length === 0) {
    alert("No photos to copy.");
    return;
  }

  const text = urls.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    alert("Photo links copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Photo links copied");
  }
}

async function copyPhotos(urls: string[]) {
  if (urls.length === 0) {
    alert("No photos to copy.");
    return;
  }

  if (urls.length === 1) {
    try {
      const response = await fetch(urls[0]);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert("Photo copied");
    } catch (error) {
      console.error("Failed to copy photo:", error);
      await copyPhotoLinks(urls);
      alert("Failed to copy photo. Photo links copied instead.");
    }
  } else {
    // Multiple photos: try to copy the first one
    try {
      const response = await fetch(urls[0]);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert("Browser can copy one image at a time. First photo copied.");
    } catch (error) {
      console.error("Failed to copy photo:", error);
      await copyPhotoLinks(urls);
      alert("Failed to copy photo. Photo links copied instead.");
    }
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
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [showAllOpen, setShowAllOpen] = useState(false);

  const [deal, setDeal] = useState<Deal>({
  gross: 0,
  commission_rate: 0,
  tenancy: 0, // �?新增
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
  return Math.max(
    0,
    localCommissionAmount + safeNum(deal.tenancy) - safeNum(deal.deductions)
  );
}, [localCommissionAmount, deal.tenancy, deal.deductions]);

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
      .select("gross,commission_rate,tenancy,deductions,notes,commission_amount,net")
      .eq("listing_id", id)
      .maybeSingle();

    if (dErr) {
      setErr(dErr.message);
      setDeal({ gross: 0, commission_rate: 0, tenancy: 0, deductions: 0, notes: "" });
    } else if (!d) {
      setDeal({ gross: 0, commission_rate: 0, tenancy: 0,deductions: 0, notes: "" });
    } else {
      setDeal({
        gross: safeNum(d.gross),
        commission_rate: clampPercent(d.commission_rate),
        tenancy: safeNum(d.tenancy),
        deductions: safeNum(d.deductions),
        notes: d.notes ?? "",
        commission_amount: safeNum(d.commission_amount),
        net: safeNum(d.net),
      });
    }

    setLoading(false);
  };

  const updatePhotoOrder = async (newPhotos: any[]) => {
    setUpdatingOrder(true);
    setErr(null);

    try {
      for (const [idx, p] of newPhotos.entries()) {
        const { error } = await supabase
          .from("listing_photos")
          .update({ sort_order: idx })
          .eq("id", p.id);
        if (error) throw error;
      }

      setPhotos(newPhotos);
      // await load(); // Remove to avoid full reload
    } catch (e: any) {
      setErr(e.message ?? "Update failed");
    } finally {
      setUpdatingOrder(false);
    }
  };

  const setCover = async (photoId: string) => {
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx === -1 || idx === 0) return;
    const newPhotos = [...photos];
    const [removed] = newPhotos.splice(idx, 1);
    newPhotos.unshift(removed);
    setPhotos(newPhotos);
    updatePhotoOrder(newPhotos);
  };

  const handleDragStart = (e: React.DragEvent, photoId: string) => {
    setDraggedPhotoId(photoId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetPhotoId: string) => {
    e.preventDefault();
    if (!draggedPhotoId || draggedPhotoId === targetPhotoId) return;

    const draggedIdx = photos.findIndex(p => p.id === draggedPhotoId);
    const targetIdx = photos.findIndex(p => p.id === targetPhotoId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newPhotos = [...photos];
    const [removed] = newPhotos.splice(draggedIdx, 1);
    newPhotos.splice(targetIdx, 0, removed);

    setPhotos(newPhotos);
    updatePhotoOrder(newPhotos);
    setDraggedPhotoId(null);
  };

  const moveLeft = (photoId: string) => {
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx <= 0) return;
    const newPhotos = [...photos];
    [newPhotos[idx - 1], newPhotos[idx]] = [newPhotos[idx], newPhotos[idx - 1]];
    updatePhotoOrder(newPhotos);
  };

  const moveRight = (photoId: string) => {
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx === -1 || idx >= photos.length - 1) return;
    const newPhotos = [...photos];
    [newPhotos[idx], newPhotos[idx + 1]] = [newPhotos[idx + 1], newPhotos[idx]];
    updatePhotoOrder(newPhotos);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const shouldLock = manageOpen || showAllOpen || viewerOpen;
    if (!shouldLock) return;

    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, [manageOpen, showAllOpen, viewerOpen]);

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
    if (inputRef.current) inputRef.current.value = '';
  };

  const deleteSelectedPhotos = async () => {
    if (selectedPhotoIds.size === 0) {
      alert("No photos selected");
      return;
    }

    const ok = confirm(`确定要删除选中�?${selectedPhotoIds.size} 张照片吗？不能撤回。`);
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

  const deleteSinglePhoto = async (photoId: string) => {
    const ok = confirm("Delete this photo? Cannot undo.");
    if (!ok) return;

    setDeletingPhotos(true);
    setErr(null);

    try {
      const photo = photos.find(p => p.id === photoId);
      if (photo?.storage_path) {
        const rmS = await supabase.storage.from("listing-photos").remove([photo.storage_path]);
        if (rmS.error) throw new Error(rmS.error.message);
      }

      const rmDb = await supabase.from("listing_photos").delete().eq("id", photoId);
      if (rmDb.error) throw new Error(rmDb.error.message);

      await load();
    } catch (e: any) {
      setErr(e.message ?? "Delete failed");
    } finally {
      setDeletingPhotos(false);
    }
  };

  const deleteListing = async () => {
    const ok = confirm("Delete this listing? Photos and deal records will also be deleted.");
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
      bedrooms: isStudioBedrooms(infoDraft.bedrooms)
        ? 0
        : infoDraft.bedrooms === ""
        ? null
        : Number(infoDraft.bedrooms) || null,
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

      // Step 3: refresh last_update on every save
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
        tenancy: safeNum(deal.tenancy),
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
    const ok = confirm("Clear this Income/Deal? This will delete the deal record.");
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

  if (loading) return <main className="min-h-screen bg-black text-white p-6">Loading...</main>;
  if (!item) return <main className="min-h-screen bg-black text-white p-6">Not found.</main>;

  return (
    <main className="min-h-screen text-white bg-[#06070A] bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(600px_circle_at_80%_30%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(900px_circle_at_50%_90%,rgba(168,85,247,0.08),transparent_45%)]">
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* 下面内容保持你原样（我没�?UI 结构�?*/}

          <div className="flex items-center gap-3 md:justify-end">
            <button
              onClick={deleteListing}
              className="text-sm rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-red-300 hover:bg-zinc-800 hover:text-red-200 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            >
              Delete listing
            </button>
            <a href="/listings" className="text-sm text-zinc-300 hover:text-white">
              Back
            </a>
          </div>




        <div className="mt-5">
          <div className="grid h-[300px] max-h-[300px] gap-3 overflow-hidden md:grid-cols-[3fr_2fr] md:h-[360px] md:max-h-[360px]">
            <div className="h-full overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              {photoUrls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openViewer(0)}
                  className="block w-full h-full"
                  title="Click to zoom"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrls[0]}
                    alt="Listing photo"
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex h-full items-center justify-center p-10 text-center text-sm text-zinc-400">
                  No photos yet.
                </div>
              )}
            </div>

            <div className="grid h-full grid-cols-2 gap-3 overflow-hidden">
              {[1, 2, 3, 4].map((slot) => {
                const idx = slot;
                const url = photoUrls[idx];
                const isOverflow = slot === 4 && photoUrls.length > 5;

                return (
                  <div
                    key={slot}
                    className="relative rounded-3xl overflow-hidden bg-zinc-900 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                  >
                    {url ? (
                      <button
                        type="button"
                        onClick={() => isOverflow ? setShowAllOpen(true) : openViewer(idx)}
                        className="block h-full w-full"
                        title="Click to zoom"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Listing photo ${idx + 1}`} className="h-full w-full object-cover" />
                        {isOverflow && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-center px-2 text-sm font-semibold text-white">
                            Show all media
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-zinc-500">
                        {slot === 4 ? "More photos will appear here" : "Photo placeholder"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-zinc-300">
                <span
                  className="rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 hover:bg-zinc-800 cursor-pointer inline-block shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
                >
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
                className="text-sm rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-zinc-200 hover:bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
              >
                Manage photos
              </button>

              <button
                type="button"
                onClick={() => copyPhotos(photoUrls)}
                disabled={photoUrls.length === 0}
                className="text-sm rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
              >
                Copy photos
              </button>

              <button
                type="button"
                disabled={!manageOpen || selectedPhotoIds.size === 0 || deletingPhotos}
                onClick={deleteSelectedPhotos}
                className="text-sm rounded-lg bg-transparent px-3 py-2 text-red-300 hover:text-red-200 disabled:opacity-50"
              >
                {deletingPhotos ? "Deleting..." : "Delete selected"}
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Updated: {new Date(item.updated_at).toLocaleString()}
            </div>
          </div>
        </div>

          {/* �?�?�?租客模板�?*/}

        <div className="mt-4 grid gap-4 md:grid-cols-[420px_auto] md:items-center">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="truncate text-xl font-semibold leading-tight text-white">{item.condo_name}</div>
            <div className="mt-1 text-sm text-zinc-400">{item.area ?? "-"}</div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-white">
              {item.price != null ? rm(item.price) : "-"}
              {item.type === "rent" && <span className="ml-2 text-sm font-medium text-zinc-400">/ mo</span>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.09] text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                {isStudioBedrooms(item.bedrooms) ? "S" : item.bedrooms ?? "-"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-zinc-400">Beds</div>
            </div>
            <div>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.09] text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                {item.bathrooms ?? "-"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-zinc-400">Baths</div>
            </div>
            <div>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.09] text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                {item.sqft ?? "-"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-zinc-400">sqft</div>
            </div>
            <div>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.09] text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)]">
                {item.carparks ?? "-"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-zinc-400">CP</div>
            </div>
          </div>

        </div>

          <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>



                <div className="text-base font-semibold text-white">Tenant template</div>
                <div className="text-xs text-zinc-400 mt-1">
                  One-click copy / WhatsApp to tenant
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyText(tenantText)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-black bg-cyan-400 hover:bg-cyan-300 shadow-[0_10px_30px_rgba(34,211,238,0.35)] transition-all duration-150 active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
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

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* Listing info */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 space-y-3 text-sm text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
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
                    className="text-xs rounded-lg px-3 py-2 text-sm font-semibold text-black bg-cyan-400 hover:bg-cyan-300 shadow-[0_6px_18px_rgba(34,211,238,0.35)] transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
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
                  <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.type ?? "rent"} onChange={(e) => setInfoDraft((d: any) => ({ ...d, type: e.target.value }))}>
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
                  <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.status ?? "available"} onChange={(e) => setInfoDraft((d: any) => ({ ...d, status: e.target.value }))}>
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

              <div>
                <div className="text-xs text-zinc-400 mb-1">Available from</div>
                {editingInfo ? (
                  <input type="date" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.available_from ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, available_from: e.target.value }))} />
                ) : (
                  <div>{availabilityLabel(item.available_from)}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Next follow-up</div>
                {editingInfo ? (
                  <input type="date" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.next_follow_up ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, next_follow_up: e.target.value }))} />
                ) : (
                  <div>{item.next_follow_up ? new Date(item.next_follow_up).toLocaleDateString() : "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Condo name</div>
                {editingInfo ? (
                  <input className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.condo_name ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, condo_name: e.target.value }))} />
                ) : (
                  <div className="text-white font-medium">{item.condo_name}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Area</div>
                {editingInfo ? (
                  <input className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.area ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, area: e.target.value }))} placeholder="e.g. Mont Kiara" />
                ) : (
                  <div>{item.area ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Sqft</div>
                {editingInfo ? (
                  <input type="number" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.sqft ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, sqft: e.target.value }))} />
                ) : (
                  <div>{item.sqft ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Price (RM)</div>
                {editingInfo ? (
                  <input type="number" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.price ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, price: e.target.value }))} />
                ) : (
                  <div>{item.price ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Bedrooms</div>
                {editingInfo ? (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input type={isStudioBedrooms(infoDraft?.bedrooms) ? "text" : "number"} disabled={isStudioBedrooms(infoDraft?.bedrooms)} className="min-w-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none disabled:opacity-60" value={isStudioBedrooms(infoDraft?.bedrooms) ? "Studio" : infoDraft?.bedrooms ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, bedrooms: e.target.value }))} />
                    <button type="button" onClick={() => setInfoDraft((d: any) => ({ ...d, bedrooms: isStudioBedrooms(d?.bedrooms) ? "" : "0" }))} className={isStudioBedrooms(infoDraft?.bedrooms) ? "rounded-lg border border-cyan-300 bg-cyan-400 px-3 py-2 text-xs font-semibold text-black transition" : "rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"}>
                      Studio
                    </button>
                  </div>
                ) : (
                  <div>{isStudioBedrooms(item.bedrooms) ? "Studio" : item.bedrooms ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Bathrooms</div>
                {editingInfo ? (
                  <input type="number" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.bathrooms ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, bathrooms: e.target.value }))} />
                ) : (
                  <div>{item.bathrooms ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Carparks</div>
                {editingInfo ? (
                  <input type="number" className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.carparks ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, carparks: e.target.value }))} />
                ) : (
                  <div>{item.carparks ?? "-"}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Furnish</div>
                {editingInfo ? (
                  <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.furnish ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, furnish: e.target.value }))}>
                    <option value="">Select</option>
                    <option value="Fully">Fully furnished</option>
                    <option value="Partial">Partial furnished</option>
                  </select>
                ) : (
                  <div>{item.furnish ?? "-"}</div>
                )}
              </div>

              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Owner WhatsApp</div>
                {editingInfo ? (
                  <input className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none" value={infoDraft?.owner_whatsapp ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, owner_whatsapp: e.target.value }))} placeholder="e.g. 60123456789 / 0123456789" />
                ) : (
                  <div>{item.owner_whatsapp ?? "-"}</div>
                )}
              </div>

              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Remark</div>
                {editingInfo ? (
                  <textarea className="w-full min-h-28 rounded-lg bg-zinc-700 border border-white/20 px-3 py-2 text-sm outline-none" value={infoDraft?.raw_text ?? ""} onChange={(e) => setInfoDraft((d: any) => ({ ...d, raw_text: e.target.value }))} placeholder="remark..." />
                ) : (
                  <div className="whitespace-pre-wrap text-zinc-200 rounded-lg bg-zinc-700 border border-white/20 px-3 py-2 min-h-28">{item.raw_text ?? "-"}</div>
                )}
              </div>
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

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Deductions (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-900/70 px-3 py-2 text-sm text-zinc-400 outline-none"
                  value={deal.deductions === 0 ? "" : String(deal.deductions)}
                  onChange={(e) => setDeal((d) => ({ ...d, deductions: safeNum(e.target.value) }))}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">Tenancy (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={deal.tenancy === 0 ? "" : String(deal.tenancy)}
                  onChange={(e) => setDeal((d) => ({ ...d, tenancy: safeNum(e.target.value) }))}
                />
              </div>
            </div>

            <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Commission (RM):</span>
                <span className="font-semibold text-white">{rm(localCommissionAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
  <span className="text-zinc-300">Tenancy Fee:</span>
  <span className="font-semibold text-white">{rm(deal.tenancy)}</span>
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
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-black bg-cyan-400 hover:bg-cyan-300 shadow-[0_6px_18px_rgba(34,211,238,0.35)] transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
            >
              {savingDeal ? "Saving..." : "Save income"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
          >
            View dashboard &rarr;
          </a>

          <a
            href="/listings"
            className="inline-block rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
          >
            Back to listings
          </a>
        </div>
      </div>

      {/* �?Viewer modal：hover 才显�?close + 动效 */}
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
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-y-1 group-hover:translate-y-0 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
              title="Close"
            >
              ×
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

      {/* �?Manage modal：勾选要删的照片 */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center overflow-hidden overscroll-contain"
          onClick={() => setManageOpen(false)}
        >
          <div
            ref={modalRef}
            className="w-[96vw] max-w-7xl max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => uploadPhotos(e.target.files)}
              className="hidden"
            />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-white">Photos ({photos.length})</div>
                <div className="text-xs text-zinc-400">Drag to reorder</div>
              </div>
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
              <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-4">
                {/* Cover photo */}
                {photos.length > 0 && (
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, photos[0].id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, photos[0].id)}
                    className="col-span-2 row-span-2 relative group cursor-pointer select-none rounded-lg border border-gray-200 bg-white overflow-hidden"
                  >
                    <img
                      src={supabase.storage.from("listing-photos").getPublicUrl(photos[0].storage_path).data.publicUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      Cover photo
                    </div>
                    <div className="absolute top-2 right-2">
                      <input
                        type="checkbox"
                        checked={selectedPhotoIds.has(photos[0].id)}
                        onChange={(e) => {
                          const next = new Set(selectedPhotoIds);
                          if (e.target.checked) next.add(photos[0].id);
                          else next.delete(photos[0].id);
                          setSelectedPhotoIds(next);
                        }}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-gray-500">
                      ••••
                    </div>
                  </div>
                )}

                {/* Other photos */}
                {photos.slice(1).map((p, idx) => {
                  const url = supabase.storage.from("listing-photos").getPublicUrl(p.storage_path).data.publicUrl;

                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, p.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, p.id)}
                      className="relative group cursor-pointer select-none rounded-lg border border-gray-200 bg-white overflow-hidden"
                    >
                      <img src={url} alt="" className="w-full h-full object-cover aspect-square" />

                      <div className="absolute top-2 left-2">
                        <input
                          type="checkbox"
                          checked={selectedPhotoIds.has(p.id)}
                          onChange={(e) => {
                            const next = new Set(selectedPhotoIds);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setSelectedPhotoIds(next);
                          }}
                          className="w-4 h-4"
                        />
                      </div>

                      <div className="absolute top-2 right-2">
                        {/* Menu button removed, using hover action bar */}
                      </div>

                      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-gray-500">
                        ••••
                      </div>

                      {/* Hover action bar */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs flex opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setCover(p.id)}
                          className="flex-1 py-1 hover:bg-black/70"
                        >
                          Set as cover
                        </button>
                        <button
                          onClick={() => deleteSinglePhoto(p.id)}
                          className="flex-1 py-1 hover:bg-black/70 text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add photo card */}
                <div
                  onClick={() => inputRef.current?.click()}
                  className="col-span-1 aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <span className="text-2xl text-gray-400">+</span>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <div className="text-xs text-zinc-400">Selected: {selectedPhotoIds.size}</div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPhotoIds.size < photos.length) {
                      setSelectedPhotoIds(new Set(photos.map(p => p.id)));
                    } else {
                      setSelectedPhotoIds(new Set());
                    }
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {selectedPhotoIds.size < photos.length ? "Select all" : "Clear selection"}
                </button>

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
        </div>
      )}

      {/* Show all media modal */}
      {showAllOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center overflow-hidden overscroll-contain"
          onClick={() => setShowAllOpen(false)}
        >
          <div
            className="w-[95vw] max-w-4xl max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">All photos</div>
              <button
                type="button"
                onClick={() => setShowAllOpen(false)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {photos.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">No photos.</div>
            ) : (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((p, idx) => {
                  const url =
                    supabase.storage.from("listing-photos").getPublicUrl(p.storage_path).data
                      .publicUrl;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setShowAllOpen(false);
                        openViewer(idx);
                      }}
                      className="rounded-xl overflow-hidden bg-zinc-800 border border-transparent hover:border-white/50 transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-32 w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
