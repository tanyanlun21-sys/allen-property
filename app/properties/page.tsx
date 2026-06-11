"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

type ShowcaseListing = {
  id: string;
  type: "rent" | "sale" | string;
  condo_name: string;
  area: string | null;
  price: number | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;
  furnish: "Fully" | "Partial" | null;
  available_from: string | null;
  next_follow_up: string | null;
  status: "Available" | "Follow-up" | string;
  _photoUrls?: string[];
};

const PUBLIC_STATUSES = ["Available", "Follow-up"] as const;

function parseDateValue(date?: string | null) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sortShowcaseListings(a: ShowcaseListing, b: ShowcaseListing) {
  if (a.status !== b.status) {
    return a.status === "Available" ? -1 : 1;
  }

  if (a.status === "Available") {
    const aDate = parseDateValue(a.available_from);
    const bDate = parseDateValue(b.available_from);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    if (aDate) return -1;
    if (bDate) return 1;
    return 0;
  }

  const aDate = parseDateValue(a.next_follow_up);
  const bDate = parseDateValue(b.next_follow_up);
  if (aDate && bDate) return aDate.getTime() - bDate.getTime();
  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
}

function formatDate(date?: string | null) {
  if (!date) return "Available now";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Available now";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function publicStatusLabel(status: string) {
  if (status === "Available") return "Available";
  if (status === "Follow-up") return "Incoming";
  return "Hidden";
}

