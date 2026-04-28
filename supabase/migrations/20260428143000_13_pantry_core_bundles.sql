create table if not exists public.ingredient_bundles (
  id uuid primary key default gen_random_uuid(),
  name varchar(50) not null,
  display_order integer not null default 0
);

create index if not exists ingredient_bundles_display_order_idx
  on public.ingredient_bundles (display_order asc, id asc);

create table if not exists public.ingredient_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.ingredient_bundles(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  unique (bundle_id, ingredient_id)
);

create index if not exists ingredient_bundle_items_bundle_idx
  on public.ingredient_bundle_items (bundle_id);

create index if not exists ingredient_bundle_items_ingredient_idx
  on public.ingredient_bundle_items (ingredient_id);

grant select on public.ingredient_bundles to anon, authenticated;
grant select on public.ingredient_bundle_items to anon, authenticated;
grant all privileges on public.ingredient_bundles to service_role;
grant all privileges on public.ingredient_bundle_items to service_role;
