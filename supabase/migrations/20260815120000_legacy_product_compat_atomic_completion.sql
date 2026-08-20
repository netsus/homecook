-- #13 legacy-product-compat: additive authority-first legacy completion RPCs.

begin;

create or replace function private.ensure_legacy_cooking_bootstrap(
  p_owner_uuid uuid,
  p_now timestamptz
) returns void
language plpgsql volatile
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_book record;
  v_column_name text;
  v_next_sort_order integer;
begin
  if not exists (
    select 1 from public.users as app_user
    where app_user.id = p_owner_uuid and app_user.deleted_at is null
  ) then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  for v_book in
    select * from (values
      ('내가 추가한 레시피', 'my_added'::public.recipe_book_type, 'lavender', 0),
      ('저장한 레시피', 'saved'::public.recipe_book_type, 'sky', 1),
      ('좋아요한 레시피', 'liked'::public.recipe_book_type, 'coral', 2)
    ) as defaults(name, book_type, cover_color_key, sort_order)
  loop
    if not exists (
      select 1 from public.recipe_books as recipe_book
      where recipe_book.user_id = p_owner_uuid
        and recipe_book.book_type = v_book.book_type
    ) then
      select coalesce(max(recipe_book.sort_order) + 1, v_book.sort_order)
      into v_next_sort_order
      from public.recipe_books as recipe_book
      where recipe_book.user_id = p_owner_uuid;

      insert into public.recipe_books (
        id, user_id, name, book_type, cover_color_key, cover_image_url,
        sort_order, created_at, updated_at
      ) values (
        extensions.gen_random_uuid(), p_owner_uuid, v_book.name,
        v_book.book_type, v_book.cover_color_key, null,
        v_next_sort_order, p_now, p_now
      ) on conflict do nothing;
    end if;
  end loop;

  foreach v_column_name in array array['아침', '점심', '저녁']
  loop
    if not exists (
      select 1 from public.meal_plan_columns as planner_column
      where planner_column.user_id = p_owner_uuid
        and pg_catalog.btrim(planner_column.name) = v_column_name
    ) then
      select coalesce(max(planner_column.sort_order) + 1, 0)
      into v_next_sort_order
      from public.meal_plan_columns as planner_column
      where planner_column.user_id = p_owner_uuid;

      insert into public.meal_plan_columns (
        id, user_id, name, sort_order, created_at
      ) values (
        extensions.gen_random_uuid(), p_owner_uuid, v_column_name,
        v_next_sort_order, p_now
      ) on conflict do nothing;
    end if;
  end loop;

  update public.users
  set settings_json = coalesce(settings_json, '{}'::jsonb)
        || jsonb_build_object('user_bootstrap_version', 3),
      updated_at = p_now
  where id = p_owner_uuid
    and coalesce((settings_json ->> 'user_bootstrap_version')::integer, 0) < 3;
end;
$function$;

create or replace function private.complete_legacy_cooking_core(
  p_mode text,
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_session_id uuid,
  p_recipe_id uuid,
  p_cooking_servings integer,
  p_consumed_ingredient_ids uuid[],
  p_idempotency_key uuid,
  p_now timestamptz
) returns jsonb
language plpgsql volatile
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_session public.cooking_sessions%rowtype;
  v_recipe public.recipes%rowtype;
  v_recipe_owner_lifecycle_status text;
  v_recipe_id uuid;
  v_servings integer;
  v_consumed uuid[];
  v_claim jsonb;
  v_receipt_id uuid;
  v_leftover_dish_id uuid;
  v_meals_updated integer := 0;
  v_pantry_removed integer := 0;
  v_cook_count integer := 0;
  v_result jsonb;
