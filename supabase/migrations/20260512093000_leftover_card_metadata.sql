alter table public.leftover_dishes
  add column if not exists cooking_servings integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leftover_dishes_servings_positive'
      and conrelid = 'public.leftover_dishes'::regclass
  ) then
    alter table public.leftover_dishes
      add constraint leftover_dishes_servings_positive
      check (cooking_servings > 0);
  end if;
end
$$;

create index if not exists meals_leftover_dish_cooked_idx
  on public.meals (leftover_dish_id, cooked_at desc, id desc)
  where leftover_dish_id is not null;

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
  v_cooking_servings integer := 1;
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

  select greatest(1, coalesce(sum(cooking_servings), 1))
    into v_cooking_servings
    from public.cooking_session_meals
    where session_id = p_session_id;

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
    cooked_at,
    cooking_servings
  ) values (
    p_session_id,
    p_user_id,
    v_recipe_id,
    'leftover',
    v_now,
    v_cooking_servings
  )
  on conflict (id) do nothing;

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

grant execute on function public.complete_cooking_session(uuid, uuid, uuid[]) to authenticated, service_role;

create or replace function public.complete_standalone_cooking(
  p_recipe_id uuid,
  p_user_id uuid,
  p_cooking_servings integer,
  p_consumed_ingredient_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leftover_dish_id uuid;
  v_pantry_removed integer := 0;
  v_cook_count integer := 0;
  v_now timestamptz := now();
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object(
      'error_code', 'FORBIDDEN',
      'message', '내 요리 기록만 완료할 수 있어요.'
    );
  end if;

  if p_cooking_servings < 1 then
    return jsonb_build_object(
      'error_code', 'VALIDATION_ERROR',
      'message', '요리 인분을 확인해주세요.'
    );
  end if;

  if not exists (
    select 1
    from public.recipes
    where id = p_recipe_id
  ) then
    return jsonb_build_object(
      'error_code', 'RESOURCE_NOT_FOUND',
      'message', '레시피를 찾을 수 없어요.'
    );
  end if;

  insert into public.leftover_dishes (
    user_id,
    recipe_id,
    status,
    cooked_at,
    cooking_servings
  ) values (
    p_user_id,
    p_recipe_id,
    'leftover',
    v_now,
    p_cooking_servings
  )
  returning id into v_leftover_dish_id;

  delete from public.pantry_items
    where user_id = p_user_id
      and ingredient_id = any(coalesce(p_consumed_ingredient_ids, '{}'))
      and ingredient_id in (
        select ingredient_id
        from public.recipe_ingredients
        where recipe_id = p_recipe_id
      );
  get diagnostics v_pantry_removed = row_count;

  update public.recipes
    set cook_count = coalesce(cook_count, 0) + 1
    where id = p_recipe_id
    returning cook_count into v_cook_count;

  return jsonb_build_object(
    'leftover_dish_id', v_leftover_dish_id,
    'pantry_removed', v_pantry_removed,
    'cook_count', coalesce(v_cook_count, 0)
  );
end;
$$;

grant execute on function public.complete_standalone_cooking(uuid, uuid, integer, uuid[]) to authenticated, service_role;
