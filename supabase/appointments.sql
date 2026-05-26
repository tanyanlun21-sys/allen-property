create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid null references public.listings(id) on delete set null,
  appointment_date date not null,
  appointment_time time null,
  tenant_name text null,
  tenant_phone text null,
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Done', 'Cancelled', 'No show')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_user_date_idx on public.appointments(user_id, appointment_date);
create index if not exists appointments_listing_idx on public.appointments(listing_id);

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own"
on public.appointments for select
using (auth.uid() = user_id);

drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own"
on public.appointments for insert
with check (auth.uid() = user_id);

drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own"
on public.appointments for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own"
on public.appointments for delete
using (auth.uid() = user_id);