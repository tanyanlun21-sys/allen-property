"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";
import { availabilityLabel } from "@/lib/availability";

type ListingType = "rent" | "sale";
type TypeFilter = "all" | "rent" | "sale";

type ListingStatus =
  | "New"
  | "Available"
  | "Follow-up"
  | "Viewing"
  | "Negotiating"
  | "Booked"
  | "Closed"
  | "Inactive"
  // 兼容你旧的 status
  | "available"
  | "pending"
  | "booked"
  | "closed"
  | "inactive";

type ListingRow = {
  id: string;
  user_id?: string;
  type: ListingType;
  status: ListingStatus;
  condo_name: string;
  area: string | null;
  price: number | null;

  sqft: number | null;
  bedrooms: string | number | null;
  bathrooms: number | null;
  carparks: number | null;

  furnish?: "Fully" | "Partial" | null;

  inbox?: boolean | null;
  last_update?: string | null; // timestamp/string
  last_contact?: string | null;
  next_follow_up?: string | null; // date or timestamp
  available_from?: string | null;
  owner_whatsapp?: string | null;
  raw_text?: string | null;
  priority?: number | null;

  updated_at: string;
};

type DealRow = {
  listing_id: string;
  gross: number | null;
  commission_rate: number | null;
  deductions: number | null;
  updated_at: string;
};

