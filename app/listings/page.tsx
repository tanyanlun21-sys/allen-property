"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCarousel from "@/components/PhotoCarousel";
import { rm } from "@/lib/money";

type ListingType = "rent" | "sale";

// ✅ 跟你 DB 统一后的状态（Title Case）
type ListingStatus =
  | "New"
  | "Available"
  | "Follow-up"
  | "Viewing"
  | "Negotiating"
  | "Booked"
  | "Closed"
  | "Inactive"
  // 兼容你旧 UI / 旧数据（如果还有）
  | "Pending";

type Furnish = "Fully" | "Partial" | null;

type WorkListing = {
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
  furnish: Furnish;

  // ✅ 基建字段
  inbox: boolean;
  last_update: string | null;
  next_follow_up: string | null;
  priority: number | null;

  // ✅ view 计算字段
  aging_days: number;

  // 你原本用来显示时间（还保留）
  updated_at: string;

  _photoUrls?: string[];
};

type ViewTab = "inbox" | "active" | "all";
type StatusFilter = "all" | ListingStatus;

const STATUS_OPTIONS: ListingStatus[] = [
  "New",
  "Available",
  "Follow-up",
  "Viewing",
  "Negotiating",
  "Booked",
  "Closed",
  "Inactive",
  // 若你确定不需要 Pending，可以删掉
  "Pending",
];

function statusPillClass(s: ListingStatus) {
  // 只用 tailwind 默认色系（不改你整体主题）
  switch (s) {
    case "New":
      return "bg-zinc-700 text-zinc-100";
    case "Available":
      return "bg-emerald-900/40 text-emerald-200";
    case "Follow-up":
      return "bg-amber-900/40 text-amber-200";
    case "Viewing":
      return "bg-sky-900/40 text-sky-200";
    case "Negotiating":
      return "bg-purple-900/40 text-purple-200";
    case "Booked":
      return "bg-blue-900/40 text-blue-200";
    case "Closed":
      return "bg-zinc-800 text-zinc-200";
    case "Inactive":
      return "bg-zinc-900 text-zinc-400";
    case "Pending":
      return "bg-orange-900/40 text-orange-200";
    default:
      return "bg-zinc-800 text-zinc-200";
  }
}

