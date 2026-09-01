"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";

type DealRow = {
  id: string | null;
  listing_id: string | null;
  deal_title: string | null;
  deal_type: ListingType | null;
  handover_date: string | null;
  gross: number | null;
  commission_rate: number | null;
  tenancy: number | null;
  deductions: number | null;
  notes: string | null;
  updated_at: string;
};

type ListingRow = {
  id: string;
  type: ListingType;
  condo_name: string;
};

type NewDealForm = {
  deal_title: string;
  deal_type: ListingType;
  handover_date: string;
  gross: number;
  commission_rate: number;
  tenancy: number;
  deductions: number;
  notes: string;
};

type NumericValue = string | number | null | undefined;

function safeNum(v: NumericValue) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clampPercent(v: NumericValue) {
  const n = safeNum(v);
  return Math.max(0, Math.min(100, n));
}
function commissionAmount(gross: NumericValue, rate: NumericValue) {
  return (safeNum(gross) * clampPercent(rate)) / 100;
}
function netAmount(
  gross: NumericValue,
  rate: NumericValue,
  tenancy: NumericValue,
  deductions: NumericValue
) {
  return Math.max(0, commissionAmount(gross, rate) + safeNum(tenancy) - safeNum(deductions));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function monthStartDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return ymd(new Date(y, m - 1, 1));
}
function nextMonthStartDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return ymd(new Date(y, m, 1));
}
function displayDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}
function effectiveDealDate(x: DealRow) {
  return displayDate(x.handover_date) || displayDate(x.updated_at);
}
function blankNewDeal(): NewDealForm {
  return {
    deal_title: "",
    deal_type: "rent",
    handover_date: ymd(new Date()),
    gross: 0,
    commission_rate: 0,
    tenancy: 0,
    deductions: 0,
    notes: "",
  };
}

const CARD =
  "rounded-2xl bg-[#0B0B0B]/70 border border-[#D4AF37]/25 backdrop-blur " +
  "shadow-[0_0_0_1px_rgba(212,175,55,0.10),0_12px_40px_rgba(0,0,0,0.65)]";

