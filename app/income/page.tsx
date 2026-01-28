"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";

type DealRow = {
  listing_id: string;
  gross: number | null;
  commission_rate: number | null;
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
function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthStartISO(ym: string) {
  // ym = "2026-01"
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  return start.toISOString();
}
function nextMonthStartISO(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  return start.toISOString();
}

export default function IncomePage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [month, setMonth] = useState(() => monthKey(new Date())); // "YYYY-MM"
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

    // 只拉当月 deals（Income 页面）
    const fromISO = monthStartISO(month);
    const toISO = nextMonthStartISO(month);

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

    // 拉对应 listing 信息（type/condo_name），用 in() 批量
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
  }, [userId, month]);

  const totalNet = useMemo(() => {
    return deals.reduce(
      (sum, x) => sum + netAmount(x.gross, x.commission_rate, x.deductions),
      0
    );
  }, [deals]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Income</div>
            <div className="text-sm text-zinc-400">
              Net = Gross * % - Deductions (computed, not reading DB net)
            </div>
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
              className="rounded-lg bg-cyan-400 text-black font-semibold hover:opacity-90
              hover:bg-cyan-300 active:scale-[0.98]
shadow-[0_10px_30px_rgba(34,211,238,0.18)]"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400 mb-2">Month</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <div className="text-xs text-zinc-400">This month net</div>
            <div className="mt-1 text-2xl font-semibold">{rm(totalNet)}</div>
          </div>
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading…</div>
        ) : deals.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-6 text-sm text-zinc-300
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            No deals in selected month.
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4 overflow-x-auto
          shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
            <table className="w-full text-sm">
              <thead className="text-zinc-400">
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
                {deals.map((x) => {
                  const l = listingMap.get(x.listing_id);
                  const comm = commissionAmount(x.gross, x.commission_rate);
                  const net = netAmount(x.gross, x.commission_rate, x.deductions);
                  return (
                    <tr key={x.listing_id} className="border-t border-zinc-800">
                      <td className="py-3 pr-4 text-zinc-400">
                        {new Date(x.updated_at).toLocaleString()}
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
          </div>
        )}
      </div>
    </main>
  );
}