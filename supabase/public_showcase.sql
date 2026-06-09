-- Public showcase support for listings
alter table public.listings add column if not exists is_public boolean not null default false;
create index if not exists listings_is_public_idx on public.listings(is_public);

alter table public.listings enable row level security;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings for select
using (is_public = true AND status NOT IN ('Booked', 'Closed', 'Inactive'));

drop policy if exists "listings_select_own" on public.listings;
create policy "listings_select_own"
on public.listings for select
using (auth.uid() = user_id);

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own"
on public.listings for insert
with check (auth.uid() = user_id);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own"
on public.listings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own"
on public.listings for delete
using (auth.uid() = user_id);

-- Notification table for public showcase
create table if not exists public.property_showcase_notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null,
  whatsapp text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Contacted', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_showcase_notifications_listing_idx on public.property_showcase_notifications(listing_id);

alter table public.property_showcase_notifications enable row level security;

drop policy if exists "property_showcase_notifications_insert_public" on public.property_showcase_notifications;
create policy "property_showcase_notifications_insert_public"
on public.property_showcase_notifications for insert
with check (auth.role() = 'anon' AND name IS NOT NULL AND whatsapp IS NOT NULL);
