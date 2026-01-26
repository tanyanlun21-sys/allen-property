"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";
type ListingStatus = "available" | "pending" | "booked" | "closed" | "inactive";

type Listing = {
  id: string;
  type: ListingType;
  status: ListingStatus;
  condo_name: string;
  area: string | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;
  price: number | null;
  updated_at: string;
  _photoUrls?: string[];
};

export default function ListingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeTab, setTypeTab] = useState<"all" | "rent" | "sale">("all");
  const [status, setStatus] = useState<"all" | ListingStatus>("all");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
  }, []);

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("listings")
      .select("id,type,status,condo_name,area,sqft,bedrooms,bathrooms,carparks,price,updated_at")
      .order("updated_at", { ascending: false });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const ids = (data as any[]).map((x) => x.id);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: photos } = await supabase
      .from("listing_photos")
      .select("listing_id,storage_path,sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true });

    const photoMap = new Map<string, string[]>();
    (photos ?? []).forEach((p: any) => {
      const list = photoMap.get(p.listing_id) ?? [];
      list.push(p.storage_path);
      photoMap.set(p.listing_id, list);
    });

    const toUrl = (path: string) =>
      supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;

    const enriched = (data as any[]).map((x) => ({
      ...x,
      _photoUrls: (photoMap.get(x.id) ?? []).map(toUrl),
    }));

    setItems(enriched as Listing[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const filtered = useMemo(() => {
    return items.filter((x) => {
      const okType = typeTab === "all" ? true : x.type === typeTab;
      const okStatus = status === "all" ? true : x.status === status;
      return okType && okStatus;
    });
  }, [items, typeTab, status]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Listings</div>
            <div className="text-sm text-zinc-400">All your resources, newest on top.</div>
          </div>
          <div className="flex gap-2">
            <a
              href="/listings/new"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90"
            >
              + New
            </a>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-900 p-1">
            {(["all", "rent", "sale"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeTab(t)}
                className={`rounded-md px-3 py-1 text-sm ${
                  typeTab === t ? "bg-white text-black" : "text-zinc-300 hover:text-white"
                }`}
              >
                {t === "all" ? "All" : t === "rent" ? "Rent" : "Sale"}
              </button>
            ))}
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All status</option>
            <option value="available">Available</option>
            <option value="pending">Pending</option>
            <option value="booked">Booked</option>
            <option value="closed">Closed</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={load}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-zinc-900 p-6 text-sm text-zinc-300">
            No listings yet. Click <span className="font-semibold text-white">+ New</span> to create your first one.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((x) => (
              <a
                key={x.id}
                href={`/listings/${x.id}`}
                className="rounded-2xl bg-zinc-900 p-4 hover:bg-zinc-800 transition"
              >
                {/* ✅ 照片：仍然可左右切（如果你有多张） */}
                <PhotoCarousel urls={(x as any)._photoUrls ?? []} />

                <div className="mt-3 text-lg font-semibold line-clamp-1">{x.condo_name}</div>
                <div className="mt-1 text-sm text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

                {/* ✅ 价钱：放在 sqft/rooms 上面 + 更大更粗 */}
                <div className="mt-3 text-base font-semibold text-white">
                  {x.price != null ? rm(x.price) : "—"}
                  <span className="ml-2 text-xs font-normal text-zinc-400">
                    {x.type === "rent" ? "/ mo" : ""}
                  </span>
                </div>

                {/* 原本的规格信息 */}
                <div className="mt-1 text-sm text-zinc-300">
                  {x.sqft ? `${x.sqft} sqft` : "—"} • {x.bedrooms ?? "—"}R • {x.bathrooms ?? "—"}B •{" "}
                  {x.carparks ?? "—"}CP
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                    {x.type.toUpperCase()} • {x.status}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(x.updated_at).toLocaleString()}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}