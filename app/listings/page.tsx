"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";

type ListingStatus =
  | "New"
  | "Available"
  | "Follow-up"
  | "Viewing"
  | "Negotiating"
  | "Booked"
  | "Closed"
  | "Inactive"
  | "Pending";

type Furnish = "Fully" | "Partial" | null;

type WorkListing = {
  id: string;
  type: ListingType;
  status: ListingStatus;

  condo_name: string;
  area: string | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;
  price: number | null;
  furnish: Furnish;

  inbox: boolean;
  last_update: string | null;
  next_follow_up: string | null;
  priority: number | null;

  aging_days: number;

  updated_at: string;

  raw_text: string | null;

  owner_whatsapp: string | null;

  _photoUrls?: string[];
};

type ViewTab = "inbox" | "active" | "all";
type StatusFilter = "all" | ListingStatus;

const STATUS_OPTIONS: ListingStatus[] = [
  "New",
  "Available",
  "Follow-up",
  "Viewing",
  "Negotiating",
  "Booked",
  "Closed",
  "Inactive",
  "Pending",
];

function statusPillClass(s: ListingStatus) {
  switch (s) {
    case "New":
      return "bg-zinc-700 text-zinc-100";
    case "Available":
      return "bg-emerald-900/40 text-emerald-200";
    case "Follow-up":
      return "bg-amber-900/40 text-amber-200";
    case "Viewing":
      return "bg-sky-900/40 text-sky-200";
    case "Negotiating":
      return "bg-purple-900/40 text-purple-200";
    case "Booked":
      return "bg-blue-900/40 text-blue-200";
    case "Closed":
      return "bg-zinc-800 text-zinc-200";
    case "Inactive":
      return "bg-zinc-900 text-zinc-400";
    case "Pending":
      return "bg-orange-900/40 text-orange-200";
    default:
      return "bg-zinc-800 text-zinc-200";
  }
}