begin
  if coalesce(
    auth.role(),
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE' using errcode = '42501';
  end if;
  if p_mode not in ('planner', 'standalone')
    or p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null or p_hmac_key_version <= 0
    or p_session_issued_at is null
    or p_consumed_ingredient_ids is null
    or p_now is null
    or (p_mode = 'planner' and (p_session_id is null or p_recipe_id is not null or p_cooking_servings is not null))
    or (p_mode = 'standalone' and (p_session_id is not null or p_recipe_id is null or p_cooking_servings is null or p_cooking_servings < 1)) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select coalesce(array_agg(ids.id order by ids.id::text collate "C"), '{}'::uuid[])
  into v_consumed
  from (
    select distinct ingredient_id as id
    from unnest(p_consumed_ingredient_ids) as consumed(ingredient_id)
  ) as ids;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );

  if p_mode = 'planner' then
    select session.* into v_session
    from public.cooking_sessions as session
    where session.id = p_session_id
    for update;
    if v_session.id is null or v_session.contract_version is distinct from 'legacy_v1' then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_session.user_id is distinct from p_owner_uuid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_session.status = 'cancelled' then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;

    select session_meal.recipe_id,
           greatest(1, coalesce(sum(session_meal.cooking_servings), 1))::integer
    into v_recipe_id, v_servings
    from public.cooking_session_meals as session_meal
    where session_meal.session_id = p_session_id
    group by session_meal.recipe_id
    order by session_meal.recipe_id::text collate "C"
    limit 1;
    if v_recipe_id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_session.status = 'in_progress' and exists (
      select 1
      from public.cooking_session_meals as session_meal
      join public.meals as meal on meal.id = session_meal.meal_id
      where session_meal.session_id = p_session_id
        and (
          meal.user_id is distinct from p_owner_uuid
          or meal.status is distinct from 'shopping_done'
        )
    ) then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;
  else
    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = p_recipe_id
    for update;
    if v_recipe.id is null or v_recipe.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_recipe.visibility = 'private'
      and v_recipe.created_by is distinct from p_owner_uuid then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_recipe.created_by is distinct from p_owner_uuid then
      select recipe_owner_lifecycle.status
      into v_recipe_owner_lifecycle_status
      from public.user_account_lifecycles as recipe_owner_lifecycle
      where recipe_owner_lifecycle.owner_uuid = v_recipe.created_by
      order by recipe_owner_lifecycle.account_generation desc
      limit 1;
      if v_recipe_owner_lifecycle_status is not null
        and v_recipe_owner_lifecycle_status is distinct from 'active' then
        raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
      end if;
    end if;
    v_recipe_id := v_recipe.id;
    v_servings := p_cooking_servings;
  end if;

  if p_idempotency_key is not null then
    v_claim := private.claim_cooked_batch_operation(
      p_owner_uuid,
      (v_authority ->> 'account_generation')::bigint,
      case p_mode
        when 'planner' then 'legacy_planner_complete'
        else 'legacy_standalone_complete'
      end,
      p_idempotency_key,
      jsonb_build_object(
        'session_id', p_session_id,
        'recipe_id', v_recipe_id,
        'cooking_servings', v_servings,
        'consumed_ingredient_ids', to_jsonb(v_consumed)
      ),
      p_now
    );
    if v_claim ? 'replay' then
      return v_claim -> 'replay';
    end if;
    v_receipt_id := (v_claim ->> 'receipt_id')::uuid;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid,
    true
  );
  perform public.bootstrap_account_generation_identity(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );
  perform private.ensure_legacy_cooking_bootstrap(p_owner_uuid, p_now);
  if p_idempotency_key is null then
    perform public.record_internal_operational_event(
      'legacy_cooking_completion_missing_idempotency_key',
      'info',
      'legacy-product-compat',
      p_owner_uuid,
      p_owner_uuid,
      case p_mode
        when 'planner' then '/api/v1/cooking/sessions/{session_id}/complete'
        else '/api/v1/cooking/standalone-complete'
      end,
      200,
      null,
      'legacy completion accepted without idempotency key',
      jsonb_build_object(
        'mode', p_mode,
        'account_generation', (v_authority ->> 'account_generation')::bigint
      )
    );
  end if;

  if p_mode = 'planner' and v_session.status = 'completed' then
    select count(*) into v_meals_updated
    from public.cooking_session_meals as session_meal
    where session_meal.session_id = p_session_id and session_meal.is_cooked;
    select coalesce(recipe.cook_count, 0) into v_cook_count
    from public.recipes as recipe where recipe.id = v_recipe_id;
    v_leftover_dish_id := p_session_id;
  else
    v_leftover_dish_id := case
      when p_mode = 'planner' then p_session_id
      else extensions.gen_random_uuid()
    end;
    insert into public.leftover_dishes (
      id, user_id, recipe_id, status, cooked_at, cooking_servings
    ) values (
      v_leftover_dish_id, p_owner_uuid, v_recipe_id, 'leftover', p_now, v_servings
    );

    delete from public.pantry_items as pantry
    where pantry.user_id = p_owner_uuid
      and pantry.ingredient_id = any(v_consumed)
      and pantry.ingredient_id in (
        select recipe_ingredient.ingredient_id
        from public.recipe_ingredients as recipe_ingredient
        where recipe_ingredient.recipe_id = v_recipe_id
      );
    get diagnostics v_pantry_removed = row_count;

    if p_mode = 'planner' then
      update public.cooking_session_meals
      set is_cooked = true, cooked_at = p_now
      where session_id = p_session_id;
      get diagnostics v_meals_updated = row_count;

      update public.meals
      set status = 'cook_done', cooked_at = p_now, updated_at = p_now
      where user_id = p_owner_uuid
        and status = 'shopping_done'
        and id in (
          select session_meal.meal_id
          from public.cooking_session_meals as session_meal
          where session_meal.session_id = p_session_id
        );
      if not found then
        raise exception 'CONFLICT' using errcode = '55000';
      end if;

      update public.cooking_sessions
      set status = 'completed', completed_at = p_now
      where id = p_session_id
        and user_id = p_owner_uuid
        and contract_version = 'legacy_v1';
      if not found then
        raise exception 'CONFLICT' using errcode = '55000';
      end if;
    end if;

    update public.recipes
    set cook_count = coalesce(cook_count, 0) + 1
    where id = v_recipe_id
    returning cook_count into v_cook_count;
  end if;

  if not exists (
    select 1 from public.user_progress_events as progress_event
    where progress_event.user_id = p_owner_uuid
      and progress_event.event_type = 'cooking_completed'
      and progress_event.source_key = 'cooking_completed:' || v_leftover_dish_id::text
  ) then
    perform private.project_cooked_batch_progress_activity(
      p_owner_uuid,
      'cooking_completed',
      v_leftover_dish_id,
      p_now
    );
  end if;

  v_result := case p_mode
    when 'planner' then jsonb_build_object(
      'session_id', p_session_id,
      'status', 'completed',
      'meals_updated', v_meals_updated,
      'leftover_dish_id', v_leftover_dish_id,
      'pantry_removed', v_pantry_removed,
      'cook_count', coalesce(v_cook_count, 0)
    )
    else jsonb_build_object(
      'leftover_dish_id', v_leftover_dish_id,
      'pantry_removed', v_pantry_removed,
      'cook_count', coalesce(v_cook_count, 0)
    )
  end;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid,
    false
  );
  if v_receipt_id is not null then
    perform private.finish_cooked_batch_operation(
      v_receipt_id,
      v_result,
      v_leftover_dish_id,
      p_now
    );
  end if;
  return v_result;
