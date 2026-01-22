"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";
type TypeFilter = "all" | "rent" | "sale";

type DealRow = {
  listing_id: string;
  gross: number | null;
  commission_rate: number | null;
  deductions: number | null;
  updated_at: string;
};

type ListingRow = {
  id: string;
  type: ListingType;
  condo_name: string;
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
  // ✅ 正确：commission - deductions
  return Math.max(0, commissionAmount(gross, rate) - safeNum(deductions));
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

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 月份区间（你要的 from~to）
  const [fromMonth, setFromMonth] = useState(() => monthKey(new Date()));
  const [toMonth, setToMonth] = useState(() => monthKey(new Date()));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [allDeals, setAllDeals] = useState<DealRow[]>([]);
  const [listingMap, setListingMap] = useState<Map<string, ListingRow>>(new Map());

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

    // ✅ 取全量 deals（dashboard 统一靠这份数据算，避免 monthDeals 清零不同步）
    const { data: ad, error: adErr } = await supabase
      .from("deals")
      .select("listing_id,gross,commission_rate,deductions,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (adErr) {
      setErr(adErr.message);
      setAllDeals([]);
      setListingMap(new Map());
      setLoading(false);
      return;
    }

    const allRows = (ad ?? []) as DealRow[];
    setAllDeals(allRows);

    // ✅ 拉 listing map（用 all ids）
    const ids = Array.from(new Set(allRows.map((x) => x.listing_id)));
    if (ids.length === 0) {
      setListingMap(new Map());
      setLoading(false);
      return;
    }

    const { data: ls, error: lsErr } = await supabase
      .from("listings")
      .select("id,type,condo_name")
      .in("id", ids);

    if (lsErr) {
      setErr(lsErr.message);
      setListingMap(new Map());
      setLoading(false);
      return;
    }

    const map = new Map<string, ListingRow>();
    (ls ?? []).forEach((x: any) => map.set(x.id, x as ListingRow));
    setListingMap(map);

    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ✅ 把 month 变成范围：fromMonthStart <= updated_at < nextMonth(toMonth)
  const rangeDeals = useMemo(() => {
    const fromISO = monthStartISO(fromMonth);
    const toISOExclusive = nextMonthStartISO(toMonth);

    const inRange = allDeals.filter((x) => x.updated_at >= fromISO && x.updated_at < toISOExclusive);

    // ✅ Type filter：all / rent / sale
    if (typeFilter === "all") return inRange;

    return inRange.filter((x) => {
      const l = listingMap.get(x.listing_id);
      return l?.type === typeFilter;
    });
  }, [allDeals, listingMap, fromMonth, toMonth, typeFilter]);

  // ✅ 核心数字（范围内）
  const rangeNet = useMemo(() => {
    return rangeDeals.reduce((sum, x) => sum + netAmount(x.gross, x.commission_rate, x.deductions), 0);
  }, [rangeDeals]);

  const rangeDealsCount = rangeDeals.length;

  const rentVsSale = useMemo(() => {
    let rent = 0;
    let sale = 0;
    for (const x of rangeDeals) {
      const l = listingMap.get(x.listing_id);
      if (l?.type === "sale") sale += 1;
      else if (l?.type === "rent") rent += 1;
    }
    return { rent, sale };
  }, [rangeDeals, listingMap]);

  // ✅ all-time（不受 range/type 影响）
  const allTimeNet = useMemo(() => {
    return allDeals.reduce((sum, x) => sum + netAmount(x.gross, x.commission_rate, x.deductions), 0);
  }, [allDeals]);

  // ✅ bars：最近 12 个月（仍然用 commission 逻辑）
  const bars = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => addMonths(now, i - 11));
    const keys = months.map((d) => monthKey(d));

    const map = new Map<string, number>();
    keys.forEach((k) => map.set(k, 0));

    for (const x of allDeals) {
      const k = monthKey(new Date(x.updated_at));
      if (!map.has(k)) continue;

      // bar 也可以吃 type filter（更合理）
      if (typeFilter !== "all") {
        const l = listingMap.get(x.listing_id);
        if (l?.type !== typeFilter) continue;
      }

      map.set(k, (map.get(k) ?? 0) + netAmount(x.gross, x.commission_rate, x.deductions));
    }

    return keys.map((k) => ({ key: k, value: map.get(k) ?? 0 }));
  }, [allDeals, listingMap, typeFilter]);

  const maxBar = useMemo(() => Math.max(1, ...bars.map((b) => b.value)), [bars]);

  const rangeLabel = useMemo(() => {
    if (fromMonth === toMonth) return fromMonth;
    return `${fromMonth} → ${toMonth}`;
  }, [fromMonth, toMonth]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Dashboard</div>
            <div className="text-sm text-zinc-400">Income overview & performance</div>
          </div>

          <div className="flex gap-2">
            <a
              href="/listings"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              ← Listings
            </a>

          </div>
        </div>

        {/* ✅ Range + type filter */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-zinc-900 p-4 inline-flex items-center gap-3">
            <div className="text-sm text-zinc-300">From</div>
            <input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
            />

            <div className="text-sm text-zinc-300">To</div>
            <input
              type="month"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="rounded-2xl bg-zinc-900 p-4 inline-flex items-center gap-3">
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
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {/* ✅ Summary cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-zinc-900 p-5">
            <div className="text-xs text-zinc-400">Selected range net</div>
            <div className="mt-2 text-3xl font-semibold">{rm(rangeNet)}</div>
            <div className="mt-2 text-xs text-zinc-500">{rangeLabel}</div>
          </div>

          <div className="rounded-2xl bg-zinc-900 p-5">
            <div className="text-xs text-zinc-400">Deals in range</div>
            <div className="mt-2 text-3xl font-semibold">{rangeDealsCount}</div>
          </div>

          <div className="rounded-2xl bg-zinc-900 p-5">
            <div className="text-xs text-zinc-400">Rent vs Sale (range)</div>
            <div className="mt-2 text-sm">
              <span className="font-semibold">Rent:</span> {rentVsSale.rent} &nbsp;•&nbsp;
              <span className="font-semibold">Sale:</span> {rentVsSale.sale}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900 p-5">
            <div className="text-xs text-zinc-400">All-time net</div>
            <div className="mt-2 text-3xl font-semibold">{rm(allTimeNet)}</div>
            <div className="mt-2 text-xs text-zinc-400">Deals: {allDeals.length}</div>
          </div>
        </div>

        {/* ✅ Net by month */}
        <div className="mt-6 rounded-2xl bg-zinc-900 p-5">
          <div className="text-base font-semibold">Net by month</div>
          <div className="text-sm text-zinc-400">Last 12 months (simple bars)</div>

          <div className="mt-4 flex items-end gap-2 h-44">
            {bars.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full rounded-lg bg-zinc-800"
                  style={{ height: `${Math.round((b.value / maxBar) * 160)}px` }}
                  title={`${b.key}: ${rm(b.value)}`}
                />
                <div className="text-[10px] text-zinc-500">{b.key.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ✅ Deals table (range) */}
        <div className="mt-6 rounded-2xl bg-zinc-900 p-5 overflow-x-auto">
          <div className="text-base font-semibold">Deals in selected range</div>
          <div className="text-sm text-zinc-400">Latest 20</div>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-400">Loading…</div>
          ) : rangeDeals.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-300">No deals in selected range.</div>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-zinc-400">
                <tr className="text-left">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Listing</th>
                  <th className="py-2 pr-4">Gross</th>
                  <th className="py-2 pr-4">%</th>
                  <th className="py-2 pr-4">Comm (RM)</th>
                  <th className="py-2 pr-4">Deductions</th>
                  <th className="py-2 pr-0">Net</th>
                </tr>
              </thead>
              <tbody>
                {rangeDeals.slice(0, 20).map((x) => {
                  const l = listingMap.get(x.listing_id);
                  const comm = commissionAmount(x.gross, x.commission_rate);
                  const net = netAmount(x.gross, x.commission_rate, x.deductions);

                  return (
                    <tr key={x.listing_id + x.updated_at} className="border-t border-zinc-800">
                      <td className="py-3 pr-4 text-zinc-400">
                        {new Date(x.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs">
                          {l?.type?.toUpperCase() ?? "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{l?.condo_name ?? x.listing_id}</td>
                      <td className="py-3 pr-4">{rm(safeNum(x.gross))}</td>
                      <td className="py-3 pr-4">{clampPercent(x.commission_rate)}%</td>
                      <td className="py-3 pr-4">{rm(comm)}</td>
                      <td className="py-3 pr-4">{rm(safeNum(x.deductions))}</td>
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