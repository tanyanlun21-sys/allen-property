import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠️ 这里改成你 Supabase Storage 的 bucket 名字（去 Supabase Storage 看）
// 常见：property, properties, listing-photos, photos
const BUCKET = "listing-photos";

function extractStoragePath(input: string): string | null {
  if (!input) return null;

  // 情况 1：你存的本来就是 path（例如：userId/xxx.jpg）
  if (!input.startsWith("http")) return input.replace(/^\/+/, "");

  // 情况 2：你存的是 public url
  // https://xxx.supabase.co/storage/v1/object/public/<bucket>/<path>
  try {
    const u = new URL(input);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return u.pathname.slice(idx + marker.length).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function normalizePhotoList(listing: any): string[] {
  // ✅ 兼容不同字段名：你不确定存在哪个字段也没关系
  const candidates = [
    listing?.photos,
    listing?.photo_urls,
    listing?.images,
    listing?.image_urls,
  ];

  // 可能是数组 / 可能是 JSON string / 可能是逗号分隔
  for (const c of candidates) {
    if (!c) continue;

    if (Array.isArray(c)) return c.filter(Boolean);

    if (typeof c === "string") {
      const s = c.trim();
      if (!s) continue;

      // JSON array string
      if (s.startsWith("[") && s.endsWith("]")) {
        try {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) return arr.filter(Boolean);
        } catch {}
      }

      // comma separated
      if (s.includes(",")) return s.split(",").map(x => x.trim()).filter(Boolean);

      // single url/path
      return [s];
    }
  }

  return [];
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing SUPABASE env vars", { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) 先拿到这条 listing（为了抓照片 urls/paths）
    const { data: listing, error: findErr } = await admin
      .from("listings")
      .select("*")
      .eq("id", id)
      .single();

    if (findErr) {
      return new Response(findErr.message, { status: 500 });
    }
    if (!listing) {
      return new Response("Listing not found", { status: 404 });
    }

    // 2) 从 listing 里解析照片列表
    const photoList = normalizePhotoList(listing);
    const paths = photoList
      .map(extractStoragePath)
      .filter((p): p is string => !!p);

    // 3) 先删 storage 图片（有就删，没就跳过）
    if (paths.length > 0) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
      if (rmErr) {
        // 不直接中断也可以，但我建议直接报错，避免“删了数据但图片没删”
        return new Response(`Storage remove failed: ${rmErr.message}`, { status: 500 });
      }
    }

    // 4) 再删 listing 记录
    const { error: delErr } = await admin.from("listings").delete().eq("id", id);
    if (delErr) {
      return new Response(delErr.message, { status: 500 });
    }

    return Response.json({ ok: true, removedPhotos: paths.length });
  } catch (e: any) {
    return new Response(e?.message ?? "Server error", { status: 500 });
  }
}
