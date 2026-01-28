"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

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
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;

  furnish?: "Fully" | "Partial" | null;

  inbox?: boolean | null;
  last_update?: string | null; // timestamp/string
  last_contact?: string | null;
  next_follow_up?: string | null; // date or timestamp
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

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);

  // pipeline month selector（默认本月）
  const [month, setMonth] = useState(() => monthKey(new Date()));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
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
          "id,user_id,type,status,condo_name,area,price,sqft,bedrooms,bathrooms,carparks,furnish,inbox,last_update,last_contact,next_follow_up,priority,updated_at"
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

  // ===== Today HQ logic =====
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const todayStart = useMemo(() => startOfTodayISO(), []);
  const todayEnd = useMemo(() => endOfTodayISO(), []);

  const inboxList = useMemo(() => {
    return filteredListings
      .filter((x) => !!x.inbox)
      .sort((a, b) => (safeNum(b.priority) - safeNum(a.priority)) || (b.updated_at.localeCompare(a.updated_at)));
  }, [filteredListings]);

  const followUpsDue = useMemo(() => {
    // next_follow_up <= today (到期/逾期)
    const today = parseDateAny(todayISO)!;
    return filteredListings
      .filter((x) => {
        const nf = parseDateAny(x.next_follow_up ?? null);
        if (!nf) return false;
        return nf.getTime() <= today.getTime();
      })
      .sort((a, b) => {
        const da = parseDateAny(a.next_follow_up ?? null)?.getTime() ?? 0;
        const db = parseDateAny(b.next_follow_up ?? null)?.getTime() ?? 0;
        // 越早越前（逾期的最前）
        return da - db;
      });
  }, [filteredListings, todayISO]);

  const agingList = useMemo(() => {
    // 冷房源：last_update 或 updated_at 距今 >= 7 天
    const now = new Date();
    const withAging = filteredListings.map((x) => {
      const lu = parseDateAny(x.last_update ?? null) ?? parseDateAny(x.updated_at)!;
      const aging = daysBetween(lu, now);
      return { x, aging };
    });

    return withAging
      .filter(({ aging }) => aging >= 7)
      .sort((a, b) => b.aging - a.aging)
      .slice(0, 20);
  }, [filteredListings]);

  const todayTouched = useMemo(() => {
    // 今天有动作：last_update 在今天
    return filteredListings.filter((x) => {
      const lu = parseDateAny(x.last_update ?? null);
      if (!lu) return false;
      const iso = lu.toISOString();
      return iso >= todayStart && iso <= todayEnd;
    }).length;
  }, [filteredListings, todayStart, todayEnd]);

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

  const clearFollowUp = async (listingId: string) => {
    if (!userId) return;
    setErr(null);
    const { error } = await supabase
      .from("listings")
      .update({ next_follow_up: null, last_update: new Date().toISOString() })
      .eq("id", listingId)
      .eq("user_id", userId);

    if (error) return setErr(error.message);
    await load();
  };

  return (
    <main
  className="min-h-screen text-white bg-[#06070A]
  bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(600px_circle_at_80%_30%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(900px_circle_at_50%_90%,rgba(168,85,247,0.08),transparent_45%)]"
>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Today HQ</div>
            <div className="text-sm text-zinc-400">Open → do → close. 让系统告诉你今天该干嘛。</div>
          </div>

          <div className="flex gap-2">
            <a
              href="/listings"
              className="rounded-lg bg-white/5 border border-white/10 backdrop-blur px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800
              shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]"
            >
              ← Listings
            </a>

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

        {/* Top KPI row */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Today actions</div>
            <div className="mt-2 text-3xl font-semibold">{followUpsDue.length}</div>
            <div className="mt-2 text-xs text-zinc-500">Due / overdue follow-ups</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Inbox</div>
            <div className="mt-2 text-3xl font-semibold">{inboxList.length}</div>
            <div className="mt-2 text-xs text-zinc-500">Need processing</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">Aging (7+ days)</div>
            <div className="mt-2 text-3xl font-semibold">{agingList.length}</div>
            <div className="mt-2 text-xs text-zinc-500">Cold listings</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">This month net</div>
            <div className="mt-2 text-3xl font-semibold">{rm(monthNet)}</div>
            <div className="mt-2 text-xs text-zinc-400">Deals: {monthDealsCount}</div>
          </div>
        </div>

        {/* Main blocks */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Today actions */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">🔥 Today actions</div>
                <div className="text-sm text-zinc-400">到期/逾期 follow-up（先做这些）</div>
              </div>
              <div className="text-xs text-zinc-500">Touched today: {todayTouched}</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : followUpsDue.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">今天没有到期 follow-up。✅</div>
            ) : (
              <div className="mt-4 space-y-3">
                {followUpsDue.slice(0, 10).map((x) => {
                  const nf = parseDateAny(x.next_follow_up ?? null);
                  const dueText = nf ? toISODate(nf) : "—";
                  const overdueDays = nf ? daysBetween(nf, new Date()) : 0;

                  return (
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
                            <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200">
                              Follow-up: {dueText}
                            </span>

                            {overdueDays > 0 && (
                              <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-red-300">
                                Overdue {overdueDays}d
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
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
                          <button
                            type="button"
                            onClick={() => clearFollowUp(x.id)}
                            className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inbox */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div>
              <div className="text-base font-semibold">🆕 Inbox</div>
              <div className="text-sm text-zinc-400">新房源先收进来，之后再整理</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : inboxList.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">Inbox 为空。✅</div>
            ) : (
              <div className="mt-4 space-y-3">
                {inboxList.slice(0, 10).map((x) => (
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
                            P{safeNum(x.priority) || 0}
                          </span>
                          {x.furnish ? (
                            <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200">
                              {x.furnish}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 text-sm text-white">
                          {x.price != null ? rm(x.price) : "—"}
                          <span className="ml-2 text-xs text-zinc-500">
                            {x.type === "rent" ? "/ mo" : ""}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <a
                          href={`/listings/${x.id}`}
                          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 text-center"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => markProcessed(x.id)}
                          className="rounded-lg px-4 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_10px_30px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.96] hover:shadow-[0_0_25px_rgba(34,211,238,0.8)]"
                        >
                          Mark processed
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aging */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div>
              <div className="text-base font-semibold">❗ Aging / Cold</div>
              <div className="text-sm text-zinc-400">7 天以上没动：该重新跟进/换打法</div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-400">Loading…</div>
            ) : agingList.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-300">没有冷房源。✅</div>
            ) : (
              <div className="mt-4 space-y-3">
                {agingList.map(({ x, aging }) => (
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