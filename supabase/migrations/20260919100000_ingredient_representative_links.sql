-- Reviewed catalog identities may share a representative without changing the
-- ingredient IDs already stored in recipes, shopping lists or historical data.
-- This table records that decision; it does not redirect existing reads/writes.
begin;

create table public.ingredient_representative_links (
  source_ingredient_id uuid primary key
    references public.ingredients(id) on delete restrict,
  representative_ingredient_id uuid not null
    references public.ingredients(id) on delete restrict,
  nutrition_source_item_id uuid not null
    references public.nutrition_source_items(id) on delete restrict,
  evidence_json jsonb not null
    check (jsonb_typeof(evidence_json) = 'object' and evidence_json <> '{}'::jsonb),
  decision_reason text not null check (nullif(btrim(decision_reason), '') is not null),
  reviewed_by uuid not null references public.users(id) on delete restrict,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ingredient_representative_links_no_self
    check (source_ingredient_id <> representative_ingredient_id)
);

create index ingredient_representative_links_representative_idx
  on public.ingredient_representative_links (representative_ingredient_id);

alter table public.ingredient_representative_links owner to postgres;
alter table public.ingredient_representative_links enable row level security;
revoke all on table public.ingredient_representative_links
  from public, anon, authenticated, service_role;
grant select on table public.ingredient_representative_links to service_role;
create policy ingredient_representative_links_service_read
  on public.ingredient_representative_links for select to service_role using (true);

create function public.validate_ingredient_representative_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  -- A transaction snapshot taken before another link committed could hide a
  -- new chain. Read committed refreshes the checks after the shared graph lock.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'INGREDIENT_REPRESENTATIVE_READ_COMMITTED_REQUIRED'
      using errcode = '25000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('homecook:ingredient-representative-links', 0)
  );

  if tg_op = 'UPDATE' and new.source_ingredient_id is distinct from old.source_ingredient_id then
    raise exception 'INGREDIENT_REPRESENTATIVE_SOURCE_IMMUTABLE'
      using errcode = '23514';
  end if;

  if new.source_ingredient_id = new.representative_ingredient_id then
    raise exception 'INGREDIENT_REPRESENTATIVE_SELF_LINK'
      using errcode = '23514';
  end if;

  -- Only leaves may point at a root. Prevent both A -> B -> C and C -> A -> B;
  -- this also excludes two-way and longer cycles, including concurrent writes.
  if exists (
    select 1 from public.ingredient_representative_links existing
    where existing.source_ingredient_id = new.representative_ingredient_id
       or existing.representative_ingredient_id = new.source_ingredient_id
  ) then
    raise exception 'INGREDIENT_REPRESENTATIVE_CHAIN_NOT_ALLOWED'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.nutrition_source_items item
    join public.nutrition_sources source on source.id = item.source_id
    where item.id = new.nutrition_source_item_id
      and item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ) then
    raise exception 'INGREDIENT_REPRESENTATIVE_SOURCE_NOT_APPROVED'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

alter function public.validate_ingredient_representative_link() owner to postgres;
revoke all on function public.validate_ingredient_representative_link()
  from public, anon, authenticated, service_role;

create trigger validate_ingredient_representative_link
before insert or update on public.ingredient_representative_links
for each row execute function public.validate_ingredient_representative_link();

comment on table public.ingredient_representative_links is
  'Operator-reviewed leaf-to-representative catalog evidence. Does not rewrite historical ingredient IDs or supply nutrition values.';

commit;
