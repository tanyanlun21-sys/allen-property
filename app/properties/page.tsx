"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type ShowcaseListing = {
  id: string;
  condo_name: string;
  area: string | null;
  price: number | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carparks: number | null;
  furnish: "Fully" | "Partial" | null;
  available_from: string | null;
  status: string;
  owner_whatsapp: string | null;
};

const HIDDEN_STATUSES = ["Booked", "Closed", "Inactive"];

function formatDate(date?: string | null) {
  if (!date) return "Available now";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Available now";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function publicStatusLabel(status: string) {
  if (status === "Available") return "Available";
  if (["Follow-up", "Viewing", "Negotiating"].includes(status)) return "Incoming";
  return "Hidden";
}

function normalizeWhatsApp(phone: string | null) {
  if (!phone) return "";
  return phone.replace(/[^0-9]/g, "");
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
          "id,condo_name,area,price,sqft,bedrooms,bathrooms,carparks,furnish,available_from,status,owner_whatsapp"
        )
        .eq("is_public", true)
        .not("status", "in", HIDDEN_STATUSES)
        .order("updated_at", { ascending: false });

      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setItems((data ?? []) as ShowcaseListing[]);
      }

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const phone = normalizeWhatsApp(item.owner_whatsapp);
              const contactUrl = phone ? `tel:${phone}` : "#";
              const waUrl = phone ? `https://wa.me/${phone}` : "#";
              const status = publicStatusLabel(item.status);
              return (
                <article key={item.id} className="group overflow-hidden rounded-3xl border border-white/10 bg-[#07111D] p-5 shadow-[0_20px_80px_rgba(15,23,42,0.35)] transition hover:-translate-y-1">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{item.condo_name}</h2>
                      <p className="text-sm text-zinc-400">{item.area ?? "Unknown area"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        status === "Available" ? "bg-emerald-500/15 text-emerald-300" : "bg-cyan-500/15 text-cyan-200"
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  {status === "Incoming" && (
                    <div className="mb-4 rounded-3xl bg-white/5 p-3 text-sm text-cyan-200">
                      Available from {formatDate(item.available_from)}
                    </div>
                  )}

                  <div className="grid gap-3 rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-zinc-300">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Price</div>
                        <div className="mt-1 text-base font-semibold text-white">{item.price != null ? rm(item.price) : "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Sqft</div>
                        <div className="mt-1 text-base font-semibold text-white">{item.sqft ?? "-"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-xs text-zinc-400">Beds</div>
                        <div className="mt-1 text-sm font-semibold text-white">{item.bedrooms ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Baths</div>
                        <div className="mt-1 text-sm font-semibold text-white">{item.bathrooms ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Carparks</div>
                        <div className="mt-1 text-sm font-semibold text-white">{item.carparks ?? "-"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-zinc-400">Furnish</div>
                        <div className="mt-1 text-sm font-semibold text-white">{item.furnish ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Available</div>
                        <div className="mt-1 text-sm font-semibold text-white">{formatDate(item.available_from)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/properties/${item.id}`}
                      className="inline-flex flex-1 items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-300"
                    >
                      View details
                    </Link>
                    <a
                      href={contactUrl}
                      className={`inline-flex flex-1 items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold transition ${
                        phone ? "bg-white/5 text-white hover:bg-white/10" : "cursor-not-allowed bg-white/5 text-zinc-500"
                      }`}
                    >
                      Contact agent
                    </a>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold transition ${
                        phone ? "bg-white/5 text-white hover:bg-white/10" : "cursor-not-allowed bg-white/5 text-zinc-500"
                      }`}
                    >
                      WhatsApp
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
