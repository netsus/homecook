-- Public catalog organization is metadata, not a replacement ingredient identity.
-- This migration creates the schema only. Reviewed data is loaded separately.
-- Existing nutrition, historical references, writers and 26-ID selection policy
-- remain unchanged. Private review evidence stays in the existing audit records.
begin;

create table public.ingredient_catalog_groups (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (nullif(btrim(category), '') is not null and char_length(category) <= 100),
  name text not null
    check (nullif(btrim(name), '') is not null and char_length(name) <= 200),
  sort_order integer not null default 0 check (sort_order >= 0),
  constraint ingredient_catalog_groups_category_name_key unique (category, name)
);

-- The existing reviewed relation remains authoritative. This composite key
-- supports a public projection without exposing its private evidence or actor.
alter table public.ingredient_representative_links
  add constraint ingredient_representative_links_source_representative_key
  unique (source_ingredient_id, representative_ingredient_id);

create table public.ingredient_catalog_entries (
  ingredient_id uuid primary key
    references public.ingredients(id) on update restrict on delete restrict,
  group_id uuid not null
    references public.ingredient_catalog_groups(id) on update restrict on delete restrict,
  display_name text not null
    check (nullif(btrim(display_name), '') is not null and char_length(display_name) <= 200),
  presentation text not null
    check (presentation in ('base', 'detail', 'prepared_food', 'excluded', 'alias')),
  review_state text not null
    check (review_state in ('reviewed', 'needs_definition')),
  retain_dimensions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(retain_dimensions) = 'array'
      and not jsonb_path_exists(retain_dimensions, '$[*] ? (@.type() != "string")')),
  representative_ingredient_id uuid
    references public.ingredient_catalog_entries(ingredient_id)
    on update restrict on delete restrict,
  review_version text not null
    check (nullif(btrim(review_version), '') is not null and char_length(review_version) <= 200),
  updated_at timestamptz not null default now(),
  constraint ingredient_catalog_entries_alias_projection_check
    check ((presentation = 'alias') = (representative_ingredient_id is not null)),
  constraint ingredient_catalog_entries_no_self
    check (ingredient_id <> representative_ingredient_id),
  constraint ingredient_catalog_entries_authoritative_representative_fk
    foreign key (ingredient_id, representative_ingredient_id)
    references public.ingredient_representative_links
      (source_ingredient_id, representative_ingredient_id)
    on update restrict on delete restrict
);

create index ingredient_catalog_entries_group_idx
  on public.ingredient_catalog_entries (group_id);
create index ingredient_catalog_entries_representative_idx
  on public.ingredient_catalog_entries (representative_ingredient_id)
  where representative_ingredient_id is not null;

alter table public.ingredient_catalog_groups owner to postgres;
alter table public.ingredient_catalog_entries owner to postgres;
alter table public.ingredient_catalog_groups enable row level security;
alter table public.ingredient_catalog_entries enable row level security;
revoke all on table public.ingredient_catalog_groups, public.ingredient_catalog_entries
  from public, anon, authenticated, service_role;
grant select on table public.ingredient_catalog_groups, public.ingredient_catalog_entries
  to anon, authenticated, service_role;
create policy ingredient_catalog_groups_public_read
  on public.ingredient_catalog_groups for select to anon, authenticated, service_role
  using (true);
create policy ingredient_catalog_entries_public_read
  on public.ingredient_catalog_entries for select to anon, authenticated, service_role
  using (true);

create function public.validate_ingredient_catalog_entry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $function$
begin
  -- Share the authoritative relation's graph lock and isolation contract.
  -- READ COMMITTED makes checks after a wait see newly committed alias entries.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'INGREDIENT_CATALOG_READ_COMMITTED_REQUIRED'
      using errcode = '25000';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('homecook:ingredient-representative-links', 0)
  );

  if tg_op = 'UPDATE' and new.ingredient_id is distinct from old.ingredient_id then
    raise exception 'INGREDIENT_CATALOG_ID_IMMUTABLE'
      using errcode = '23514';
  end if;

  if new.presentation = 'alias' then
    -- The composite FK requires an authoritative link; its existing trigger
    -- prevents representative chains/cycles. The target must also be a reviewed
    -- selectable catalog entry. Insert these root entries before aliases.
    if not exists (
      select 1 from public.ingredient_catalog_entries representative
      where representative.ingredient_id = new.representative_ingredient_id
        and representative.presentation in ('base', 'detail', 'prepared_food')
        and representative.review_state = 'reviewed'
        and representative.representative_ingredient_id is null
    ) then
      raise exception 'INGREDIENT_CATALOG_REPRESENTATIVE_NOT_REVIEWED_ROOT'
        using errcode = '23514';
    end if;
  end if;

  -- A root with incoming aliases cannot become excluded, another alias, or
  -- unresolved. The self-FK separately prevents deleting that root entry.
  if new.presentation not in ('base', 'detail', 'prepared_food')
     or new.review_state <> 'reviewed' then
    if exists (
      select 1 from public.ingredient_catalog_entries incoming
      where incoming.representative_ingredient_id = new.ingredient_id
    ) then
      raise exception 'INGREDIENT_CATALOG_REFERENCED_ROOT_MUST_STAY_REVIEWED'
        using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

