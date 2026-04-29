do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'cooking_session_status_type'
  ) then
    create type public.cooking_session_status_type as enum ('in_progress', 'completed', 'cancelled');
  end if;
end
$$;

create table if not exists public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status public.cooking_session_status_type not null default 'in_progress',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cooking_sessions_completed_at_integrity check (
    (
      status = 'completed'
      and completed_at is not null
    )
    or (
      status <> 'completed'
      and completed_at is null
    )
  )
);

create index if not exists cooking_sessions_user_status_idx
  on public.cooking_sessions (user_id, status, created_at desc);

create table if not exists public.cooking_session_meals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  cooking_servings integer not null,
  is_cooked boolean not null default false,
  cooked_at timestamptz,
  unique (session_id, meal_id),
  constraint cooking_session_meals_servings_positive check (cooking_servings > 0),
  constraint cooking_session_meals_cooked_at_integrity check (
    (
      is_cooked = true
      and cooked_at is not null
    )
    or (
      is_cooked = false
      and cooked_at is null
    )
  )
);

create index if not exists cooking_session_meals_session_recipe_idx
  on public.cooking_session_meals (session_id, recipe_id);

create index if not exists cooking_session_meals_meal_idx
  on public.cooking_session_meals (meal_id);

grant all privileges on public.cooking_sessions to service_role;
grant all privileges on public.cooking_session_meals to service_role;
