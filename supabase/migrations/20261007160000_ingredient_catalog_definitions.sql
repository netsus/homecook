-- Public definitions describe catalog identities; they do not supply nutrition.
-- Umbrellas are broad search names, not selectable representatives for aliases.
-- Schema only: existing definitions remain NULL and no reviewed data is changed.
begin;

alter table public.ingredient_catalog_entries
  add column definition text,
  add constraint ingredient_catalog_entries_definition_check
    check (definition is null or (
      nullif(btrim(definition), '') is not null
      and char_length(definition) <= 1000
    )),
  drop constraint ingredient_catalog_entries_presentation_check,
  add constraint ingredient_catalog_entries_presentation_check
    check (presentation in ('base', 'detail', 'prepared_food', 'excluded', 'alias', 'umbrella'));

-- validate_ingredient_catalog_entry remains unchanged. Its reviewed-root and
-- incoming-alias checks allow only base/detail/prepared_food, so an umbrella
-- cannot be an alias target or replace a root that has incoming aliases.

-- CREATE OR REPLACE preserves existing owners and grants. Append the new column
-- after every existing column so dependent view contracts retain their order.
create or replace view public.ingredient_catalog_items
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
  entry.updated_at,
  entry.definition
from public.ingredients ingredient
left join public.ingredient_catalog_entries entry
  on entry.ingredient_id = ingredient.id
left join public.ingredient_catalog_groups catalog_group
  on catalog_group.id = entry.group_id;

-- Recreate every dependent projection: PostgreSQL expands SELECT * when a view
-- is defined, so replacing only ingredient_catalog_items would omit definition.
create or replace view public.ingredient_catalog_primary
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'base';

create or replace view public.ingredient_catalog_details
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'detail';

create or replace view public.ingredient_catalog_foods
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'prepared_food';

create or replace view public.ingredient_catalog_excluded
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'excluded';

create or replace view public.ingredient_catalog_aliases
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'alias';

create or replace view public.ingredient_catalog_needs_review
with (security_invoker = true)
as select * from public.ingredient_catalog_items
where review_state in ('needs_definition', 'unreviewed');

-- A reviewed umbrella has a defined broad meaning, unlike an unresolved item.
-- It belongs here, not in the base-only primary view or the needs-review queue.
create view public.ingredient_catalog_umbrellas
with (security_invoker = true)
as select * from public.ingredient_catalog_items where presentation = 'umbrella';

alter view public.ingredient_catalog_umbrellas owner to postgres;
revoke all on table public.ingredient_catalog_umbrellas
  from public, anon, authenticated, service_role;
grant select on table public.ingredient_catalog_umbrellas
  to anon, authenticated, service_role;

comment on column public.ingredient_catalog_entries.definition is
  'Public plain-language food identity definition; NULL means no definition recorded. Not private review evidence or nutrition.';
comment on view public.ingredient_catalog_umbrellas is
  'Broad search identities with their own real ingredient IDs. Never an alias target or a source of inherited nutrition.';

commit;
