-- Allow bedroom values like "1+1" while preserving existing Studio/number data.
-- listings_work depends on bedrooms, so temporarily recreate the view around the column change.
do $$
declare
  listings_work_sql text;
begin
  select pg_get_viewdef('public.listings_work'::regclass, true)
  into listings_work_sql;

  execute 'drop view public.listings_work';

  execute $alter$
    alter table public.listings
    alter column bedrooms type text
    using case
      when bedrooms is null then null
      else bedrooms::text
    end
  $alter$;

  execute 'create view public.listings_work as ' || listings_work_sql;
end $$;

grant select on public.listings_work to anon, authenticated;
