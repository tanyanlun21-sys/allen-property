"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ListingType = "rent" | "sale";

type ListingStatus =
  | "New"
  | "Available"
  | "Follow-up"
  | "Viewing"
  | "Negotiating"
  | "Booked"
  | "Closed"
  | "Inactive";

type Form = {
  type: ListingType;
  status: ListingStatus;
  condo_name: string;
  area: string;
  sqft: string; // keep as string for input UX
  bedrooms: string;
  bathrooms: string;
  carparks: string;
  price: string;
  available_from: string; // yyyy-mm-dd or ""
};

function toNullableNumber(v: string): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function NewListingPage() {
  const [form, setForm] = useState<Form>({
    type: "rent",
    status: "New",
    condo_name: "",
    area: "",
    sqft: "",
    bedrooms: "",
    bathrooms: "",
    carparks: "",
    price: "",
    available_from: "",
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    return form.condo_name.trim().length > 0 && !saving;
  }, [form.condo_name, saving]);

  const create = async () => {
    if (!form.condo_name.trim()) return;

    setSaving(true);
    setErr(null);

    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) {
      window.location.href = "/";
      return;
    }

    // ✅ Available From 只在 status=Available 时才写入（其他状态自动清空）
    const availableFrom =
      form.status === "Available" && form.available_from.trim() !== ""
        ? form.available_from
        : null;

    const nowIso = new Date().toISOString();

    const payload: any = {
      user_id: userId,
      type: form.type,
      status: form.status,
      condo_name: form.condo_name.trim(),
      area: form.area.trim() || null,
      sqft: toNullableNumber(form.sqft),
      bedrooms: toNullableNumber(form.bedrooms),
      bathrooms: toNullableNumber(form.bathrooms),
      carparks: toNullableNumber(form.carparks),
      price: toNullableNumber(form.price),
      available_from: availableFrom,

      // ✅ Step 2：创建时写入
      created_at: nowIso,
      last_update: nowIso,
    };

    const { data, error } = await supabase
      .from("listings")
      .insert(payload)
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    window.location.href = `/listings/${data.id}`;
  };

  return (
    <main
  className="min-h-screen text-white bg-[#06070A]
  bg-[radial-gradient(800px_circle_at_20%_10%,rgba(34,211,238,0.12),transparent_40%),radial-gradient(600px_circle_at_80%_30%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(900px_circle_at_50%_90%,rgba(168,85,247,0.08),transparent_45%)]"
>
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">New Listing</div>
            <div className="text-sm text-zinc-400">Create first. Photos later.</div>
          </div>
          <a href="/listings" className="text-sm text-zinc-300 hover:text-white">
            Back
          </a>
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-5 space-y-3
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.55)]">
          <div className="grid grid-cols-2 gap-3">
            <select
              className="rounded-lg bg-zinc-800 px-3 py-2"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as ListingType }))
              }
            >
              <option value="rent">Rent</option>
              <option value="sale">Sale</option>
            </select>

            <select
              className="rounded-lg bg-zinc-800 px-3 py-2"
              value={form.status}
              onChange={(e) => {
                const next = e.target.value as ListingStatus;

                // ✅ 防误操作：从 Available 切到其他状态时，提醒会清空日期
                if (form.status === "Available" && next !== "Available" && form.available_from) {
                  const ok = confirm(
                    "你正在把状态改为非 Available，将会清空 Available From 日期。确定继续吗？"
                  );
                  if (!ok) return;
                }

                setForm((f) => ({
                  ...f,
                  status: next,
                  available_from: next === "Available" ? f.available_from : "",
                }));
              }}
            >
              <option value="New">New</option>
              <option value="Available">Available</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Viewing">Viewing</option>
              <option value="Negotiating">Negotiating</option>
              <option value="Booked">Booked</option>
              <option value="Closed">Closed</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <input
            className="w-full rounded-lg bg-zinc-800 px-3 py-2"
            placeholder="Condo name *"
            value={form.condo_name}
            onChange={(e) => setForm((f) => ({ ...f, condo_name: e.target.value }))}
          />

          <input
            className="w-full rounded-lg bg-zinc-800 px-3 py-2"
            placeholder="Area"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Available From</div>
              <input
                type="date"
                disabled={form.status !== "Available"}
                className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none disabled:opacity-50"
                value={form.available_from}
                onChange={(e) =>
                  setForm((f) => ({ ...f, available_from: e.target.value }))
                }
              />
              <div className="mt-1 text-xs text-zinc-500">
                只有 status=Available 才能选择日期
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-1">
                {form.type === "rent" ? "Rent (RM)" : "Sale (RM)"}
              </div>
              <input
                type="number"
                inputMode="decimal"
                className="w-full rounded-lg bg-zinc-800 px-3 py-2"
                placeholder={form.type === "rent" ? "Rent (RM)" : "Sale (RM)"}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              inputMode="decimal"
              className="rounded-lg bg-zinc-800 px-3 py-2"
              placeholder="Sqft"
              value={form.sqft}
              onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value }))}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                inputMode="numeric"
                className="rounded-lg bg-zinc-800 px-3 py-2"
                placeholder="Rooms"
                value={form.bedrooms}
                onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))}
              />
              <input
                type="number"
                inputMode="numeric"
                className="rounded-lg bg-zinc-800 px-3 py-2"
                placeholder="Baths"
                value={form.bathrooms}
                onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))}
              />
              <input
                type="number"
                inputMode="numeric"
                className="rounded-lg bg-zinc-800 px-3 py-2"
                placeholder="Carparks"
                value={form.carparks}
                onChange={(e) => setForm((f) => ({ ...f, carparks: e.target.value }))}
              />
            </div>
          </div>

          {err && <div className="text-sm text-red-400">{err}</div>}

          <button
            disabled={!canCreate}
            onClick={create}
            className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-black
bg-cyan-400 hover:bg-cyan-300
shadow-[0_6px_18px_rgba(34,211,238,0.35)]
transition-all duration-150
active:scale-[0.97]
disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          提示：如果你填到一半想返回 listings，先 Create 再回去，避免丢数据。
        </div>
      </div>
    </main>
  );
}