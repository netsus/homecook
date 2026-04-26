create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title varchar(100) not null,
  date_range_start date not null,
  date_range_end date not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shopping_lists_date_range_order check (date_range_start <= date_range_end),
  constraint shopping_lists_completed_at_integrity check (
    (
      is_completed = true
      and completed_at is not null
    )
    or (
      is_completed = false
      and completed_at is null
    )
  )
);

create index if not exists shopping_lists_user_completed_created_idx
  on public.shopping_lists (user_id, is_completed, created_at desc);

create table if not exists public.shopping_list_recipes (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  shopping_servings integer not null,
  planned_servings_total integer not null,
  constraint shopping_list_recipes_servings_positive check (
    shopping_servings > 0
    and planned_servings_total > 0
  ),
  unique (shopping_list_id, recipe_id)
);

create index if not exists shopping_list_recipes_list_idx
  on public.shopping_list_recipes (shopping_list_id);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  display_text varchar(200) not null,
  amounts_json jsonb not null,
  is_pantry_excluded boolean not null default false,
  is_checked boolean not null default false,
  added_to_pantry boolean not null default false,
  sort_order integer not null default 0,
  constraint shopping_list_items_sort_order_non_negative check (sort_order >= 0),
  constraint shopping_list_items_added_to_pantry_integrity check (
    added_to_pantry = false
    or (
      is_checked = true
      and is_pantry_excluded = false
    )
  ),
  unique (shopping_list_id, ingredient_id)
);

create index if not exists shopping_list_items_list_sort_idx
  on public.shopping_list_items (shopping_list_id, sort_order asc, id asc);

create index if not exists shopping_list_items_list_pantry_excluded_idx
  on public.shopping_list_items (shopping_list_id, is_pantry_excluded);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meals_shopping_list_id_fkey'
  ) then
    alter table public.meals
      add constraint meals_shopping_list_id_fkey
      foreign key (shopping_list_id)
      references public.shopping_lists(id)
      on delete set null;
  end if;
end
$$;

create index if not exists meals_shopping_list_id_idx
  on public.meals (shopping_list_id);

grant all privileges on public.shopping_lists to service_role;
grant all privileges on public.shopping_list_recipes to service_role;
grant all privileges on public.shopping_list_items to service_role;
