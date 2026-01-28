"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";

type DealRow = {
  listing_id: string;
  gross: number | null;
  commission_rate: number | null; // %
  deductions: number | null;
  notes: string | null;
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
  return Math.max(0, commissionAmount(gross, rate) - safeNum(deductions));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; // "YYYY-MM"
}
function monthStartISO(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  return start.toISOString();
}
function nextMonthStartISO(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  return start.toISOString();
}
function startOfDayISO(dateStr: string) {
  // dateStr = "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}
function nextDayISO(dateStr: string) {
  // 用于 To：包含 To 当天 => lt nextDay
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return dt.toISOString();
}

const CARD =
  "rounded-2xl bg-[#0B0B0B]/70 border border-[#D4AF37]/25 backdrop-blur " +
  "shadow-[0_0_0_1px_rgba(212,175,55,0.10),0_12px_40px_rgba(0,0,0,0.65)]";

export default function IncomePage() {
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ 两种筛选模式：month / range
  const [mode, setMode] = useState<"month" | "range">("month");

  const [month, setMonth] = useState(() => monthKey(new Date())); // "YYYY-MM"

  // ✅ 默认 range：最近 30 天（你也可以自己改）
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    return ymd(d);
  });
  const [toDate, setToDate] = useState(() => ymd(new Date()));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [deals, setDeals] = useState<DealRow[]>([]);
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

    // ✅ 计算查询区间
    let fromISO = "";
    let toISO = "";

    if (mode === "month") {
      fromISO = monthStartISO(month);
      toISO = nextMonthStartISO(month);
    } else {
      if (!fromDate || !toDate) {
        setErr("Please select From / To dates.");
        setLoading(false);
        return;
      }
      if (fromDate > toDate) {
        setErr("From date cannot be later than To date.");
        setLoading(false);
        return;
      }
      fromISO = startOfDayISO(fromDate);
      toISO = nextDayISO(toDate); // ✅ 包含 To 当天
    }

    // ✅ 拉 deals（按 updated_at）
    const { data: d, error: dErr } = await supabase
      .from("deals")
      .select("listing_id,gross,commission_rate,deductions,notes,updated_at")
      .eq("user_id", userId)
      .gte("updated_at", fromISO)
      .lt("updated_at", toISO)
      .order("updated_at", { ascending: false });

    if (dErr) {
      setErr(dErr.message);
      setDeals([]);
      setListingMap(new Map());
      setLoading(false);
      return;
    }

    const rows = (d ?? []) as DealRow[];
    setDeals(rows);

    // ✅ 批量拉 listings
    const ids = Array.from(new Set(rows.map((x) => x.listing_id)));
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
  }, [userId, month, mode, fromDate, toDate]);

  const totalNet = useMemo(() => {
    return deals.reduce(
      (sum, x) => sum + netAmount(x.gross, x.commission_rate, x.deductions),
      0
    );
  }, [deals]);

  const rangeLabel = useMemo(() => {
    if (mode === "month") return `Month: ${month}`;
    return `Range: ${fromDate} → ${toDate}`;
  }, [mode, month, fromDate, toDate]);

  return (
    <main
      className="min-h-screen text-white bg-[#050505]
      bg-[radial-gradient(900px_circle_at_20%_10%,rgba(212,175,55,0.16),transparent_45%),radial-gradient(700px_circle_at_80%_30%,rgba(255,215,0,0.10),transparent_50%)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Income</div>
            <div className="text-sm text-zinc-400">
              Net = Gross * % - Deductions (computed, not reading DB net)
            </div>
            <div className="mt-1 text-xs text-zinc-500">{rangeLabel}</div>
          </div>

          <div className="flex gap-2">
            <a
              href="/listings"
              className="rounded-lg px-4 py-2 text-sm font-medium
              bg-white/0 text-[#FFD36A] border border-[#D4AF37]/30
              hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]/60 transition"
            >
              ← Listings
            </a>

            <button
              type="button"
              onClick={load}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black
              bg-[#D4AF37] hover:bg-[#FFD36A]
              shadow-[0_0_22px_rgba(212,175,55,0.45)]
              transition-all duration-150 active:scale-[0.98]"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* ✅ Filters */}
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className={`${CARD} p-4`}>
            <div className="text-xs text-zinc-400 mb-2">Mode</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("month")}
                className={`rounded-lg px-3 py-2 text-sm border transition ${
                  mode === "month"
                    ? "bg-[#D4AF37] text-black border-[#D4AF37]"
                    : "bg-[#0E0E0E] text-[#FFD36A] border-[#D4AF37]/25 hover:border-[#D4AF37]/60"
                }`}
              >
                Month
              </button>

              <button
                type="button"
                onClick={() => setMode("range")}
                className={`rounded-lg px-3 py-2 text-sm border transition ${
                  mode === "range"
                    ? "bg-[#D4AF37] text-black border-[#D4AF37]"
                    : "bg-[#0E0E0E] text-[#FFD36A] border-[#D4AF37]/25 hover:border-[#D4AF37]/60"
                }`}
              >
                Between dates
              </button>
            </div>
          </div>

          {mode === "month" ? (
            <div className={`${CARD} p-4`}>
              <div className="text-xs text-zinc-400 mb-2">Month</div>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none
                focus:border-[#D4AF37]/60"
              />
            </div>
          ) : (
            <div className={`${CARD} p-4 md:col-span-2`}>
              <div className="text-xs text-zinc-400 mb-2">Between</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">From</div>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none
                    focus:border-[#D4AF37]/60"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">To</div>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none
                    focus:border-[#D4AF37]/60"
                  />
                </div>
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                * To date is inclusive (it counts the whole day)
              </div>
            </div>
          )}

          <div className={`${CARD} p-4`}>
            <div className="text-xs text-zinc-400">Total net</div>
            <div
              className="mt-1 text-3xl font-extrabold tracking-tight
              bg-gradient-to-r from-[#FFD36A] via-[#D4AF37] to-[#FFF2C2]
              bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(212,175,55,0.25)]"
            >
              {rm(totalNet)}
            </div>
          </div>
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading…</div>
        ) : deals.length === 0 ? (
          <div className={`mt-6 ${CARD} p-6 text-sm text-zinc-300`}>
            No deals in selected period.
          </div>
        ) : (
          <div className={`mt-6 ${CARD} p-4 overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-[#FFD36A]/90 bg-[#0E0E0E] border-b border-[#D4AF37]/20">
                <tr className="text-left">
                  <th className="py-2 pr-4">Updated</th>
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
                {deals.map((x, idx) => {
                  const l = listingMap.get(x.listing_id);
                  const comm = commissionAmount(x.gross, x.commission_rate);
                  const net = netAmount(x.gross, x.commission_rate, x.deductions);

                  return (
                    <tr
                      key={`${x.listing_id}-${idx}-${x.updated_at}`}
                      className="border-b border-white/5 hover:bg-[#D4AF37]/5 transition"
                    >
                      <td className="py-3 pr-4 text-zinc-400">
                        {new Date(x.updated_at).toLocaleString()}
                      </td>

                      <td className="py-3 pr-4">
                        <span className="rounded-md bg-[#0E0E0E] border border-[#D4AF37]/25 px-2 py-1 text-xs text-[#FFF2C2]">
                          {l?.type?.toUpperCase() ?? "—"}
                        </span>
                      </td>

                      <td className="py-3 pr-4">{l?.condo_name ?? x.listing_id}</td>

                      <td className="py-3 pr-4 text-[#FFF2C2] font-semibold">
                        {rm(safeNum(x.gross))}
                      </td>

                      <td className="py-3 pr-4">{clampPercent(x.commission_rate)}%</td>

                      <td className="py-3 pr-4 text-[#FFF2C2] font-semibold">{rm(comm)}</td>

                      <td className="py-3 pr-4">{rm(safeNum(x.deductions))}</td>

                      <td className="py-3 pr-0 font-extrabold text-[#FFD36A]">
                        {rm(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}