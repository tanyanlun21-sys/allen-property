-- Run this once in Supabase SQL Editor.
-- Adds manual income rows and handover-date based income reporting.

alter table public.deals
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists deal_title text,
  add column if not exists deal_type text check (deal_type in ('rent', 'sale')),
  add column if not exists handover_date date;

update public.deals
set id = gen_random_uuid()
where id is null;

alter table public.deals
  alter column id set not null;

alter table public.deals
  alter column listing_id drop not null;

do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.deals'::regclass
    and contype = 'p';

  if pk_name is not null then
    execute format('alter table public.deals drop constraint %I', pk_name);
  end if;
end $$;

alter table public.deals
  add constraint deals_pkey primary key (id);

create unique index if not exists deals_listing_id_unique
  on public.deals (listing_id);

create index if not exists deals_handover_date_idx
  on public.deals (handover_date);