end;
$function$;

create or replace function public.complete_cooking_session(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_session_id uuid,
  p_consumed_ingredient_ids uuid[],
  p_idempotency_key uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language sql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.complete_legacy_cooking_core(
    'planner', p_owner_uuid, p_auth_identity_created_at_snapshot,
    p_session_key_hash, p_hmac_key_version, p_session_issued_at,
    p_session_id, null, null, p_consumed_ingredient_ids,
    p_idempotency_key, p_now
  );
$function$;

create or replace function public.complete_standalone_cooking(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_recipe_id uuid,
  p_cooking_servings integer,
  p_consumed_ingredient_ids uuid[],
  p_idempotency_key uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language sql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.complete_legacy_cooking_core(
    'standalone', p_owner_uuid, p_auth_identity_created_at_snapshot,
    p_session_key_hash, p_hmac_key_version, p_session_issued_at,
    null, p_recipe_id, p_cooking_servings, p_consumed_ingredient_ids,
    p_idempotency_key, p_now
  );
$function$;

-- Preserve the existing scope verifier without duplicating its allow-list.
alter function private.verify_full_local_internal_scope()
  rename to verify_full_local_internal_scope_pre_legacy_compat;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''), '{}'
  )::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'snapshot-v2-session'
    and v_method = 'POST'
    and v_path in (
      '/rpc/complete_cooking_session',
      '/rpc/complete_standalone_cooking'
    ) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_legacy_compat();
end;
$function$;

alter function private.ensure_legacy_cooking_bootstrap(uuid,timestamptz) owner to postgres;
alter function private.complete_legacy_cooking_core(text,uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,uuid[],uuid,timestamptz) owner to postgres;
alter function public.complete_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[],uuid,timestamptz) owner to postgres;
alter function public.complete_standalone_cooking(uuid,timestamptz,text,integer,timestamptz,uuid,integer,uuid[],uuid,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope_pre_legacy_compat() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;

revoke all on function private.ensure_legacy_cooking_bootstrap(uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.complete_legacy_cooking_core(text,uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,uuid[],uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.verify_full_local_internal_scope_pre_legacy_compat()
  from public, anon, authenticated, service_role;
revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

revoke all on function public.complete_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[],uuid,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[],uuid,timestamptz)
  to service_role;

revoke all on function public.complete_standalone_cooking(uuid,timestamptz,text,integer,timestamptz,uuid,integer,uuid[],uuid,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_standalone_cooking(uuid,timestamptz,text,integer,timestamptz,uuid,integer,uuid[],uuid,timestamptz)
  to service_role;

commit;