export default function IncomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  });
  const [toDate, setToDate] = useState(() => ymd(new Date()));

  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newDeal, setNewDeal] = useState<NewDealForm>(() => blankNewDeal());

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [listingMap, setListingMap] = useState<Map<string, ListingRow>>(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
  }, []);

  const filteredDeals = useMemo(() => {
    let from = "";
    let toExclusive = "";

    if (mode === "month") {
      from = monthStartDate(month);
      toExclusive = nextMonthStartDate(month);
    } else {
      if (!fromDate || !toDate || fromDate > toDate) return [];
      from = fromDate;
      const [y, m, d] = toDate.split("-").map(Number);
      toExclusive = ymd(new Date(y, m - 1, d + 1));
    }

    return deals
      .filter((x) => {
        const date = effectiveDealDate(x);
        return date >= from && date < toExclusive;
      })
      .sort((a, b) => effectiveDealDate(b).localeCompare(effectiveDealDate(a)));
  }, [deals, fromDate, mode, month, toDate]);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);

    if (mode === "range") {
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
    }

    const { data: d, error: dErr } = await supabase
      .from("deals")
      .select("id,listing_id,deal_title,deal_type,handover_date,gross,commission_rate,tenancy,deductions,notes,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (dErr) {
      setErr(dErr.message);
      setDeals([]);
      setListingMap(new Map());
      setLoading(false);
      return;
    }

    const rows = (d ?? []) as DealRow[];
    setDeals(rows);

    const ids = Array.from(new Set(rows.map((x) => x.listing_id).filter(Boolean))) as string[];
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
    (ls ?? []).forEach((x: ListingRow) => map.set(x.id, x));
    setListingMap(map);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month, mode, fromDate, toDate]);

  const totalNet = useMemo(() => {
    return filteredDeals.reduce(
      (sum, x) => sum + netAmount(x.gross, x.commission_rate, x.tenancy, x.deductions),
      0
    );
  }, [filteredDeals]);

  const totalComm = useMemo(() => {
    return filteredDeals.reduce((sum, x) => sum + commissionAmount(x.gross, x.commission_rate), 0);
  }, [filteredDeals]);

  const totalDeductions = useMemo(() => {
    return filteredDeals.reduce((sum, x) => sum + safeNum(x.deductions), 0);
  }, [filteredDeals]);

  const totalTenancy = useMemo(() => {
    return filteredDeals.reduce((sum, x) => sum + safeNum(x.tenancy), 0);
  }, [filteredDeals]);

  const totalIncome = useMemo(() => {
    return filteredDeals.reduce(
      (sum, x) =>
        sum + commissionAmount(x.gross, x.commission_rate) + safeNum(x.tenancy) - safeNum(x.deductions),
      0
    );
  }, [filteredDeals]);

  const rangeLabel = useMemo(() => {
    if (mode === "month") return `Month: ${month}`;
    return `Range: ${fromDate} -> ${toDate}`;
  }, [mode, month, fromDate, toDate]);

  const saveNewDeal = async () => {
    if (!userId) return;
    if (!newDeal.deal_title.trim()) {
      setErr("Please enter a unit / deal name.");
      return;
    }

    setSavingNew(true);
    setErr(null);

    const res = await supabase.from("deals").insert({
      listing_id: null,
      user_id: userId,
      deal_title: newDeal.deal_title.trim(),
      deal_type: newDeal.deal_type,
      handover_date: newDeal.handover_date || null,
      gross: safeNum(newDeal.gross),
      commission_rate: clampPercent(newDeal.commission_rate),
      tenancy: safeNum(newDeal.tenancy),
      deductions: safeNum(newDeal.deductions),
      notes: newDeal.notes.trim() ? newDeal.notes : null,
    });

    setSavingNew(false);
    if (res.error) return setErr(res.error.message);

    setNewOpen(false);
    setNewDeal(blankNewDeal());
    await load();
  };

  return (
    <main
      className="min-h-screen text-white bg-[#090906]
      bg-[linear-gradient(180deg,rgba(9,9,6,0.97),rgba(12,10,8,0.93))]
      bg-[radial-gradient(600px_at_12%_12%,rgba(212,175,55,0.10),transparent_32%),radial-gradient(760px_at_80%_18%,rgba(212,175,55,0.08),transparent_40%),radial-gradient(900px_at_50%_98%,rgba(4,4,6,0.55),transparent_38%)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Income</div>
            <div className="text-sm text-zinc-400">
              Net = Gross * % + Tenancy - Deductions
            </div>
            <div className="mt-1 text-xs text-zinc-500">{rangeLabel}</div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black bg-[#FFD36A] hover:bg-[#FFE6A1] shadow-[0_0_22px_rgba(212,175,55,0.38)] transition-all duration-150 active:scale-[0.98]"
            >
              + New
            </button>
            <Link
              href="/listings"
              className="rounded-lg px-4 py-2 text-sm font-medium bg-white/0 text-[#FFD36A] border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]/60 transition"
            >
              ← Listings
            </Link>
            <button
              type="button"
              onClick={load}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black bg-[#D4AF37] hover:bg-[#FFD36A] shadow-[0_0_22px_rgba(212,175,55,0.45)] transition-all duration-150 active:scale-[0.98]"
            >
              Refresh
            </button>
          </div>
        </div>

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
                className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none focus:border-[#D4AF37]/60"
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
                    className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none focus:border-[#D4AF37]/60"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">To</div>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full rounded-lg bg-[#0E0E0E] border border-[#D4AF37]/25 px-3 py-2 text-sm outline-none focus:border-[#D4AF37]/60"
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                * Uses Handover Date first. Old deals without it use Updated date.
              </div>
            </div>
          )}

          <div className={`${CARD} p-4`}>
            <div className="text-xs text-zinc-400">Total net</div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#FFD36A] via-[#D4AF37] to-[#FFF2C2] bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(212,175,55,0.25)]">
              {rm(totalNet)}
            </div>
          </div>
        </div>

        {err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading...</div>
        ) : filteredDeals.length === 0 ? (
          <div className={`mt-6 ${CARD} p-6 text-sm text-zinc-300`}>
            No deals in selected period.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-[#0E0E0E] border border-[#D4AF37]/25 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Comm</div>
                <div className="text-2xl font-bold text-[#FFF2C2]">{rm(totalComm)}</div>
              </div>
              <div className="bg-[#0E0E0E] border border-[#D4AF37]/25 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Deductions</div>
                <div className="text-2xl font-bold text-red-400">{rm(totalDeductions)}</div>
              </div>
              <div className="bg-[#0E0E0E] border border-[#D4AF37]/25 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Tenancy</div>
                <div className="text-2xl font-bold text-[#FFF2C2]">{rm(totalTenancy)}</div>
              </div>
              <div className="bg-gradient-to-r from-[#FFD36A]/20 to-[#D4AF37]/20 border border-[#FFD36A]/50 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Income</div>
                <div className="text-3xl font-extrabold text-[#FFD36A]">{rm(totalIncome)}</div>
              </div>
            </div>

            <div className={`mt-6 ${CARD} p-4 overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-[#FFD36A]/90 bg-[#0E0E0E] border-b border-[#D4AF37]/20">
                  <tr className="text-left">
                    <th className="py-2 pr-4">Handover</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Listing</th>
                    <th className="py-2 pr-4">Gross</th>
                    <th className="py-2 pr-4">%</th>
                    <th className="py-2 pr-4">Comm (RM)</th>
                    <th className="py-2 pr-4">Tenancy</th>
                    <th className="py-2 pr-4">Deductions</th>
                    <th className="py-2 pr-4">Notes</th>
                    <th className="py-2 pr-0">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.map((x, idx) => {
                    const l = x.listing_id ? listingMap.get(x.listing_id) : null;
                    const comm = commissionAmount(x.gross, x.commission_rate);
                    const net = netAmount(x.gross, x.commission_rate, x.tenancy, x.deductions);
                    const title = l?.condo_name ?? x.deal_title ?? x.listing_id ?? "Manual deal";
                    const type = l?.type ?? x.deal_type;

                    return (
                      <tr
                        key={`${x.id ?? x.listing_id ?? "deal"}-${idx}-${x.updated_at}`}
                        className="border-b border-white/5 hover:bg-[#D4AF37]/5 transition"
                      >
                        <td className="py-3 pr-4 text-zinc-300">{displayDate(x.handover_date) || "-"}</td>
                        <td className="py-3 pr-4 text-zinc-400">
                          {new Date(x.updated_at).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded-md bg-[#0E0E0E] border border-[#D4AF37]/25 px-2 py-1 text-xs text-[#FFF2C2]">
                            {type?.toUpperCase() ?? "-"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 min-w-48">
                          {x.listing_id ? (
                            <Link href={`/listings/${x.listing_id}`} className="text-white hover:text-[#FFD36A]">
                              {title}
                            </Link>
                          ) : (
                            <span>{title}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[#FFF2C2] font-semibold">
                          {rm(safeNum(x.gross))}
                        </td>
                        <td className="py-3 pr-4">{clampPercent(x.commission_rate)}%</td>
                        <td className="py-3 pr-4 text-[#FFF2C2] font-semibold">{rm(comm)}</td>
                        <td className="py-3 pr-4">{rm(safeNum(x.tenancy))}</td>
                        <td className="py-3 pr-4">{rm(safeNum(x.deductions))}</td>
                        <td className="py-3 pr-4 text-zinc-300 text-sm min-w-48 whitespace-pre-wrap break-words">
                          {x.notes || "-"}
                        </td>
                        <td className="py-3 pr-0 font-extrabold text-[#FFD36A]">{rm(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#D4AF37]/30 bg-[#101010] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.75)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">New income</div>
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Unit / Deal name</div>
                <input
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.deal_title}
                  onChange={(e) => setNewDeal((d) => ({ ...d, deal_title: e.target.value }))}
                  placeholder="e.g. Colleague unit - Mossaz Q-03-01"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Type</div>
                <select
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.deal_type}
                  onChange={(e) => setNewDeal((d) => ({ ...d, deal_type: e.target.value as ListingType }))}
                >
                  <option value="rent">Rent</option>
                  <option value="sale">Sale</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Handover Date</div>
                <input
                  type="date"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.handover_date}
                  onChange={(e) => setNewDeal((d) => ({ ...d, handover_date: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Gross (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.gross === 0 ? "" : String(newDeal.gross)}
                  onChange={(e) => setNewDeal((d) => ({ ...d, gross: safeNum(e.target.value) }))}
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Commission (%)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.commission_rate === 0 ? "" : String(newDeal.commission_rate)}
                  onChange={(e) =>
                    setNewDeal((d) => ({ ...d, commission_rate: clampPercent(e.target.value) }))
                  }
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Deductions (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.deductions === 0 ? "" : String(newDeal.deductions)}
                  onChange={(e) => setNewDeal((d) => ({ ...d, deductions: safeNum(e.target.value) }))}
                />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Tenancy (RM)</div>
                <input
                  type="number"
                  className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.tenancy === 0 ? "" : String(newDeal.tenancy)}
                  onChange={(e) => setNewDeal((d) => ({ ...d, tenancy: safeNum(e.target.value) }))}
                />
              </div>
              <div className="col-span-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Commission (RM):</span>
                  <span className="font-semibold text-white">
                    {rm(commissionAmount(newDeal.gross, newDeal.commission_rate))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Tenancy Fee:</span>
                  <span className="font-semibold text-white">{rm(newDeal.tenancy)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Net:</span>
                  <span className="font-semibold text-white">
                    {rm(netAmount(newDeal.gross, newDeal.commission_rate, newDeal.tenancy, newDeal.deductions))}
                  </span>
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-zinc-400 mb-1">Notes</div>
                <textarea
                  className="w-full min-h-20 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none"
                  value={newDeal.notes}
                  onChange={(e) => setNewDeal((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveNewDeal}
              disabled={savingNew}
              className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold text-black bg-cyan-400 hover:bg-cyan-300 shadow-[0_6px_18px_rgba(34,211,238,0.35)] transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
            >
              {savingNew ? "Saving..." : "Save income"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
