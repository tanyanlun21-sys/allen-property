import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ⚠️ 必须是 service role
);

function safe(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/"/g, '""');
}

function toCSV(rows: any[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","), // header
    ...rows.map((r) =>
      headers.map((h) => `"${safe(r[h])}"`).join(",")
    ),
  ];
  return csv.join("\n");
}

export async function GET() {
  // 1) listings
  const { data: listings, error: lErr } = await supabase
    .from("listings")
    .select("*");

  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  // 2) deals
  const { data: deals, error: dErr } = await supabase
    .from("deals")
    .select("*");

  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  // 3) photos count
  const { data: photos, error: pErr } = await supabase
    .from("listing_photos")
    .select("listing_id");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const photoCount = new Map<string, number>();
  (photos ?? []).forEach((p) => {
    photoCount.set(p.listing_id, (photoCount.get(p.listing_id) ?? 0) + 1);
  });

  // 4) merge 成导出结构
  const rows = (listings ?? []).map((l: any) => {
    const d = (deals ?? []).find((x: any) => x.listing_id === l.id);

    return {
      listing_id: l.id,
      condo_name: l.condo_name,
      area: l.area,
      type: l.type,
      status: l.status,
      price: l.price,
      sqft: l.sqft,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      carparks: l.carparks,

      gross: d?.gross ?? "",
      commission_rate: d?.commission_rate ?? "",
      deductions: d?.deductions ?? "",
      notes: d?.notes ?? "",

      photos_count: photoCount.get(l.id) ?? 0,
      listing_updated_at: l.updated_at,
      deal_updated_at: d?.updated_at ?? "",
    };
  });

  const csv = toCSV(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="property-backup-${Date.now()}.csv"`,
    },
  });
}