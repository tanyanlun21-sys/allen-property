import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // 先删关联表
    const r1 = await supabase.from("listing_photos").delete().eq("listing_id", id);
    if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 });

    const r2 = await supabase.from("deals").delete().eq("listing_id", id);
    if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 });

    // 再删主表
    const r3 = await supabase.from("listings").delete().eq("id", id);
    if (r3.error) return NextResponse.json({ error: r3.error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}