function formatDT(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatDateOnly(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isDueTodayOrPast(s: string | null | undefined) {
  if (!s) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  // 比到日期即可
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return b <= a;
}

export default function ListingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<WorkListing[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 新增：工作视图（Inbox / Active / All）
  const [viewTab, setViewTab] = useState<ViewTab>("all");

  const [typeTab, setTypeTab] = useState<"all" | "rent" | "sale">("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
  }, []);

  const load = async () => {
    setLoading(true);

    // ✅ 从 view 读（含 aging_days）
    const { data, error } = await supabase
      .from("listings_work")
      .select(
        "id,type,status,condo_name,area,sqft,bedrooms,bathrooms,carparks,price,furnish,updated_at,inbox,last_update,next_follow_up,priority,aging_days"
      );

    if (error || !data) {
      setLoading(false);
      return;
    }

    const rows = data as any[];
    const ids = rows.map((x) => x.id);
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

    const enriched = rows.map((x) => ({
      ...x,
      _photoUrls: (photoMap.get(x.id) ?? []).map(toUrl),
    }));

    setItems(enriched as WorkListing[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const counts = useMemo(() => {
    const inboxCount = items.filter((x) => x.inbox).length;
    const dueCount = items.filter((x) => !!x.next_follow_up && isDueTodayOrPast(x.next_follow_up)).length;
    return { inboxCount, dueCount };
  }, [items]);

  const filtered = useMemo(() => {
    const base = items.filter((x) => {
      const okView =
        viewTab === "all" ? true : viewTab === "inbox" ? x.inbox === true : x.inbox === false;

      const okType = typeTab === "all" ? true : x.type === typeTab;
      const okStatus = status === "all" ? true : x.status === status;

      return okView && okType && okStatus;
    });

    // ✅ 工作队列排序（越像“该做什么”越靠前）
    // 1) inbox 先
    // 2) follow-up 到期/越早 越前
    // 3) priority 越小越高（1=最高）
    // 4) aging_days 越大越前（越久没动越需要处理）
    const sorted = [...base].sort((a, b) => {
      // inbox first
      if (a.inbox !== b.inbox) return a.inbox ? -1 : 1;

      const aDue = a.next_follow_up ? new Date(a.next_follow_up).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.next_follow_up ? new Date(b.next_follow_up).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;

      const ap = a.priority ?? 2;
      const bp = b.priority ?? 2;
      if (ap !== bp) return ap - bp;

      const aa = a.aging_days ?? 0;
      const ba = b.aging_days ?? 0;
      if (aa !== ba) return ba - aa;

      // fallback: last_update desc
      const al = a.last_update ? new Date(a.last_update).getTime() : 0;
      const bl = b.last_update ? new Date(b.last_update).getTime() : 0;
      return bl - al;
    });

    return sorted;
  }, [items, viewTab, typeTab, status]);

  const markProcessed = async (id: string) => {
  setBusyId(id);

  // 乐观更新：立刻从 inbox 移走
  setItems((prev) => prev.map((x) => (x.id === id ? { ...x, inbox: false } : x)));

  const { error } = await supabase
    .from("listings")
    .update({
      inbox: false,
      last_update: new Date().toISOString(), // ✅ Step 3/5：任何动作都算“更新”
    })
    .eq("id", id);

  if (error) {
    // rollback
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, inbox: true } : x)));
  } else {
    await load(); // reload 保证 view/aging 正确
  }

  setBusyId(null);
};

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Listings</div>
            <div className="text-sm text-zinc-400">Your work queue (not just a list).</div>
          </div>

          <div className="flex gap-2">
            <a
  href="/listings/quick"
  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90"
>
  ⚡ Quick Add
</a>

<a
  href="/listings/new"
  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700"
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

        {/* ✅ 工作视图（Inbox/Active/All） */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-900 p-1">
            {(
              [
                { key: "inbox", label: `Inbox (${counts.inboxCount})` },
                { key: "active", label: `Active` },
                { key: "all", label: `All` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setViewTab(t.key)}
                className={`rounded-md px-3 py-1 text-sm ${
                  viewTab === t.key ? "bg-white text-black" : "text-zinc-300 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Type */}
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

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={load}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Refresh
          </button>

          {/* 小提示：follow-up 到期数量（先提醒你系统开始“催你”） */}
          {counts.dueCount > 0 ? (
            <div className="ml-auto rounded-lg bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
              {counts.dueCount} follow-up due
            </div>
          ) : (
            <div className="ml-auto text-xs text-zinc-500">—</div>
          )}
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-zinc-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-zinc-900 p-6 text-sm text-zinc-300">
            No listings here. Try switch view/status filters, or click{" "}
            <span className="font-semibold text-white">+ New</span>.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((x) => {
              const due = x.next_follow_up ? isDueTodayOrPast(x.next_follow_up) : false;
              const aging = x.aging_days ?? 0;

              return (
                <div key={x.id} className="rounded-2xl bg-zinc-900 p-4 hover:bg-zinc-800 transition">
                  <a href={`/listings/${x.id}`} className="block">
                    <PhotoCarousel urls={(x as any)._photoUrls ?? []} />

                    <div className="mt-3 text-lg font-semibold line-clamp-1">{x.condo_name}</div>
                    <div className="mt-1 text-sm text-zinc-400 line-clamp-1">{x.area ?? "—"}</div>

                    {/* Furnish */}
                    {x.furnish ? (
                      <div className="mt-2">
                        <span className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                          {x.furnish}
                        </span>
                      </div>
                    ) : null}

                    {/* Price */}
                    <div className="mt-3 text-base font-semibold text-white">
                      {x.price != null ? rm(x.price) : "—"}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {x.type === "rent" ? "/ mo" : ""}
                      </span>
                    </div>

                    {/* Specs */}
                    <div className="mt-1 text-sm text-zinc-300">
                      {x.sqft ? `${x.sqft} sqft` : "—"} • {x.bedrooms ?? "—"}R •{" "}
                      {x.bathrooms ?? "—"}B • {x.carparks ?? "—"}CP
                    </div>

                    {/* ✅ 工作信息：状态/优先级/aging/next follow-up */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-1 text-xs ${statusPillClass(x.status)}`}>
                        {x.type.toUpperCase()} • {x.status}
                      </span>

                      <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200">
                        P{x.priority ?? 2}
                      </span>

                      <span
                        className={`rounded-md px-2 py-1 text-xs ${
                          aging >= 7 ? "bg-red-900/40 text-red-200" : "bg-zinc-800 text-zinc-200"
                        }`}
                      >
                        Aging {aging}d
                      </span>

                      {x.next_follow_up ? (
                        <span
                          className={`rounded-md px-2 py-1 text-xs ${
                            due ? "bg-amber-900/40 text-amber-200" : "bg-zinc-800 text-zinc-200"
                          }`}
                        >
                          FU {formatDateOnly(x.next_follow_up)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                      <span>Last update: {formatDT(x.last_update)}</span>
                      <span>{new Date(x.updated_at).toLocaleString()}</span>
                    </div>
                  </a>

                  {/* ✅ Inbox 快捷按钮：Mark as processed */}
                  {x.inbox ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => markProcessed(x.id)}
                        disabled={busyId === x.id}
                        className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-60"
                      >
                        {busyId === x.id ? "Processing…" : "Mark as processed"}
                      </button>

                      <a
                        href={`/listings/${x.id}`}
                        className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
                      >
                        Open
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}