"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
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

function formatStatus(status: string) {
  if (status === "Available") return "Available";
  if (["Follow-up", "Viewing", "Negotiating"].includes(status)) return "Incoming";
  return "Hidden";
}

function normalizeWhatsApp(phone: string | null) {
  if (!phone) return "";
  return phone.replace(/[^0-9]/g, "");
}

export default function PropertyDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<ShowcaseListing | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyName, setNotifyName] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState("");
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifySent, setNotifySent] = useState(false);

  const isIncoming = item ? ["Follow-up", "Viewing", "Negotiating"].includes(item.status) : false;
  const statusLabel = item ? formatStatus(item.status) : "";
  const phone = normalizeWhatsApp(item?.owner_whatsapp ?? null);
  const whatsappUrl = phone ? `https://wa.me/${phone}` : "#";
  const telUrl = phone ? `tel:${phone}` : "#";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setItem(null);
      setPhotoUrls([]);

      if (!id) {
        setError("Invalid listing");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("listings")
        .select(
          "id,condo_name,area,price,sqft,bedrooms,bathrooms,carparks,furnish,available_from,status,owner_whatsapp"
        )
        .eq("id", id)
        .eq("is_public", true)
        .not("status", "in", HIDDEN_STATUSES)
        .maybeSingle();

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError("Property not found or is not public.");
        setLoading(false);
        return;
      }

      setItem(data as ShowcaseListing);

      const { data: photos, error: photoError } = await supabase
        .from("listing_photos")
        .select("storage_path")
        .eq("listing_id", id)
        .order("sort_order", { ascending: true });

      if (photoError) {
        console.warn(photoError.message);
      } else {
        setPhotoUrls(
          (photos ?? [])
            .map((photo: any) => supabase.storage.from("listing-photos").getPublicUrl(photo.storage_path).data.publicUrl)
            .filter(Boolean)
        );
      }

      setLoading(false);
    };

    load();
  }, [id]);

  const submitNotify = async () => {
    if (!id || !notifyName.trim() || !notifyWhatsApp.trim()) {
      setError("Please provide name and WhatsApp number.");
      return;
    }

    setNotifySaving(true);
    setError(null);

    const { error } = await supabase.from("property_showcase_notifications").insert({
      listing_id: id,
      name: notifyName.trim(),
      whatsapp: notifyWhatsApp.trim(),
    });

    if (error) {
      setError(error.message);
      setNotifySaving(false);
      return;
    }

    setNotifySent(true);
    setNotifyOpen(false);
    setNotifySaving(false);
    setNotifyName("");
    setNotifyWhatsApp("");
  };

  const detailRows = useMemo(() => {
    if (!item) return [];
    return [
      { label: "Price", value: item.price != null ? rm(item.price) : "-" },
      { label: "Sqft", value: item.sqft ?? "-" },
      { label: "Bedrooms", value: item.bedrooms ?? "-" },
      { label: "Bathrooms", value: item.bathrooms ?? "-" },
      { label: "Carparks", value: item.carparks ?? "-" },
      { label: "Furnish", value: item.furnish ?? "-" },
      { label: "Available date", value: formatDate(item.available_from) },
    ];
  }, [item]);

  return (
    <main className="min-h-screen bg-[#05070A] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-cyan-300/80">Property Showcase</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{item?.condo_name ?? "Loading property"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Browse the public property listing with dark theme design and direct agent contact.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/properties" className="rounded-3xl bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Back to listings
            </Link>
            <a
              href={telUrl}
              className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
                phone ? "bg-cyan-400 text-black hover:bg-cyan-300" : "bg-white/5 text-zinc-500 cursor-not-allowed"
              }`}
            >
              Contact agent
            </a>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-cyan-400/10 bg-[#07111D] p-10 text-center text-cyan-200">Loading property...</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/10 bg-[#2b0e13] p-10 text-center text-red-300">{error}</div>
        ) : !item ? null : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <PhotoCarousel urls={photoUrls} />

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.3)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-white">{item.condo_name}</div>
                    <div className="text-sm text-zinc-400">{item.area ?? "Unknown area"}</div>
                  </div>

                  <div className="space-y-2 text-right">
                    <div className="text-sm uppercase tracking-[0.35em] text-zinc-400">Status</div>
                    <div className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      statusLabel === "Available" ? "bg-emerald-500/15 text-emerald-200" : "bg-cyan-500/15 text-cyan-200"
                    }`}>
                      {statusLabel}
                    </div>
                    {statusLabel === "Incoming" && (
                      <div className="text-xs text-zinc-400">Available from {formatDate(item.available_from)}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
                {detailRows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[140px_1fr] gap-3 text-sm text-zinc-300">
                    <div className="font-semibold text-white">{row.label}</div>
                    <div>{row.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">Agent contact</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href={telUrl}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold text-center transition ${
                      phone ? "bg-cyan-400 text-black hover:bg-cyan-300" : "bg-white/5 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    Call agent
                  </a>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold text-center transition ${
                      phone ? "bg-white/5 text-white hover:bg-white/10" : "bg-white/5 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    WhatsApp agent
                  </a>
                </div>
              </div>

              {isIncoming && (
                <div className="rounded-3xl border border-cyan-400/15 bg-[#07111D] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.25)]">
                  <div className="text-base font-semibold text-white">Notify me</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Leave your name and WhatsApp. We will contact you when this property becomes available.
                  </p>
                  <button
                    type="button"
                    onClick={() => setNotifyOpen(true)}
                    className="mt-4 rounded-3xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-300"
                  >
                    Notify me
                  </button>
                </div>
              )}

              {notifySent && (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  Thank you! We have received your request and will notify you once the property is available.
                </div>
              )}
            </div>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-[#07111D] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.25)]">
                <div className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Property details</div>
                <div className="mt-6 space-y-4 text-sm text-zinc-300">
                  <div>
                    <div className="text-xs text-zinc-500">Condo</div>
                    <div className="mt-1 text-white">{item.condo_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Area</div>
                    <div className="mt-1 text-white">{item.area ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Available date</div>
                    <div className="mt-1 text-white">{formatDate(item.available_from)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Furnish</div>
                    <div className="mt-1 text-white">{item.furnish ?? "-"}</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {notifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 p-4">
          <div className="mx-auto max-w-lg rounded-3xl border border-cyan-400/20 bg-[#07111D] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Notify me</h2>
                <p className="mt-1 text-sm text-zinc-400">We'll send you a message when this listing becomes available.</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifyOpen(false)}
                className="rounded-full bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block text-sm text-zinc-300">
                Name
                <input
                  value={notifyName}
                  onChange={(e) => setNotifyName(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0F1825] px-4 py-3 text-white outline-none"
                  placeholder="Your name"
                />
              </label>
              <label className="block text-sm text-zinc-300">
                WhatsApp
                <input
                  value={notifyWhatsApp}
                  onChange={(e) => setNotifyWhatsApp(e.target.value)}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-[#0F1825] px-4 py-3 text-white outline-none"
                  placeholder="e.g. 60123456789"
                />
              </label>
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                type="button"
                onClick={submitNotify}
                disabled={notifySaving}
                className="w-full rounded-3xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-300 disabled:opacity-70"
              >
                {notifySaving ? "Sending..." : "Submit request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
