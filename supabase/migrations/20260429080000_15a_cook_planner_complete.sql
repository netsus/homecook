do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'leftover_dish_status_type'
  ) then
    create type public.leftover_dish_status_type as enum ('leftover', 'eaten');
  end if;
end
$$;

create table if not exists public.leftover_dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  status public.leftover_dish_status_type not null default 'leftover',
  cooked_at timestamptz not null,
  eaten_at timestamptz,
  auto_hide_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leftover_dishes_status_time_integrity check (
    (
      status = 'eaten'
      and eaten_at is not null
      and auto_hide_at is not null
    )
    or (
      status = 'leftover'
      and eaten_at is null
      and auto_hide_at is null
    )
  )
);

create index if not exists leftover_dishes_user_status_cooked_idx
  on public.leftover_dishes (user_id, status, cooked_at desc);

alter table public.leftover_dishes enable row level security;

drop policy if exists leftover_dishes_select_own on public.leftover_dishes;
create policy leftover_dishes_select_own
  on public.leftover_dishes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists leftover_dishes_insert_own on public.leftover_dishes;
create policy leftover_dishes_insert_own
  on public.leftover_dishes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists leftover_dishes_update_own on public.leftover_dishes;
create policy leftover_dishes_update_own
  on public.leftover_dishes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meals_leftover_dish_id_fkey'
      and conrelid = 'public.meals'::regclass
  ) then
    alter table public.meals
      add constraint meals_leftover_dish_id_fkey
      foreign key (leftover_dish_id)
      references public.leftover_dishes(id);
  end if;
end
$$;

create or replace function public.complete_cooking_session(
  p_session_id uuid,
  p_user_id uuid,
  p_consumed_ingredient_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cooking_sessions%rowtype;
  v_recipe_id uuid;
  v_meals_updated integer := 0;
  v_pantry_removed integer := 0;
  v_cook_count integer := 0;
  v_now timestamptz := now();
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 요리 세션만 완료할 수 있어요.'
    );
  end if;

  select *
    into v_session
    from public.cooking_sessions
    where id = p_session_id
    for update;

  if not found then
    return jsonb_build_object(
      'error_code', 'RESOURCE_NOT_FOUND',
      'message', '요리 세션을 찾을 수 없어요.'
    );
  end if;

  if v_session.user_id <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 요리 세션만 완료할 수 있어요.'
    );
  end if;

  select recipe_id
    into v_recipe_id
    from public.cooking_session_meals
    where session_id = p_session_id
    order by id
    limit 1;

  if v_recipe_id is null then
    return jsonb_build_object(
      'error_code', 'RESOURCE_NOT_FOUND',
      'message', '요리 세션에 연결된 식사를 찾을 수 없어요.'
    );
  end if;

  if v_session.status = 'cancelled' then
    return jsonb_build_object(
      'error_code', 'CONFLICT',
      'message', '취소된 요리 세션은 완료할 수 없어요.'
    );
  end if;

  if v_session.status = 'completed' then
    select count(*)
      into v_meals_updated
      from public.cooking_session_meals
      where session_id = p_session_id
        and is_cooked = true;

    select coalesce(cook_count, 0)
      into v_cook_count
      from public.recipes
      where id = v_recipe_id;

    return jsonb_build_object(
      'session_id', p_session_id,
      'status', 'completed',
      'meals_updated', v_meals_updated,
      'leftover_dish_id', p_session_id,
      'pantry_removed', 0,
      'cook_count', coalesce(v_cook_count, 0)
    );
  end if;

  if exists (
    select 1
    from public.cooking_session_meals csm
    join public.meals m on m.id = csm.meal_id
    where csm.session_id = p_session_id
      and m.status <> 'shopping_done'
  ) then
    return jsonb_build_object(
      'error_code', 'CONFLICT',
      'message', '장보기가 완료된 식사만 요리 완료할 수 있어요.'
    );
  end if;

  insert into public.leftover_dishes (
    id,
    user_id,
    recipe_id,
    status,
    cooked_at
  ) values (
    p_session_id,
    p_user_id,
    v_recipe_id,
    'leftover',
    v_now
  )
  on conflict (id) do nothing;

  -- The completion checklist is recipe-derived; keep direct RPC callers
  -- from deleting unrelated pantry rows by intersecting with recipe ingredients.
  delete from public.pantry_items
    where user_id = p_user_id
      and ingredient_id = any(coalesce(p_consumed_ingredient_ids, '{}'))
      and ingredient_id in (
        select ingredient_id
        from public.recipe_ingredients
        where recipe_id = v_recipe_id
      );
  get diagnostics v_pantry_removed = row_count;

  update public.cooking_session_meals
    set is_cooked = true,
        cooked_at = v_now
    where session_id = p_session_id;
  get diagnostics v_meals_updated = row_count;

  update public.meals
    set status = 'cook_done',
        cooked_at = v_now,
        updated_at = v_now
    where id in (
      select meal_id
      from public.cooking_session_meals
      where session_id = p_session_id
    );

  update public.cooking_sessions
    set status = 'completed',
        completed_at = v_now
    where id = p_session_id;

  update public.recipes
    set cook_count = coalesce(cook_count, 0) + 1
    where id = v_recipe_id
    returning cook_count into v_cook_count;

  return jsonb_build_object(
    'session_id', p_session_id,
    'status', 'completed',
    'meals_updated', v_meals_updated,
    'leftover_dish_id', p_session_id,
    'pantry_removed', v_pantry_removed,
    'cook_count', coalesce(v_cook_count, 0)
  );
end;
$$;

grant select, insert, update on public.leftover_dishes to authenticated;
grant all privileges on public.leftover_dishes to service_role;
grant execute on function public.complete_cooking_session(uuid, uuid, uuid[]) to authenticated, service_role;