const AREA_ORDER_STORAGE_KEY = "dashboardAreaOrder";

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clampPercent(v: any) {
  const n = safeNum(v);
  return Math.max(0, Math.min(100, n));
}
function commissionAmount(gross: any, rate: any) {
  return (safeNum(gross) * clampPercent(rate)) / 100;
}
function netAmount(gross: any, rate: any, deductions: any) {
  return Math.max(0, commissionAmount(gross, rate) - safeNum(deductions));
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfTodayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
function parseDateAny(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
function daysBetween(from: Date, to: Date) {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
function isActiveListing(x: ListingRow) {
  const status = String(x.status).toLowerCase();
  return status !== "inactive" && status !== "closed";
}
function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthStartISO(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
}
function nextMonthStartISO(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 1, 0, 0, 0, 0).toISOString();
}
function listingRemark(value?: string | null) {
  return (value ?? "").replace(/\[ADVERTISED\]/gi, "").trim();
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [areaOrder, setAreaOrder] = useState<string[]>([]);
  const [draggedArea, setDraggedArea] = useState<string | null>(null);
  const [areaSearch, setAreaSearch] = useState("");

  // pipeline month selector（默认本月）
  const [month, setMonth] = useState(() => monthKey(new Date()));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });

    const savedAreaOrder = window.localStorage.getItem(AREA_ORDER_STORAGE_KEY);
    if (savedAreaOrder) {
      try {
        const parsed = JSON.parse(savedAreaOrder);
        if (Array.isArray(parsed)) {
          setAreaOrder(parsed.filter((x) => typeof x === "string"));
        }
      } catch {
        window.localStorage.removeItem(AREA_ORDER_STORAGE_KEY);
      }
    }
  }, []);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);

    try {
      // ✅ 拉 listings（Today HQ 主要靠它）
      // 注意：如果你表里没有某些字段，Supabase 会直接报错；
      // 你已经加过字段的话，这份 select 就 OK
      const { data: ls, error: lsErr } = await supabase
        .from("listings")
        .select(
          "id,user_id,type,status,condo_name,area,price,sqft,bedrooms,bathrooms,carparks,furnish,inbox,last_update,last_contact,next_follow_up,available_from,owner_whatsapp,raw_text,priority,updated_at"
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (lsErr) throw new Error(lsErr.message);

      // ✅ deals：用于 Pipeline（按月算 net）
      const fromISO = monthStartISO(month);
      const toISO = nextMonthStartISO(month);

      const { data: ds, error: dErr } = await supabase
        .from("deals")
        .select("listing_id,gross,commission_rate,deductions,updated_at")
        .eq("user_id", userId)
        .gte("updated_at", fromISO)
        .lt("updated_at", toISO)
        .order("updated_at", { ascending: false });

      if (dErr) throw new Error(dErr.message);

      setListings((ls ?? []) as any);
      setDeals((ds ?? []) as any);
    } catch (e: any) {
      setErr(e?.message ?? "Load failed");
      setListings([]);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month]);

  const filteredListings = useMemo(() => {
    if (typeFilter === "all") return listings;
    return listings.filter((x) => x.type === typeFilter);
  }, [listings, typeFilter]);

  const activeFilteredListings = useMemo(() => {
    return filteredListings.filter(isActiveListing);
  }, [filteredListings]);

  // ===== Today HQ logic =====
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const todayStart = useMemo(() => startOfTodayISO(), []);
  const todayEnd = useMemo(() => endOfTodayISO(), []);

  const inboxList = useMemo(() => {
    return filteredListings
      .filter((x) => !!x.inbox)
      .sort((a, b) => (safeNum(b.priority) - safeNum(a.priority)) || (b.updated_at.localeCompare(a.updated_at)));
  }, [filteredListings]);

  const upcomingAvailable = useMemo(() => {
    const today = parseDateAny(todayISO);
    if (!today) return [];

    return activeFilteredListings
      .filter((x) => {
        const avail = parseDateAny(x.available_from ?? null);
        return avail ? avail.getTime() > today.getTime() : false;
      })
      .sort((a, b) => {
        const da = parseDateAny(a.available_from ?? null)?.getTime() ?? Infinity;
        const db = parseDateAny(b.available_from ?? null)?.getTime() ?? Infinity;
        return da - db;
      });
  }, [activeFilteredListings, todayISO]);

  const availableSoonWithin30 = useMemo(() => {
    const today = parseDateAny(todayISO);
    if (!today) return [];
    return upcomingAvailable.filter((x) => {
      const avail = parseDateAny(x.available_from ?? null);
      return avail ? daysBetween(today, avail) <= 30 : false;
    });
  }, [upcomingAvailable, todayISO]);

  const availableSoonAfter30 = useMemo(() => {
    const today = parseDateAny(todayISO);
    if (!today) return [];
    return upcomingAvailable.filter((x) => {
      const avail = parseDateAny(x.available_from ?? null);
      return avail ? daysBetween(today, avail) > 30 : false;
    });
  }, [upcomingAvailable, todayISO]);

  const followUpOver15List = useMemo(() => {
    // Active units that have not been touched for 15+ days.
    const now = new Date();
    const withAging = activeFilteredListings.map((x) => {
      const lu = parseDateAny(x.last_update ?? null) ?? parseDateAny(x.updated_at)!;
      const aging = daysBetween(lu, now);
      return { x, aging };
    });

    return withAging
      .filter(({ aging }) => aging >= 15)
      .sort((a, b) => b.aging - a.aging)
      .slice(0, 20);
  }, [activeFilteredListings]);

  const todayActionIds = useMemo(() => {
    return new Set([...availableSoonWithin30.map((x) => x.id), ...followUpOver15List.map(({ x }) => x.id)]);
  }, [availableSoonWithin30, followUpOver15List]);

  const areaSummary = useMemo(() => {
    const counts = new Map<string, number>();
    activeFilteredListings.forEach((x) => {
      const area = (x.area || "No area").trim() || "No area";
      counts.set(area, (counts.get(area) ?? 0) + 1);
    });

    const defaultSorted = Array.from(counts.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));

    if (areaOrder.length === 0) return defaultSorted;

    const orderMap = new Map(areaOrder.map((area, index) => [area, index]));
    return [...defaultSorted].sort((a, b) => {
      const ai = orderMap.get(a.area);
      const bi = orderMap.get(b.area);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return (
        defaultSorted.findIndex((item) => item.area === a.area) -
        defaultSorted.findIndex((item) => item.area === b.area)
      );
    });
  }, [activeFilteredListings, areaOrder]);

  const filteredAreaSummary = useMemo(() => {
    const query = areaSearch.trim().toLowerCase();
    return query
      ? areaSummary.filter(({ area }) => area.toLowerCase().includes(query))
      : areaSummary;
  }, [areaSummary, areaSearch]);

  const moveArea = (fromArea: string, toArea: string) => {
    if (fromArea === toArea) return;

    const currentAreas = areaSummary.map((item) => item.area);
    const orderedAreas = [
      ...areaOrder.filter((area) => currentAreas.includes(area)),
      ...currentAreas.filter((area) => !areaOrder.includes(area)),
    ];

    const fromIndex = orderedAreas.indexOf(fromArea);
    const toIndex = orderedAreas.indexOf(toArea);
    if (fromIndex === -1 || toIndex === -1) return;

    const nextOrder = [...orderedAreas];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);

    setAreaOrder(nextOrder);
    window.localStorage.setItem(AREA_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
  };

  const todayTouched = useMemo(() => {
    // 今天有动作：last_update 在今天
    return activeFilteredListings.filter((x) => {
      const lu = parseDateAny(x.last_update ?? null);
      if (!lu) return false;
      const iso = lu.toISOString();
      return iso >= todayStart && iso <= todayEnd;
    }).length;
  }, [activeFilteredListings, todayStart, todayEnd]);

  // ===== Pipeline =====
  const monthNet = useMemo(() => {
    return deals.reduce((sum, d) => sum + netAmount(d.gross, d.commission_rate, d.deductions), 0);
  }, [deals]);

  const monthDealsCount = deals.length;

  // ===== Quick actions =====
  const markProcessed = async (listingId: string) => {
    if (!userId) return;
    setErr(null);
    // 仅把 inbox=false + last_update=now
    const { error } = await supabase
      .from("listings")
      .update({ inbox: false, last_update: new Date().toISOString() })
      .eq("id", listingId)
      .eq("user_id", userId);

    if (error) return setErr(error.message);
    await load();
  };

  return (
    <main
      className="min-h-screen w-full text-white"
      style={{
        background: "radial-gradient(circle at 18% 10%, rgba(34, 211, 238, 0.055), transparent 24%), radial-gradient(circle at 34% 38%, rgba(20, 83, 95, 0.04), transparent 28%), linear-gradient(90deg, #05090B 0%, #050607 52%, #040404 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Today HQ</div>
            <div className="text-sm text-zinc-400">Open → do → close. 让系统告诉你今天该干嘛。</div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/listings"
              className="rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800
              shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            >
              ← Listings
            </Link>

            <button
              type="button"
              onClick={load}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4 inline-flex items-center gap-3
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-sm text-zinc-300">Type</div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All</option>
              <option value="rent">Rent</option>
              <option value="sale">Sale</option>
            </select>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4 inline-flex items-center gap-3
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-sm text-zinc-300">Pipeline month</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {areaSummary.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <div className="text-sm font-semibold text-zinc-200">Active listings by area</div>
                <input
                  type="search"
                  value={areaSearch}
                  onChange={(e) => setAreaSearch(e.target.value)}
                  placeholder="Search area..."
                  aria-label="Search active listings by area"
                  className="w-full max-w-xs rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-400/50"
                />
              </div>
              <div className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-1 text-xs font-semibold text-zinc-300">
                Total{" "}
                <span className="text-base font-bold text-yellow-200 tabular-nums drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]">
                  {filteredAreaSummary.reduce((sum, item) => sum + item.count, 0)}
                </span>{" "}
                Units
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredAreaSummary.map(({ area, count }) => (
                <div
                  key={area}
                  draggable
                  onDragStart={(e) => {
                    setDraggedArea(area);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", area);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromArea = draggedArea ?? e.dataTransfer.getData("text/plain");
                    if (fromArea) moveArea(fromArea, area);
                    setDraggedArea(null);
                  }}
                  onDragEnd={() => setDraggedArea(null)}
                  className={`group grid cursor-move grid-cols-[minmax(0,1fr)_1px_112px] items-center rounded-lg border px-4 py-3 text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/10 hover:text-cyan-100 ${
                    draggedArea === area
                      ? "border-cyan-300/70 bg-cyan-400/15"
                      : "border-white/10 bg-zinc-950/70"
                  }`}
                >
                  <Link
                    href={`/listings?search=${encodeURIComponent(area)}`}
                    onClick={() => window.sessionStorage.setItem("listingsSearch", area)}
                    className="truncate font-semibold hover:text-cyan-100"
                  >
                    {area}
                  </Link>
                  <span className="h-5 w-px bg-white/20 group-hover:bg-cyan-300/45" />
                  <span className="justify-self-end whitespace-nowrap text-sm font-semibold text-zinc-400 group-hover:text-cyan-100">
                    <span className="text-lg font-bold text-yellow-200 tabular-nums drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]">
                      {count}
                    </span>{" "}
                    Unit{count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
              {filteredAreaSummary.length === 0 && (
                <div className="text-sm text-zinc-400">No matching areas.</div>
              )}
            </div>
          </div>
        )}

        {/* Top KPI row */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Today actions</div>
            <div className="mt-2 text-3xl font-semibold">{todayActionIds.size}</div>
            <div className="mt-2 text-xs text-zinc-500">Available soon + 15d follow-ups</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Available soon</div>
            <div className="mt-2 text-3xl font-semibold">{upcomingAvailable.length}</div>
            <div className="mt-2 text-xs text-zinc-500">{availableSoonWithin30.length} within 30 days</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Follow Up (Over 15+ days)</div>
            <div className="mt-2 text-3xl font-semibold">{followUpOver15List.length}</div>
            <div className="mt-2 text-xs text-zinc-500">Active units need follow-up</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">This month net</div>
            <div className="mt-2 text-3xl font-semibold">{rm(monthNet)}</div>
            <div className="mt-2 text-xs text-zinc-400">Deals: {monthDealsCount}</div>
          </div>
        </div>

        {/* Main blocks */}
        <div className="mt-6">
          {/* Today actions */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">🔥 Today actions</div>
                <div className="text-sm text-zinc-400">30 天内 Available Soon + 15 天以上未跟进</div>
              </div>
              <div className="text-xs text-zinc-500">Touched today: {todayTouched}</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : todayActionIds.size === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">今天没有需要 follow-up 的 active unit。</div>
            ) : (
              <div className="mt-4 space-y-4">
                {availableSoonWithin30.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                      Available Soon within 30 days
                    </div>
                    {availableSoonWithin30.slice(0, 6).map((x) => {
                      return (
                        <div key={`soon-${x.id}`} className="rounded-xl bg-zinc-950 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold line-clamp-1">{x.condo_name}</div>
                              <div className="text-xs text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>
                              <div className="mt-2 text-xs text-cyan-100">
                                Available: {availabilityLabel(x.available_from)}
                              </div>
                              {listingRemark(x.raw_text) && (
                                <div className="mt-2 whitespace-pre-line text-xs text-zinc-300">
                                  <span className="text-zinc-500">Remark: </span>{listingRemark(x.raw_text)}
                                </div>
                              )}
                              {x.owner_whatsapp && (
                                <div className="mt-1 text-xs text-zinc-300">
                                  <span className="text-zinc-500">Owner: </span>{x.owner_whatsapp}
                                </div>
                              )}
                            </div>
                            <a
                              href={`/listings/${x.id}`}
                              className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {followUpOver15List.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                      Follow Up Over 15 days
                    </div>
                    {followUpOver15List.slice(0, 6).map(({ x, aging }) => (
                      <div key={`old-${x.id}`} className="rounded-xl bg-zinc-950 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold line-clamp-1">{x.condo_name}</div>
                            <div className="text-xs text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-yellow-200">
                                {aging} days
                              </span>
                            </div>
                            {listingRemark(x.raw_text) && (
                              <div className="mt-2 whitespace-pre-line text-xs text-zinc-300">
                                <span className="text-zinc-500">Remark: </span>{listingRemark(x.raw_text)}
                              </div>
                            )}
                            {x.owner_whatsapp && (
                              <div className="mt-1 text-xs text-zinc-300">
                                <span className="text-zinc-500">Owner: </span>{x.owner_whatsapp}
                              </div>
                            )}
                          </div>
                          <a
                            href={`/listings/${x.id}`}
                            className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
                          >
                            Open
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Available Soon */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div>
              <div className="text-base font-semibold">Available Soon</div>
              <div className="text-sm text-zinc-400">30 天内在上面，超过 30 天隔开在下面</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : upcomingAvailable.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">No upcoming available units.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {availableSoonWithin30.slice(0, 10).map((x) => {
                  return (
                    <div key={x.id} className="rounded-xl bg-zinc-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold line-clamp-1">{x.condo_name}</div>
                          <div className="text-xs text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

                          <div className="mt-2 text-xs text-cyan-100">
                            Available: {availabilityLabel(x.available_from)}
                          </div>
                          {listingRemark(x.raw_text) && (
                            <div className="mt-2 whitespace-pre-line text-xs text-zinc-300">
                              <span className="text-zinc-500">Remark: </span>{listingRemark(x.raw_text)}
                            </div>
                          )}
                          {x.owner_whatsapp && (
                            <div className="mt-1 text-xs text-zinc-300">
                              <span className="text-zinc-500">Owner: </span>{x.owner_whatsapp}
                            </div>
                          )}
                        </div>

                        <a
                          href={`/listings/${x.id}`}
                          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 text-center"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })}

                {availableSoonAfter30.length > 0 && (
                  <div className="flex items-center gap-3 py-1 text-xs text-zinc-500">
                    <span className="h-px flex-1 border-t border-dashed border-zinc-700" />
                    <span>Over 30 days</span>
                    <span className="h-px flex-1 border-t border-dashed border-zinc-700" />
                  </div>
                )}

                {availableSoonAfter30.slice(0, 10).map((x) => {
                  return (
                    <div key={x.id} className="rounded-xl bg-zinc-950 p-4 opacity-80">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold line-clamp-1">{x.condo_name}</div>
                          <div className="text-xs text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

                          <div className="mt-2 text-xs text-cyan-100">
                            Available: {availabilityLabel(x.available_from)}
                          </div>
                          {listingRemark(x.raw_text) && (
                            <div className="mt-2 whitespace-pre-line text-xs text-zinc-300">
                              <span className="text-zinc-500">Remark: </span>{listingRemark(x.raw_text)}
                            </div>
                          )}
                          {x.owner_whatsapp && (
                            <div className="mt-1 text-xs text-zinc-300">
                              <span className="text-zinc-500">Owner: </span>{x.owner_whatsapp}
                            </div>
                          )}
                        </div>

                        <a
                          href={`/listings/${x.id}`}
                          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 text-center"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aging */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div>
              <div className="text-base font-semibold">❗ Follow Up Over 15days</div>
              <div className="text-sm text-zinc-400">Active unit 收了超过 15 天：需要再 follow up</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : followUpOver15List.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">没有超过 15 天未跟进的 active unit。</div>
            ) : (
              <div className="mt-4 space-y-3">
                {followUpOver15List.map(({ x, aging }) => (
                  <div key={x.id} className="rounded-xl bg-zinc-950 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold line-clamp-1">{x.condo_name}</div>
                        <div className="text-xs text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200">
                            {x.type.toUpperCase()}
                          </span>
                          <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200">
                            {String(x.status)}
                          </span>
                          <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-yellow-200">
                            {aging} days
                          </span>
                        </div>
                      </div>

                      <a
                        href={`/listings/${x.id}`}
                        className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline mini table */}
        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 overflow-x-auto
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">💰 Pipeline</div>
              <div className="text-sm text-zinc-400">本月成交净收入（net = commission - deductions）</div>
            </div>

            <a
              href="/income"
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              Open income →
            </a>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-400">Loading…</div>
          ) : deals.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-300">本月还没有 deal。</div>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-zinc-400">
                <tr className="text-left">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Listing</th>
                  <th className="py-2 pr-4">Gross</th>
                  <th className="py-2 pr-4">%</th>
                  <th className="py-2 pr-4">Comm</th>
                  <th className="py-2 pr-4">Deduct</th>
                  <th className="py-2 pr-0">Net</th>
                </tr>
              </thead>
              <tbody>
                {deals.slice(0, 10).map((d) => {
                  const comm = commissionAmount(d.gross, d.commission_rate);
                  const net = netAmount(d.gross, d.commission_rate, d.deductions);
                  const listing = listings.find((x) => x.id === d.listing_id);
                  return (
                    <tr key={d.listing_id + d.updated_at} className="border-t border-zinc-800">
                      <td className="py-3 pr-4 text-zinc-400">
                        {new Date(d.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        {listing ? listing.condo_name : d.listing_id}
                      </td>
                      <td className="py-3 pr-4">{rm(safeNum(d.gross))}</td>
                      <td className="py-3 pr-4">{clampPercent(d.commission_rate)}%</td>
                      <td className="py-3 pr-4">{rm(comm)}</td>
                      <td className="py-3 pr-4">{rm(safeNum(d.deductions))}</td>
                      <td className="py-3 pr-0 font-semibold">{rm(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
