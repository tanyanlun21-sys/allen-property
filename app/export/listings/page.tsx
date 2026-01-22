"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type Row = {
  listing_id: string;
  condo_name: string;
  area: string | null;
  type: string;
  status: string;
  updated_at: string;

  gross: number;
  commission_rate: number;
  commission_amount: number;
  deductions: number;
  net: number;
  notes: string | null;
};

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ExportListingsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const nowText = useMemo(() => new Date().toLocaleString(), []);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      window.location.href = "/";
      return;
    }

    // 1) listings
    const { data: listings, error: lErr } = await supabase
      .from("listings")
      .select("id,condo_name,area,type,status,updated_at")
      .order("updated_at", { ascending: false });

    if (lErr) {
      setErr(lErr.message);
      setLoading(false);
      return;
    }

    const ids = (listings ?? []).map((x: any) => x.id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 2) deals (你现在 dashboard/income 用到的字段)
    const { data: deals, error: dErr } = await supabase
      .from("deals")
      .select("listing_id,gross,commission_rate,commission_amount,deductions,net,notes,updated_at")
      .in("listing_id", ids);

    if (dErr) {
      setErr(dErr.message);
      setLoading(false);
      return;
    }

    const dealMap = new Map<string, any>();
    (deals ?? []).forEach((d: any) => dealMap.set(d.listing_id, d));

    // 3) merge
    const merged: Row[] = (listings ?? []).map((l: any) => {
      const d = dealMap.get(l.id);

      const gross = safeNum(d?.gross);
      const rate = safeNum(d?.commission_rate);
      const comm = d?.commission_amount != null ? safeNum(d?.commission_amount) : (gross * rate) / 100;
      const deductions = safeNum(d?.deductions);
      const net = d?.net != null ? safeNum(d?.net) : Math.max(0, comm - deductions);

      return {
        listing_id: l.id,
        condo_name: l.condo_name,
        area: l.area,
        type: l.type,
        status: l.status,
        updated_at: l.updated_at,

        gross,
        commission_rate: rate,
        commission_amount: comm,
        deductions,
        net,
        notes: d?.notes ?? null,
      };
    });

    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalNet = useMemo(() => rows.reduce((a, r) => a + safeNum(r.net), 0), [rows]);
  const totalDeals = useMemo(() => rows.filter((r) => safeNum(r.net) > 0).length, [rows]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        Loading export…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      {/* 打印专用样式 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 0 !important; }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
      `}</style>

      <div className="page mx-auto max-w-6xl p-6">
        <div className="no-print flex items-center justify-between gap-3 mb-6">
          <div>
            <div className="text-xl font-semibold">Export • Listings</div>
            <div className="text-sm text-gray-600">Open print dialog to save as PDF</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Print / Save PDF
            </button>
            <a
              href="/dashboard"
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-black"
            >
              Back
            </a>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-2xl font-bold">Real Estate CRM • Income Export</div>
          <div className="text-sm text-gray-600">Generated: {nowText}</div>
        </div>

        {err && <div className="mb-4 text-sm text-red-600">{err}</div>}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-600">Total net</div>
            <div className="text-xl font-semibold">{rm(totalNet)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-600">Deals count</div>
            <div className="text-xl font-semibold">{totalDeals}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 180 }}>Listing</th>
              <th style={{ width: 140 }}>Area</th>
              <th style={{ width: 90 }}>Type</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 120 }}>Gross</th>
              <th style={{ width: 80 }}>%</th>
              <th style={{ width: 130 }}>Comm (RM)</th>
              <th style={{ width: 120 }}>Deduct</th>
              <th style={{ width: 120 }}>Net</th>
              <th style={{ width: 170 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.listing_id}>
                <td>{r.condo_name}</td>
                <td>{r.area ?? "—"}</td>
                <td>{String(r.type).toUpperCase()}</td>
                <td>{r.status}</td>
                <td>{rm(r.gross)}</td>
                <td>{safeNum(r.commission_rate)}%</td>
                <td>{rm(r.commission_amount)}</td>
                <td>{rm(r.deductions)}</td>
                <td><b>{rm(r.net)}</b></td>
                <td>{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 20, color: "#666" }}>
                  No listings
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-4 text-xs text-gray-500">
          Tip: 打印时选择 “Save as PDF”，Paper 选 A4，Margins 选 Default，勾选 “Background graphics”（如果你要背景色）
        </div>
      </div>
    </main>
  );
}