alter function public.validate_ingredient_catalog_entry() owner to postgres;
revoke all on function public.validate_ingredient_catalog_entry()
  from public, anon, authenticated, service_role;
create trigger validate_ingredient_catalog_entry
before insert or update on public.ingredient_catalog_entries
for each row execute function public.validate_ingredient_catalog_entry();

-- Views join only public metadata; they do not require access to private review
-- evidence. ingredient_id is always the real ingredients.id; group_id is only
-- a navigation key and must never be persisted as a selected ingredient ID.
create view public.ingredient_catalog_items
with (security_invoker = true)
as
select
  ingredient.id as ingredient_id,
  ingredient.standard_name,
  ingredient.category,
  ingredient.category_code,
  ingredient.default_unit,
  coalesce(entry.display_name, ingredient.standard_name) as display_name,
  entry.group_id,
  catalog_group.name as group_name,
  catalog_group.category as group_category,
  catalog_group.sort_order as group_sort_order,
  coalesce(entry.presentation, 'base') as presentation,
  coalesce(entry.review_state, 'unreviewed') as review_state,
  coalesce(entry.retain_dimensions, '[]'::jsonb) as retain_dimensions,
  entry.representative_ingredient_id,
  entry.review_version,
  entry.updated_at
from public.ingredients ingredient
left join public.ingredient_catalog_entries entry
  on entry.ingredient_id = ingredient.id
left join public.ingredient_catalog_groups catalog_group
  on catalog_group.id = entry.group_id;

-- Unclassified new ingredients remain visible as base/unreviewed. A reviewed
-- presentation of base with needs_definition also remains in primary results.
create view public.ingredient_catalog_primary
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'base';

create view public.ingredient_catalog_details
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'detail';

create view public.ingredient_catalog_foods
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'prepared_food';

create view public.ingredient_catalog_excluded
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'excluded';

create view public.ingredient_catalog_aliases
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'alias';

create view public.ingredient_catalog_needs_review
with (security_invoker = true)
as select * from public.ingredient_catalog_items
where review_state in ('needs_definition', 'unreviewed');

alter view public.ingredient_catalog_items owner to postgres;
alter view public.ingredient_catalog_primary owner to postgres;
alter view public.ingredient_catalog_details owner to postgres;
alter view public.ingredient_catalog_foods owner to postgres;
alter view public.ingredient_catalog_excluded owner to postgres;
alter view public.ingredient_catalog_aliases owner to postgres;
alter view public.ingredient_catalog_needs_review owner to postgres;
revoke all on table
  public.ingredient_catalog_items,
  public.ingredient_catalog_primary,
  public.ingredient_catalog_details,
  public.ingredient_catalog_foods,
  public.ingredient_catalog_excluded,
  public.ingredient_catalog_aliases,
  public.ingredient_catalog_needs_review
  from public, anon, authenticated, service_role;
grant select on table
  public.ingredient_catalog_items,
  public.ingredient_catalog_primary,
  public.ingredient_catalog_details,
  public.ingredient_catalog_foods,
  public.ingredient_catalog_excluded,
  public.ingredient_catalog_aliases,
  public.ingredient_catalog_needs_review
  to anon, authenticated, service_role;

comment on table public.ingredient_catalog_groups is
  'Public navigation groups, not selectable ingredient identities. No nutrition or private review evidence.';
comment on table public.ingredient_catalog_entries is
  'Public reviewed organization of existing ingredient IDs. Representative projection is constrained to the authoritative private relation.';
comment on view public.ingredient_catalog_items is
  'Safe public ingredient metadata with base/unreviewed fallback for ingredients not yet classified. Does not redirect IDs or nutrition.';

commit;