function formatDT(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatDateOnly(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isDueTodayOrPast(s: string | null | undefined) {
  if (!s) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return b <= today;
}

export default function ListingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<WorkListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [viewTab, setViewTab] = useState<ViewTab>("active");
  const [typeTab, setTypeTab] = useState<"all" | "rent" | "sale">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const rentSectionRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filter Modal
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  useEffect(() => {
    if (!filterModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow || "";
    };
  }, [filterModalOpen]);

  const [filterTab, setFilterTab] = useState<"price" | "bedroom">("price");
  const [priceMinInput, setPriceMinInput] = useState<string>("");
  const [priceMaxInput, setPriceMaxInput] = useState<string>("");
  const [bedroomFilter, setBedroomFilter] = useState<Set<number>>(new Set());
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
  }, []);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id,type,status,condo_name,area,sqft,bedrooms,bathrooms,carparks,price,furnish,updated_at,inbox,last_update,next_follow_up,priority,raw_text,owner_whatsapp"
      )
      .order("updated_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setItems([]);
      setLoading(false);
      return;
    }

    console.log("Loaded listings data length:", data?.length);

    const rows = (data ?? []) as any[];
    const ids = rows.map((x) => x.id);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: photos } = await supabase
      .from("listing_photos")
      .select("listing_id,storage_path,sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true });

    const photoMap = new Map<string, string[]>();
    (photos ?? []).forEach((p: any) => {
      const list = photoMap.get(p.listing_id) ?? [];
      list.push(p.storage_path);
      photoMap.set(p.listing_id, list);
    });

    const toUrl = (path: string) =>
      supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;

    const enriched = rows.map((x) => ({
      ...x,
      aging_days: Math.floor((new Date().getTime() - new Date(x.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      _photoUrls: (photoMap.get(x.id) ?? []).map(toUrl),
    }));

    setItems(enriched as WorkListing[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId]);

  const counts = useMemo(() => {
    const inboxCount = items.filter((x) => x.inbox).length;
    const dueCount = items.filter((x) => !!x.next_follow_up && isDueTodayOrPast(x.next_follow_up)).length;
    return { inboxCount, dueCount };
  }, [items]);

  const filtered = useMemo(() => {
    const base = items.filter((x) => {
      const okView =
        viewTab === "all"
          ? true
          : viewTab === "inbox"
          ? x.inbox === true
          : !["Closed", "Inactive"].includes(x.status);

      const okType = typeTab === "all" ? true : x.type === typeTab;
      const okStatus = status === "all" ? true : x.status === status;

      const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

      const searchable = [
        x.condo_name,
        x.area,
        x.owner_whatsapp,
        x.raw_text,
        x.status,
        x.type,
        x.price,
        x.sqft,
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesSearch =
        terms.length === 0 || terms.every((term) => searchable.includes(term));

      // Price filter
      const okPrice =
        (priceMin === null || (x.price !== null && x.price >= priceMin)) &&
        (priceMax === null || (x.price !== null && x.price <= priceMax));

      // Bedroom filter
      const okBedroom =
        bedroomFilter.size === 0 ||
        (x.bedrooms !== null &&
          (bedroomFilter.has(x.bedrooms) ||
            (bedroomFilter.has(5) && x.bedrooms >= 5)));

      return okView && okType && okStatus && matchesSearch && okPrice && okBedroom;
    });

    const followUps = base.filter(x => x.status === "Follow-up");
    const rents = base.filter(x => x.type === "rent" && x.status !== "Follow-up");
    const sales = base.filter(x => x.type === "sale" && x.status !== "Follow-up");

    const sortByTime = (arr: WorkListing[]) => arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return [...sortByTime(followUps), ...sortByTime(rents), ...sortByTime(sales)];
  }, [items, viewTab, typeTab, status, search, priceMin, priceMax, bedroomFilter]);

  const markProcessed = async (id: string) => {
    setBusyId(id);

    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, inbox: false } : x)));

    const { error } = await supabase
      .from("listings")
      .update({
        inbox: false,
        last_update: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, inbox: true } : x)));
    } else {
      await load();
    }

    setBusyId(null);
  };

  const toggleAdvertised = async (id: string) => {
    setBusyId(id);

    const item = items.find(x => x.id === id);
    if (!item) return;

    const currentRemark = item.raw_text || "";
    const isAdvertised = currentRemark.includes("[ADVERTISED]");
    const newRemark = isAdvertised
      ? currentRemark.replace("[ADVERTISED]", "").trim()
      : `[ADVERTISED] ${currentRemark}`.trim();

    const { error } = await supabase
      .from("listings")
      .update({ raw_text: newRemark })
      .eq("id", id);

    if (error) {
      console.error("Toggle advertised error:", error);
    } else {
      setItems(prev => prev.map(x => x.id === id ? { ...x, raw_text: newRemark } : x));
    }

    setBusyId(null);
  };

  const hasActiveFilter = priceMin !== null || priceMax !== null || bedroomFilter.size > 0;
  const activeFilterCount = (priceMin !== null ? 1 : 0) + (priceMax !== null ? 1 : 0) + (bedroomFilter.size > 0 ? 1 : 0);

  const handleApplyFilters = () => {
    const min = priceMinInput.trim() ? parseInt(priceMinInput, 10) : null;
    const max = priceMaxInput.trim() ? parseInt(priceMaxInput, 10) : null;
    setPriceMin(Number.isNaN(min) ? null : min);
    setPriceMax(Number.isNaN(max) ? null : max);
    // bedroomFilter is already updated via toggle
    setFilterModalOpen(false);
  };

  const handleClearFilters = () => {
    setPriceMinInput("");
    setPriceMaxInput("");
    setPriceMin(null);
    setPriceMax(null);
    setBedroomFilter(new Set());
  };

  const toggleBedroom = (value: number) => {
    const newSet = new Set(bedroomFilter);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    setBedroomFilter(newSet);
  };

  const renderFilterModal = () => {
    if (!filterModalOpen) return null;

    return (
      <>
        {/* Modal backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setFilterModalOpen(false)}
        />

        {/* Modal */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl overflow-hidden
          bg-[#0a0e13]/95 border border-white/10
          flex flex-col max-h-[85vh]
          shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            {/* Header */}
            <div className="bg-[#0f1219]/80 text-white px-6 py-4 flex items-center justify-between border-b border-white/5">
              <h2 className="text-lg font-bold tracking-tight">Filters</h2>
              <button
                onClick={() => setFilterModalOpen(false)}
                className="text-zinc-500 hover:text-white transition duration-200"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="bg-[#0a0e13]/50 flex border-b border-white/5 px-2 py-2 gap-1">
              {(["price", "bedroom"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition duration-200 rounded-lg ${
                    filterTab === tab
                      ? "text-white bg-white/8 border-b-2 border-cyan-400/70"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab === "price" ? "Price" : "Bedroom"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-[#0a0e13] px-6 py-5">
              {filterTab === "price" && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        Minimum Price
                      </label>
                      <span className="text-xs text-zinc-500 font-medium">RM</span>
                    </div>
                    <input
                      type="number"
                      placeholder="0"
                      value={priceMinInput}
                      onChange={(e) => setPriceMinInput(e.target.value)}
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 outline-none transition"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        Maximum Price
                      </label>
                      <span className="text-xs text-zinc-500 font-medium">RM</span>
                    </div>
                    <input
                      type="number"
                      placeholder="999999"
                      value={priceMaxInput}
                      onChange={(e) => setPriceMaxInput(e.target.value)}
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 outline-none transition"
                    />
                  </div>
                </div>
              )}

              {filterTab === "bedroom" && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Studio", value: 0 },
                    { label: "1", value: 1 },
                    { label: "2", value: 2 },
                    { label: "3", value: 3 },
                    { label: "4", value: 4 },
                    { label: "5+", value: 5 },
                  ].map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => toggleBedroom(value)}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition duration-200 ${
                        bedroomFilter.has(value)
                          ? "bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
                          : "bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/8 hover:border-white/20"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-[#0f1219]/50 border-t border-white/5 px-6 py-4 flex gap-3">
              <button
                onClick={handleClearFilters}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-300 bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition duration-200"
              >
                Clear
              </button>
              <button
                onClick={handleApplyFilters}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-black bg-cyan-400 hover:bg-cyan-300 transition duration-200 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderCard = (x: WorkListing) => {
    const due = x.next_follow_up ? isDueTodayOrPast(x.next_follow_up) : false;
    const aging = x.aging_days ?? 0;
    const isAdvertised = (x.raw_text || "").includes("[ADVERTISED]");

    return (
      <div
        key={x.id}
        className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4
        hover:bg-white/10 transition
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
      >
        <a href={`/listings/${x.id}`} className="block">
          <PhotoCarousel urls={(x as any)._photoUrls ?? []} />

          <div className="mt-3 text-lg font-semibold line-clamp-1">{x.condo_name}</div>
          <div className="mt-1 text-sm text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

          {x.furnish ? (
            <div className="mt-2">
              <span className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                {x.furnish}
              </span>
            </div>
          ) : null}

          <div className="mt-3 text-base font-semibold text-white">
            {x.price != null ? rm(x.price) : "—"}
            <span className="ml-2 text-xs font-normal text-zinc-400">
              {x.type === "rent" ? "/ mo" : ""}
            </span>
          </div>

          <div className="mt-1 text-sm text-zinc-300">
            {x.sqft ? `${x.sqft} sqft` : "—"} • {x.bedrooms ?? "—"}R • {x.bathrooms ?? "—"}B •{" "}
            {x.carparks ?? "—"}CP
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold
              shadow-[0_0_12px_rgba(34,211,238,0.25)]
              ${statusPillClass(x.status)}`}
            >
              {x.type.toUpperCase()} • {x.status}
            </span>

            <span
              className="rounded-md px-2 py-1 text-xs font-semibold
              bg-white/5 text-cyan-200 border border-cyan-400/30
              shadow-[0_0_10px_rgba(34,211,238,0.25)]"
            >
              P{x.priority ?? 2}
            </span>

            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                aging >= 7
                  ? "bg-red-900/40 text-red-200 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                  : "bg-zinc-900 text-zinc-200 border border-white/10"
              }`}
            >
              Aging {aging}d
            </span>

            {x.next_follow_up ? (
              <span
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  due
                    ? "bg-amber-900/40 text-amber-200 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
                    : "bg-zinc-900 text-zinc-200 border border-white/10"
                }`}
              >
                FU {formatDateOnly(x.next_follow_up)}
              </span>
            ) : null}

            {isAdvertised && (
              <span className="rounded-md px-2 py-1 text-xs font-semibold bg-green-900/40 text-green-200 border border-green-400/40">
                Advertised
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>Last update: {formatDT(x.last_update)}</span>
            <span>{new Date(x.updated_at).toLocaleString()}</span>
          </div>
        </a>

        {x.inbox ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markProcessed(x.id);
              }}
              disabled={busyId === x.id}
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-black
              bg-cyan-400 hover:bg-cyan-300
              shadow-[0_0_20px_rgba(34,211,238,0.55)]
              transition-all duration-150
              active:scale-[0.96]
              disabled:opacity-40 disabled:shadow-none"
            >
              {busyId === x.id ? "Processing…" : "Mark as processed"}
            </button>

            <a
              href={`/listings/${x.id}`}
              className="rounded-lg px-3 py-2 text-sm font-medium
              bg-white/5 text-white border border-white/10
              hover:bg-white/10 hover:border-cyan-400/40
              hover:shadow-[0_0_12px_rgba(34,211,238,0.25)]
              transition-all"
            >
              Open
            </a>
          </div>
        ) : (
          <div className="mt-4">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleAdvertised(x.id);
              }}
              disabled={busyId === x.id}
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.96] disabled:opacity-40 ${
                isAdvertised
                  ? "bg-green-600 text-white hover:bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.55)]"
                  : "bg-zinc-600 text-white hover:bg-zinc-500"
              }`}
            >
              {busyId === x.id ? "Updating…" : isAdvertised ? "Unmark Advertised" : "Mark Advertised"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main
      className="min-h-screen w-full text-white"
      style={{
        background: "radial-gradient(circle at 18% 10%, rgba(34, 211, 238, 0.055), transparent 24%), radial-gradient(circle at 34% 38%, rgba(20, 83, 95, 0.04), transparent 28%), linear-gradient(90deg, #05090B 0%, #050607 52%, #040404 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Listings ({filtered.length})</div>
            <div className="text-sm text-zinc-400">Your work queue (not just a list).</div>
          </div>

          <a
            href="/listings/new"
            className="rounded-lg bg-cyan-400 border border-cyan-300 px-4 py-2 text-sm text-black font-semibold hover:bg-cyan-300 hover:border-cyan-200 shadow-[0_10px_30px_rgba(34,211,238,0.35)] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)] transition-all duration-150"
          >
            + New
          </a>
        </div>

        <div className="sticky top-[var(--topnav-offset,0px)] z-30 -mx-4 mt-5 border-y border-white/10 bg-[#05090B]/90 px-4 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-[top] duration-300">
          <div className="group relative">
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-white/70 bg-white/95 text-zinc-950 shadow-sm transition group-hover:bg-zinc-200">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search condo name, area, WhatsApp, remark..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-14 pr-28 text-sm text-white placeholder-zinc-400 outline-none backdrop-blur transition hover:border-white/20 hover:bg-zinc-900/80 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/25"
          />
          <button
            type="button"
            aria-label="Open filters"
            onClick={() => setFilterModalOpen(true)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              hasActiveFilter
                ? "border border-cyan-300/60 bg-cyan-400/25 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.32)]"
                : "border border-cyan-300/35 bg-cyan-400/14 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.18)] hover:bg-cyan-400/22"
            }`}
          >
            Filter{hasActiveFilter ? ` ${activeFilterCount}` : ""}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/5 border border-white/10 backdrop-blur p-1
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            {(
              [
                { key: "inbox", label: `Inbox (${counts.inboxCount})` },
                { key: "active", label: `Active` },
                { key: "all", label: `All` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setViewTab(t.key)}
                className={`rounded-md px-3 py-1 text-sm transition-all duration-200 ${
                  viewTab === t.key
                    ? "bg-cyan-400 text-black font-semibold shadow-[0_10px_30px_rgba(34,211,238,0.25)]"
                    : "text-zinc-300 hover:text-black hover:bg-cyan-300/80"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg bg-white/5 border border-white/10 backdrop-blur p-1
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            {(["all", "rent", "sale"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeTab(t)}
                className={`rounded-md px-3 py-1 text-sm transition-all duration-200 ${
                  typeTab === t ? "bg-cyan-400 text-black font-semibold shadow-[0_10px_30px_rgba(34,211,238,0.25)]"
                    : "text-zinc-300 hover:text-black hover:bg-cyan-300/80"
                }`}
              >
                {t === "all" ? "All" : t === "rent" ? "Rent" : "Sale"}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setStatusOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg bg-white/5 border border-cyan-400/30 backdrop-blur px-3 py-2 text-sm text-cyan-200
              shadow-[0_0_18px_rgba(34,211,238,0.25)]
              hover:bg-white/10 transition"
            >
              <span>{status === "all" ? "All status" : status}</span>
              <span className="text-xs opacity-70">▾</span>
            </button>

            {statusOpen && (
              <div className="absolute z-50 mt-2 min-w-[160px] rounded-xl bg-[#050B14] border border-cyan-400/30 backdrop-blur
              shadow-[0_0_30px_rgba(34,211,238,0.35)] overflow-hidden">
                <div
                  onClick={() => {
                    setStatus("all" as any);
                    setStatusOpen(false);
                  }}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-cyan-400/20"
                >
                  All status
                </div>

                {STATUS_OPTIONS.map((s) => (
                  <div
                    key={s}
                    onClick={() => {
                      setStatus(s as any);
                      setStatusOpen(false);
                    }}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-cyan-400/20"
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={load}
            className="rounded-lg bg-white/5 border border-white/10 backdrop-blur px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800
            shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
          >
            Refresh
          </button>

          {counts.dueCount > 0 ? (
            <div className="rounded-lg bg-amber-900/30 px-3 py-2 text-xs text-amber-200 sm:ml-auto">
              {counts.dueCount} follow-up due
            </div>
          ) : (
            <div className="text-xs text-zinc-500 sm:ml-auto">—</div>
          )}
        </div>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-6 text-sm text-zinc-300
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            No listings here. Try switch view/status filters, or click{" "}
            <span className="font-semibold text-white">+ New</span>.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {(() => {
              const followUps = filtered.filter(x => x.status === "Follow-up");
              if (followUps.length === 0) return null;
              return (
                <div className="space-y-4">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div
                    className="mb-4 inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-lg font-semibold backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.24)]"
                    style={{ color: '#22D3EE', textShadow: '0 0 14px rgba(34,211,238,0.8)' }}
                  >
                    Follow-up ({followUps.length})
                  </div>
                    <button
                      type="button"
                      onClick={() => rentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="inline-flex items-center gap-1 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.055] px-3 py-2 text-sm font-semibold text-emerald-300 backdrop-blur-xl shadow-[0_0_14px_rgba(103,232,249,0.10)] transition hover:border-cyan-200/25 hover:bg-cyan-200/[0.08] hover:shadow-[0_0_18px_rgba(103,232,249,0.16)]"
                    >
                      Rent <span aria-hidden="true">&darr;</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {followUps.map((x) => renderCard(x))}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const rents = filtered.filter(x => x.type === "rent" && x.status !== "Follow-up");
              if (rents.length === 0) return null;
              return (
                <div ref={rentSectionRef} className="space-y-4 scroll-mt-28">
                  <div
                    className="mb-4 inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-lg font-semibold backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.24)]"
                    style={{ color: '#22C55E', textShadow: '0 0 14px rgba(34,197,94,0.8)' }}
                  >
                    Rent ({rents.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {rents.map((x) => renderCard(x))}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const sales = filtered.filter(x => x.type === "sale" && x.status !== "Follow-up");
              if (sales.length === 0) return null;
              return (
                <div className="space-y-4">
                  <div
                    className="mb-4 inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-lg font-semibold backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.24)]"
                    style={{ color: '#FFD36A', textShadow: '0 0 14px rgba(255,211,106,0.8)' }}
                  >
                    Sale ({sales.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sales.map((x) => renderCard(x))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {renderFilterModal()}
    </main>
  );
}