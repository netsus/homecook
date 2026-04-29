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
    cooked_at
  ) values (
    p_user_id,
    p_recipe_id,
    'leftover',
    v_now
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
