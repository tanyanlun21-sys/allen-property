"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rm } from "@/lib/money";

type AppointmentStatus = "Pending" | "Confirmed" | "Done" | "Cancelled" | "No show";

type ListingRow = {
  id: string;
  condo_name: string;
  area: string | null;
  price: number | null;
  type: "rent" | "sale";
  owner_whatsapp: string | null;
};

type AppointmentRow = {
  id: string;
  user_id: string;
  listing_id: string | null;
  listing_id_2: string | null;
  appointment_date: string;
  appointment_time: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

const STATUSES: AppointmentStatus[] = ["Pending", "Confirmed", "Done", "Cancelled", "No show"];

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function monthKey(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function timeLabel(t?: string | null) {
  if (!t) return "--";
  const [hh, mm] = t.split(":");
  const d = new Date();
  d.setHours(Number(hh), Number(mm || 0), 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dateValue(date: string, time?: string | null) {
  return new Date(date + "T" + (time || "00:00")).getTime();
}

function statusClass(s: AppointmentStatus) {
  if (s === "Confirmed") return "border-cyan-400/35 bg-cyan-400/10 text-cyan-100";
  if (s === "Done") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (s === "Cancelled") return "border-zinc-500/30 bg-zinc-700/20 text-zinc-300";
  if (s === "No show") return "border-red-400/35 bg-red-500/10 text-red-100";
  return "border-amber-300/35 bg-amber-300/10 text-amber-100";
}

export default function AppointmentPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(isoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    listing_id: "",
    listing_id_2: "",
    appointment_date: isoDate(new Date()),
    appointment_time: "",
    tenant_name: "",
    tenant_phone: "",
    status: "Pending" as AppointmentStatus,
    notes: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (!id) window.location.href = "/";
    });
  }, []);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);

    const [y, m] = month.split("-").map(Number);
    const from = isoDate(new Date(y, m - 1, 1));
    const to = isoDate(new Date(y, m, 0));

    const { data: appts, error: apptErr } = await supabase
      .from("appointments")
      .select("id,user_id,listing_id,listing_id_2,appointment_date,appointment_time,tenant_name,tenant_phone,status,notes,created_at,updated_at")
      .eq("user_id", userId)
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (apptErr) {
      setErr(apptErr.message + " - run supabase/appointments.sql first.");
      setAppointments([]);
      setListings([]);
      setLoading(false);
      return;
    }

    const { data: ls, error: lsErr } = await supabase
      .from("listings")
      .select("id,condo_name,area,price,type,owner_whatsapp")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (lsErr) {
      setErr(lsErr.message);
      setLoading(false);
      return;
    }

    setAppointments((appts ?? []) as AppointmentRow[]);
    setListings((ls ?? []) as ListingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userId, month]);

  const listingMap = useMemo(() => new Map(listings.map((x) => [x.id, x])), [listings]);

  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    appointments.forEach((a) => {
      const list = map.get(a.appointment_date) ?? [];
      list.push(a);
      map.set(a.appointment_date, list);
    });
    return map;
  }, [appointments]);

  const calendarDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const firstDay = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m - 1, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const today = isoDate(new Date());
  const selectedAppointments = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  const todayAppointments = appointments
    .filter((a) => a.appointment_date === today)
    .sort((a, b) => dateValue(a.appointment_date, a.appointment_time) - dateValue(b.appointment_date, b.appointment_time));

  const upcomingAppointments = appointments
    .filter((a) => a.appointment_date > today && !["Done", "Cancelled"].includes(a.status))
    .sort((a, b) => dateValue(a.appointment_date, a.appointment_time) - dateValue(b.appointment_date, b.appointment_time));

  const missedPending = appointments
    .filter((a) => a.appointment_date < today && ["Pending", "Confirmed", "No show"].includes(a.status))
    .sort((a, b) => dateValue(b.appointment_date, b.appointment_time) - dateValue(a.appointment_date, a.appointment_time));

  const createAppointment = async () => {
    if (!userId) return;
    setErr(null);

    const payload = {
      user_id: userId,
      listing_id: form.listing_id || null,
      listing_id_2: form.listing_id_2 || null,
      appointment_date: form.appointment_date,
      appointment_time: form.appointment_time || null,
      tenant_name: form.tenant_name.trim() || null,
      tenant_phone: form.tenant_phone.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase.from("appointments").insert(payload);
    if (error) {
      setErr(error.message);
      return;
    }

    setForm((f) => ({ ...f, tenant_name: "", tenant_phone: "", notes: "" }));
    await load();
  };

  const appointmentCard = (a: AppointmentRow) => {
    const listing = a.listing_id ? listingMap.get(a.listing_id) : null;
    const listing2 = a.listing_id_2 ? listingMap.get(a.listing_id_2) : null;
    return (
      <div key={a.id} className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cyan-100">
              {timeLabel(a.appointment_time)} - {listing?.condo_name ?? "No linked listing"}
            </div>
            {listing2 ? (
              <div className="mt-1 text-sm font-semibold text-cyan-100/85">
                Viewing 2 - {listing2.condo_name}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-zinc-400">{a.appointment_date} - {listing?.area ?? "-"}</div>
            <div className="mt-2 text-sm text-white">
              {listing?.price != null ? rm(listing.price) : "-"}
              {listing2?.price != null ? <span className="text-zinc-400"> / {rm(listing2.price)}</span> : null}
            </div>
          </div>
          <span className={"shrink-0 rounded-full border px-3 py-1 text-xs font-semibold " + statusClass(a.status)}>{a.status}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-300 sm:grid-cols-2">
          <div>Tenant: <span className="text-white">{a.tenant_name ?? "-"}</span></div>
          <div>Phone: <span className="text-white">{a.tenant_phone ?? "-"}</span></div>
        </div>
        {a.notes ? <div className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-zinc-200">{a.notes}</div> : null}
      </div>
    );
  };

  return (
    <main className="min-h-screen text-white" style={{ background: "radial-gradient(circle at 18% 8%, rgba(34,211,238,0.075), transparent 25%), radial-gradient(circle at 75% 28%, rgba(14,116,144,0.055), transparent 28%), linear-gradient(90deg, #05090B 0%, #050607 52%, #040404 100%)" }}>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Appointment</h1>
            <p className="text-sm text-zinc-400">Monthly viewing schedule.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none" />
            <button onClick={load} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(34,211,238,0.32)]">Refresh</button>
          </div>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div> : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-400">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2">
              {calendarDays.map((d, i) => {
                const key = d ? isoDate(d) : "empty-" + i;
                const list = d ? byDate.get(key) ?? [] : [];
                const isToday = key === today;
                const isSelected = key === selectedDate;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!d}
                    onClick={() => d && setSelectedDate(key)}
                    className={
                      "min-h-28 rounded-2xl border p-2 text-left transition " +
                      (!d ? "border-transparent bg-transparent" :
                      isToday ? "border-cyan-300/60 bg-cyan-400/20 shadow-[0_0_24px_rgba(34,211,238,0.28)]" :
                      isSelected ? "border-cyan-400/45 bg-white/10" :
                      "border-white/10 bg-black/25 hover:border-cyan-400/40 hover:bg-white/8")
                    }
                  >
                    {d ? (
                      <>
                        <div className="text-sm font-bold">{d.getDate()}</div>
                        <div className="mt-2 space-y-1">
                          {list.slice(0, 3).map((a) => {
                            const listing = a.listing_id ? listingMap.get(a.listing_id) : null;
                            return (
                              <div key={a.id} className="truncate rounded-lg bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100">
                                {timeLabel(a.appointment_time)} {listing?.condo_name ?? a.tenant_name ?? "Appointment"}
                              </div>
                            );
                          })}
                          {list.length > 3 ? <div className="text-[11px] text-zinc-400">+{list.length - 3} more</div> : null}
                        </div>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
            <h2 className="text-lg font-bold">New appointment</h2>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-400">Viewing 1</div>
                <select value={form.listing_id} onChange={(e) => setForm({ ...form, listing_id: e.target.value })} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none">
                  <option value="">No linked listing</option>
                  {listings.map((x) => <option key={x.id} value={x.id}>{x.condo_name} - {x.owner_whatsapp || x.area || "-"}</option>)}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-400">Viewing 2 <span className="font-normal text-zinc-500">(optional)</span></div>
                <select value={form.listing_id_2} onChange={(e) => setForm({ ...form, listing_id_2: e.target.value })} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none">
                  <option value="">Empty</option>
                  {listings.map((x) => <option key={x.id} value={x.id}>{x.condo_name} - {x.owner_whatsapp || x.area || "-"}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none" />
                <input type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none" />
              </div>
              <input placeholder="Tenant name" value={form.tenant_name} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none" />
              <input placeholder="Tenant phone" value={form.tenant_phone} onChange={(e) => setForm({ ...form, tenant_phone: e.target.value })} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentStatus })} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-24 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 text-sm outline-none" />
              <button onClick={createAppointment} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black shadow-[0_0_24px_rgba(34,211,238,0.32)]">Add appointment</button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <h2 className="font-bold">Today Appointments</h2>
            <div className="mt-4 space-y-3">{todayAppointments.length ? todayAppointments.map(appointmentCard) : <p className="text-sm text-zinc-400">No appointment today.</p>}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <h2 className="font-bold">Upcoming Appointments</h2>
            <div className="mt-4 space-y-3">{upcomingAppointments.length ? upcomingAppointments.slice(0, 8).map(appointmentCard) : <p className="text-sm text-zinc-400">No upcoming appointment.</p>}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <h2 className="font-bold">Missed / Pending</h2>
            <div className="mt-4 space-y-3">{missedPending.length ? missedPending.slice(0, 8).map(appointmentCard) : <p className="text-sm text-zinc-400">Nothing missed.</p>}</div>
          </div>
        </section>
      </div>

      {selectedDate && selectedAppointments.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setSelectedDate(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#090d12]/95 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.8)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedDate}</h2>
                <p className="text-sm text-zinc-400">{selectedAppointments.length} appointment(s)</p>
              </div>
              <button onClick={() => setSelectedDate(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">Close</button>
            </div>
            <div className="mt-5 space-y-3">{selectedAppointments.map(appointmentCard)}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
