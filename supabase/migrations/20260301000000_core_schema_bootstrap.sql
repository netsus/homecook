create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'social_provider_type'
  ) then
    create type public.social_provider_type as enum ('kakao', 'naver', 'google');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'recipe_source_type'
  ) then
    create type public.recipe_source_type as enum ('system', 'youtube', 'manual');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'recipe_ingredient_type'
  ) then
    create type public.recipe_ingredient_type as enum ('QUANT', 'TO_TASTE');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'meal_status_type'
  ) then
    create type public.meal_status_type as enum ('registered', 'shopping_done', 'cook_done');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'recipe_book_type'
  ) then
    create type public.recipe_book_type as enum ('my_added', 'saved', 'liked', 'custom');
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  nickname varchar(30) not null,
  email varchar(255),
  profile_image_url text,
  social_provider public.social_provider_type not null,
  social_id varchar(255) not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists users_social_unique_active
  on public.users (social_provider, social_id)
  where deleted_at is null;

create unique index if not exists users_email_unique_active
  on public.users (email)
  where deleted_at is null and email is not null;

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  standard_name varchar(100) not null unique,
  category varchar(50) not null,
  default_unit varchar(20),
  created_at timestamptz not null default now()
);

create table if not exists public.ingredient_synonyms (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  synonym varchar(100) not null,
  unique (ingredient_id, synonym)
);

create index if not exists ingredient_synonyms_synonym_idx
  on public.ingredient_synonyms (synonym);

create table if not exists public.cooking_methods (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  label varchar(5) not null,
  color_key varchar(20) not null default 'unassigned',
  is_system boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title varchar(200) not null,
  description text,
  thumbnail_url text,
  base_servings integer not null default 2,
  tags text[] not null default '{}'::text[],
  source_type public.recipe_source_type not null,
  created_by uuid references public.users(id) on delete set null,
  view_count integer not null default 0,
  like_count integer not null default 0,
  save_count integer not null default 0,
  plan_count integer not null default 0,
  cook_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_base_servings_positive check (base_servings > 0),
  constraint recipes_counts_non_negative check (
    view_count >= 0
    and like_count >= 0
    and save_count >= 0
    and plan_count >= 0
    and cook_count >= 0
  )
);

create index if not exists recipes_view_count_idx
  on public.recipes (view_count desc, id asc);

create index if not exists recipes_like_count_idx
  on public.recipes (like_count desc, id asc);

create index if not exists recipes_save_count_idx
  on public.recipes (save_count desc, id asc);

create table if not exists public.recipe_sources (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  youtube_url text,
  youtube_video_id varchar(20),
  extraction_methods text[] not null default '{}'::text[],
  extraction_meta_json jsonb not null default '{}'::jsonb,
  raw_extracted_text text
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  amount numeric(10, 2),
  unit varchar(20),
  ingredient_type public.recipe_ingredient_type not null,
  display_text varchar(200),
  sort_order integer not null default 0,
  scalable boolean not null default true,
  constraint recipe_ingredients_quant_or_to_taste check (
    (
      ingredient_type = 'QUANT'
      and amount is not null
      and amount > 0
      and unit is not null
    )
    or (
      ingredient_type = 'TO_TASTE'
      and amount is null
      and unit is null
      and scalable = false
    )
  )
);

create index if not exists recipe_ingredients_recipe_sort_idx
  on public.recipe_ingredients (recipe_id, sort_order asc);

create index if not exists recipe_ingredients_ingredient_idx
  on public.recipe_ingredients (ingredient_id, recipe_id);

create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number integer not null,
  instruction text not null,
  cooking_method_id uuid not null references public.cooking_methods(id),
  ingredients_used jsonb not null default '[]'::jsonb,
  heat_level varchar(20),
  duration_seconds integer,
  duration_text varchar(50),
  constraint recipe_steps_step_number_positive check (step_number > 0),
  constraint recipe_steps_duration_non_negative check (
    duration_seconds is null or duration_seconds >= 0
  ),
  unique (recipe_id, step_number)
);

create index if not exists recipe_steps_recipe_order_idx
  on public.recipe_steps (recipe_id, step_number asc);

create table if not exists public.meal_plan_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar(30) not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, sort_order)
);

create index if not exists meal_plan_columns_user_order_idx
  on public.meal_plan_columns (user_id, sort_order asc, id asc);

create table if not exists public.recipe_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name varchar(50) not null,
  book_type public.recipe_book_type not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recipe_books_system_unique
  on public.recipe_books (user_id, book_type)
  where book_type in ('my_added', 'saved', 'liked');

create index if not exists recipe_books_user_order_idx
  on public.recipe_books (user_id, sort_order asc, id asc);

create table if not exists public.recipe_book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.recipe_books(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (book_id, recipe_id)
);

create index if not exists recipe_book_items_recipe_idx
  on public.recipe_book_items (recipe_id);

create table if not exists public.recipe_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);

create index if not exists recipe_likes_recipe_idx
  on public.recipe_likes (recipe_id);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  plan_date date not null,
  column_id uuid not null references public.meal_plan_columns(id),
  planned_servings integer not null,
  status public.meal_status_type not null default 'registered',
  is_leftover boolean not null default false,
  leftover_dish_id uuid,
  shopping_list_id uuid,
  cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_servings_positive check (planned_servings > 0),
  constraint meals_leftover_integrity check (
    (
      is_leftover = true
      and leftover_dish_id is not null
    )
    or (
      is_leftover = false
      and leftover_dish_id is null
    )
  ),
  constraint meals_cooked_at_integrity check (
    (
      status = 'cook_done'
      and cooked_at is not null
    )
    or (
      status <> 'cook_done'
      and cooked_at is null
    )
  )
);

create index if not exists meals_user_plan_date_column_idx
  on public.meals (user_id, plan_date, column_id);

create index if not exists meals_user_plan_date_status_idx
  on public.meals (user_id, plan_date, status);

create index if not exists meals_user_status_idx
  on public.meals (user_id, status);

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant select on public.ingredients to anon, authenticated;
grant select on public.ingredient_synonyms to anon, authenticated;
grant select on public.cooking_methods to anon, authenticated;
grant select on public.recipes to anon, authenticated;
grant select on public.recipe_sources to anon, authenticated;
grant select on public.recipe_ingredients to anon, authenticated;
grant select on public.recipe_steps to anon, authenticated;