function renderCard(item: ShowcaseListing) {
  const status = publicStatusLabel(item.status);
  const priceLabel = item.price != null ? `${rm(item.price)}${item.type === "rent" ? " / mo" : ""}` : "-";
  const summary = [
    item.sqft ? `${item.sqft} sqft` : null,
    item.bedrooms != null ? `${item.bedrooms}R` : null,
    item.bathrooms != null ? `${item.bathrooms}B` : null,
    item.carparks != null ? `${item.carparks}CP` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Link
      key={item.id}
      href={`/properties/${item.id}`}
      className="group overflow-hidden rounded-3xl border border-white/10 bg-[#07111D] transition hover:-translate-y-1 hover:border-cyan-400/40"
    >
      <div className="relative">
        <PhotoCarousel urls={item._photoUrls ?? []} />
        <div className="absolute inset-x-0 top-4 flex items-center justify-between gap-3 px-4">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === "Available"
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-cyan-500/20 text-cyan-200"
            }`}
          >
            {status}
          </span>
          {item.furnish && (
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-200">
              {item.furnish}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 p-5">
        <div>
          <div className="text-lg font-semibold text-white">{item.condo_name}</div>
          <div className="text-sm text-zinc-400">{item.area ?? "Unknown area"}</div>
        </div>
        <div className="text-sm font-semibold text-white">{priceLabel}</div>
        <div className="text-sm text-zinc-300">{summary}</div>
        <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">{status}</div>
      </div>
    </Link>
  );
}

export default function PropertiesPage() {
  const [items, setItems] = useState<ShowcaseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [furnishFilter, setFurnishFilter] = useState<"all" | "Fully" | "Partial">("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("listings")
        .select(
          "id,type,condo_name,area,price,sqft,bedrooms,bathrooms,carparks,furnish,available_from,next_follow_up,status"
        )
        .in("status", PUBLIC_STATUSES);

      if (error) {
        setError(error.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as any[];
      const ids = rows.map((row) => row.id);
      const photoMap = new Map<string, string[]>();

      if (ids.length > 0) {
        const { data: photos, error: photoError } = await supabase
          .from("listing_photos")
          .select("listing_id,storage_path,sort_order")
          .in("listing_id", ids)
          .order("sort_order", { ascending: true });

        if (!photoError && photos) {
          photos.forEach((photo: any) => {
            const list = photoMap.get(photo.listing_id) ?? [];
            list.push(photo.storage_path);
            photoMap.set(photo.listing_id, list);
          });
        }
      }

      const toUrl = (path: string) =>
        supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;

      const enriched = rows
        .map((row) => ({
          ...row,
          _photoUrls: (photoMap.get(row.id) ?? []).map(toUrl),
        }))
        .sort(sortShowcaseListings);

      setItems(enriched as ShowcaseListing[]);
      setLoading(false);
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const terms = search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      const haystack = [item.condo_name, item.area].filter(Boolean).join(" ").toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;

      const price = item.price ?? 0;
      const min = priceMin ? Number(priceMin) : null;
      const max = priceMax ? Number(priceMax) : null;
      if (min !== null && item.price !== null && price < min) return false;
      if (max !== null && item.price !== null && price > max) return false;
      if (min !== null && item.price === null) return false;
      if (max !== null && item.price === null) return false;

      if (bedroomFilter !== null) {
        if (item.bedrooms === null) return false;
        if (bedroomFilter === 5) {
          if (item.bedrooms < 5) return false;
        } else if (item.bedrooms !== bedroomFilter) {
          return false;
        }
      }

      if (furnishFilter !== "all" && item.furnish !== furnishFilter) return false;
      return true;
    });
  }, [items, search, priceMin, priceMax, bedroomFilter, furnishFilter]);

  const availableRent = filtered.filter((item) => item.status === "Available" && item.type === "rent");
  const availableSale = filtered.filter((item) => item.status === "Available" && item.type === "sale");
  const incomingRent = filtered.filter((item) => item.status === "Follow-up" && item.type === "rent");
  const incomingSale = filtered.filter((item) => item.status === "Follow-up" && item.type === "sale");

  return (
    <main className="min-h-screen bg-[#05070A] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-4">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Public Showcase</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Browse properties</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Discover public listings in dark mode with search and filters. No login needed.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search condo name or area"
              className="w-full rounded-3xl border border-cyan-400/20 bg-[#07111D] px-4 py-3 text-white outline-none placeholder:text-zinc-500"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="Min price"
                className="w-full rounded-3xl border border-cyan-400/20 bg-[#07111D] px-4 py-3 text-white outline-none placeholder:text-zinc-500"
              />
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="Max price"
                className="w-full rounded-3xl border border-cyan-400/20 bg-[#07111D] px-4 py-3 text-white outline-none placeholder:text-zinc-500"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr]">
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4, 5] as const).map((value) => {
                const label = value === 5 ? "5+ beds" : `${value} bed`;
                const active = bedroomFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBedroomFilter(active ? null : value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active ? "bg-cyan-400 text-black" : "bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "Fully", "Partial"] as const).map((value) => {
                const label = value === "all" ? "All furnish" : `${value} furnished`;
                const active = furnishFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFurnishFilter(value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active ? "bg-cyan-400 text-black" : "bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-cyan-400/20 bg-[#07111D] p-10 text-center text-cyan-200">Loading properties...</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-[#2b0e13] p-10 text-center text-red-300">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-cyan-400/20 bg-[#07111D] p-10 text-center text-zinc-300">
            No matching public listings found.
          </div>
        ) : (
          <div className="space-y-12">
            <section>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-emerald-300/90">Available</div>
                  <p className="text-sm text-zinc-400">Current available listings, sorted by the soonest available date.</p>
                </div>
              </div>

              {availableRent.length > 0 && (
                <div>
                  <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.3em] text-cyan-300/80">
                    Rent
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {availableRent.map((item) => renderCard(item))}
                  </div>
                </div>
              )}

              {availableSale.length > 0 && (
                <div className="mt-8">
                  <div className="mb-4 rounded-3xl border border-white/10 bg-[#07111D]/70 px-4 py-3 text-xs uppercase tracking-[0.3em] text-zinc-300/80">
                    Sale
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {availableSale.map((item) => renderCard(item))}
                  </div>
                </div>
              )}
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-cyan-300/90">Incoming</div>
                  <p className="text-sm text-zinc-400">Follow-up listings, sorted by the next follow-up date.</p>
                </div>
              </div>

              {incomingRent.length > 0 && (
                <div>
                  <div className="mb-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.3em] text-cyan-300/80">
                    Rent
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {incomingRent.map((item) => renderCard(item))}
                  </div>
                </div>
              )}

              {incomingSale.length > 0 && (
                <div className="mt-8">
                  <div className="mb-4 rounded-3xl border border-white/10 bg-[#07111D]/70 px-4 py-3 text-xs uppercase tracking-[0.3em] text-zinc-300/80">
                    Sale
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {incomingSale.map((item) => renderCard(item))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
