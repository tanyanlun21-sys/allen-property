-- Public showcase support for listings
alter table public.listings enable row level security;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings for select
using (status IN ('Available', 'Follow-up'));

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

-- Public access to listing photos for showcase
alter table public.listing_photos enable row level security;

drop policy if exists "listing_photos_select_public" on public.listing_photos;
create policy "listing_photos_select_public"
on public.listing_photos for select
using (
  listing_id IN (
    SELECT id FROM public.listings 
    WHERE status IN ('Available', 'Follow-up')
  )
);

