begin;

-- Only succeeded jobs may refresh their recorded current-recipe queue. A shared
-- lock keeps disable/ack changes from racing this single RPC transaction.
create function private.require_ingredient_ai_recipe_refresh(p_job_id uuid, p_recipe_id uuid)
returns void language plpgsql security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform 1 from private.ingredient_ai_nutrition_settings
  where singleton and enabled for share;
  if not found then
    raise exception 'AI_NUTRITION_DISABLED' using errcode = '55000';
  end if;
  perform 1 from private.ingredient_ai_nutrition_jobs
  where id = p_job_id and status = 'succeeded'
    and p_recipe_id = any(pending_recipe_ids)
  for share;
  if not found then
    raise exception 'AI_NUTRITION_REFRESH_NOT_PENDING' using errcode = 'P0002';
  end if;
end;
$function$;

-- Whitelist only the source fields consumed by the existing JS predecessor
-- reader, not reviewer identities, raw observations or storage metadata.
create function private.ingredient_ai_recipe_refresh_source(p_source nutrition_sources)
returns jsonb language sql immutable security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'id', p_source.id, 'provider_code', p_source.provider_code,
    'dataset_name', p_source.dataset_name, 'source_version', p_source.source_version,
    'data_basis_date', p_source.data_basis_date, 'license_name', p_source.license_name,
    'source_url', p_source.source_url, 'review_status', p_source.review_status,
    'freshness_status', p_source.freshness_status, 'is_active', p_source.is_active
  );
$function$;

create function public.get_ingredient_ai_recipe_refresh_input(p_job_id uuid, p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_recipe public.recipes%rowtype;
  v_ids uuid[];
  v_ingredients jsonb;
  v_nutrition jsonb;
  v_conversions jsonb;
  v_pieces jsonb;
  v_product_pins jsonb;
  v_product_predecessors jsonb;
begin
  perform private.require_ingredient_ai_scope('get_ingredient_ai_recipe_refresh_input');
  perform private.require_ingredient_ai_recipe_refresh(p_job_id, p_recipe_id);
  perform public.lock_recipe_nutrition_recipe_ids(array[p_recipe_id]);
  select * into v_recipe from public.recipes
  where id = p_recipe_id and deleted_at is null for share;
  if not found then raise exception 'RECIPE_NOT_FOUND' using errcode = 'P0002'; end if;
  if (select count(*) from public.recipe_ingredients where recipe_id = p_recipe_id) > 200 then
    raise exception 'AI_NUTRITION_REFRESH_INPUT_TOO_LARGE' using errcode = '22023';
  end if;
  select array_agg(distinct ingredient_id order by ingredient_id)
  into v_ids from public.recipe_ingredients where recipe_id = p_recipe_id;
  perform public.lock_recipe_nutrition_ingredient_ids(v_ids, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ingredient.id, 'recipe_id', ingredient.recipe_id,
    'ingredient_id', ingredient.ingredient_id, 'amount', ingredient.amount,
    'unit', ingredient.unit, 'ingredient_type', ingredient.ingredient_type,
    'scalable', ingredient.scalable, 'sort_order', ingredient.sort_order,
    'food_product_id', ingredient.food_product_id,
    'food_product_nutrition_version_id', ingredient.food_product_nutrition_version_id
  ) order by ingredient.sort_order, ingredient.id), '[]'::jsonb)
  into v_ingredients from public.recipe_ingredients ingredient
  where ingredient.recipe_id = p_recipe_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', link.id, 'ingredient_id', link.ingredient_id,
    'nutrition_profile_id', link.nutrition_profile_id,
    'preparation_state', link.preparation_state, 'review_status', link.review_status,
    'is_active', link.is_active, 'is_primary', link.is_primary,
    'nutrition_profiles', jsonb_build_object(
      'id', profile.id, 'source_item_id', profile.source_item_id,
      'profile_kind', profile.profile_kind, 'normalization_method', profile.normalization_method,
      'basis_amount', profile.basis_amount, 'basis_unit', profile.basis_unit,
      'review_status', profile.review_status, 'is_active', profile.is_active,
      'nutrition_values', coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', value.profile_id, 'nutrient_code', value.nutrient_code,
          'amount', value.amount, 'value_status', value.value_status
        ) order by value.nutrient_code collate "C")
        from public.nutrition_values value where value.profile_id = profile.id
      ), '[]'::jsonb),
      'nutrition_source_items', jsonb_build_object(
        'id', item.id, 'source_id', item.source_id, 'review_status', item.review_status,
        'nutrition_sources', private.ingredient_ai_recipe_refresh_source(source)
      )
    )
  ) order by link.id), '[]'::jsonb)
  into v_nutrition
  from public.ingredient_nutrition_profiles link
  join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
  join public.nutrition_source_items item on item.id = profile.source_item_id
  join public.nutrition_sources source on source.id = item.source_id
  where link.ingredient_id = any(v_ids) and link.review_status = 'approved'
    and link.is_active and link.is_primary;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assignment.id, 'ingredient_id', assignment.ingredient_id,
    'conversion_profile_id', assignment.conversion_profile_id, 'evidence_id', assignment.evidence_id,
    'preparation_state', assignment.preparation_state,
    'review_status', assignment.review_status, 'is_active', assignment.is_active,
    'measurement_conversion_profiles', jsonb_build_object(
      'id', profile.id, 'code', profile.code, 'basis_volume_ml', profile.basis_volume_ml,
      'representative_weight_g', profile.representative_weight_g, 'is_active', profile.is_active
    ),
    'measurement_source_evidence', jsonb_build_object(
      'id', evidence.id, 'source_id', evidence.source_id, 'evidence_kind', evidence.evidence_kind,
      'preparation_state', evidence.preparation_state,
      'normalized_g_per_15ml', evidence.normalized_g_per_15ml,
      'review_status', evidence.review_status, 'is_active', evidence.is_active,
      'nutrition_sources', private.ingredient_ai_recipe_refresh_source(source)
    )
  ) order by assignment.id), '[]'::jsonb)
  into v_conversions
  from public.ingredient_conversion_assignments assignment
  join public.measurement_conversion_profiles profile on profile.id = assignment.conversion_profile_id
  join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
  join public.nutrition_sources source on source.id = evidence.source_id
  where assignment.ingredient_id = any(v_ids)
    and assignment.review_status = 'approved' and assignment.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', piece.id, 'ingredient_id', piece.ingredient_id, 'evidence_id', piece.evidence_id,
    'size_code', piece.size_code, 'preparation_state', piece.preparation_state,
    'weight_g', piece.weight_g, 'review_status', piece.review_status, 'is_active', piece.is_active,
    'measurement_source_evidence', jsonb_build_object(
      'id', evidence.id, 'source_id', evidence.source_id, 'evidence_kind', evidence.evidence_kind,
      'preparation_state', evidence.preparation_state, 'size_code', evidence.size_code,
      'review_status', evidence.review_status, 'is_active', evidence.is_active,
      'nutrition_sources', private.ingredient_ai_recipe_refresh_source(source)
    )
  ) order by piece.id), '[]'::jsonb)
  into v_pieces
  from public.piece_unit_weights piece
  join public.measurement_source_evidence evidence on evidence.id = piece.evidence_id
  join public.nutrition_sources source on source.id = evidence.source_id
  where piece.ingredient_id = any(v_ids) and piece.review_status = 'approved' and piece.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', row -> 'id', 'ingredient_id', row -> 'ingredient_id',
    'food_product_id', row -> 'food_product_id',
    'food_product_nutrition_version_id', row -> 'food_product_nutrition_version_id'
  ) order by ordinality), '[]'::jsonb)
  into v_product_pins
  from jsonb_array_elements(v_ingredients) with ordinality as ingredients(row, ordinality)
  where row ->> 'food_product_id' is not null or row ->> 'food_product_nutrition_version_id' is not null;
  -- Reuse the product owner's visibility check and the exact pinned version.
  -- This is an internal function call, not a newly allowed service REST route.
  v_product_predecessors := public.read_recipe_product_nutrition_predecessors(v_recipe.created_by, v_product_pins);

  return jsonb_build_object(
    'job_id', p_job_id, 'recipe_id', p_recipe_id,
    'recipe', jsonb_build_object('id', v_recipe.id, 'base_servings', v_recipe.base_servings,
      'updated_at', v_recipe.updated_at, 'created_by', v_recipe.created_by),
    'recipe_ingredients', v_ingredients,
    'ingredient_nutrition_profiles', v_nutrition,
    'ingredient_conversion_assignments', v_conversions,
    'piece_unit_weights', v_pieces, 'product_predecessors', v_product_predecessors,
    'input_guard', public.build_recipe_nutrition_input_guard(p_recipe_id)
  );
end;
$function$;

create function public.write_ingredient_ai_recipe_refresh(
  p_job_id uuid, p_recipe_id uuid, p_snapshot jsonb,
  p_expected_recipe_updated_at timestamptz, p_input_guard jsonb
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_result jsonb;
  v_previous_writer text := current_setting('homecook.recipe_nutrition_writer', true);
begin
  perform private.require_ingredient_ai_scope('write_ingredient_ai_recipe_refresh');
  perform private.require_ingredient_ai_recipe_refresh(p_job_id, p_recipe_id);
  perform public.lock_recipe_nutrition_recipe_ids(array[p_recipe_id]);
  perform 1 from public.recipes where id = p_recipe_id and deleted_at is null for share;
  if not found then raise exception 'RECIPE_NOT_FOUND' using errcode = 'P0002'; end if;
  begin
    -- Delegate the CAS guard, source equality, immutable vectors and deterministic
    -- idempotent write to the existing writer. No historical or product pin edit.
    perform set_config('homecook.recipe_nutrition_writer', 'on', true);
    v_result := public.write_recipe_nutrition_snapshot(
      p_recipe_id, p_snapshot, p_expected_recipe_updated_at, p_input_guard
    );
    perform set_config('homecook.recipe_nutrition_writer', coalesce(v_previous_writer, ''), true);
  exception when others then
    perform set_config('homecook.recipe_nutrition_writer', coalesce(v_previous_writer, ''), true);
    raise;
  end;
  -- Only the runner's existing acknowledge RPC removes pending recipe IDs.
  return v_result;
end;
$function$;

-- Add exactly two POST routes; the previous scope wrapper keeps all other rules.
alter function private.verify_full_local_internal_scope()
  rename to verify_scope_pre_ai_refresh_20261008;
create function private.verify_full_local_internal_scope()
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if auth.role() = 'service_role'
    and coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
      ->> 'x-homecook-internal-scope' = 'ingredient-ai-nutrition'
    and upper(coalesce(current_setting('request.method', true), '')) = 'POST'
    and current_setting('request.path', true) in (
      '/rpc/get_ingredient_ai_recipe_refresh_input', '/rpc/write_ingredient_ai_recipe_refresh'
    ) then return; end if;
  perform private.verify_scope_pre_ai_refresh_20261008();
end;
$function$;

alter function private.require_ingredient_ai_recipe_refresh(uuid,uuid) owner to postgres;
alter function private.ingredient_ai_recipe_refresh_source(nutrition_sources) owner to postgres;
alter function public.get_ingredient_ai_recipe_refresh_input(uuid,uuid) owner to postgres;
alter function public.write_ingredient_ai_recipe_refresh(uuid,uuid,jsonb,timestamptz,jsonb) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.require_ingredient_ai_recipe_refresh(uuid,uuid),
  private.ingredient_ai_recipe_refresh_source(nutrition_sources),
  private.verify_full_local_internal_scope(), private.verify_scope_pre_ai_refresh_20261008()
  from public,anon,authenticated,service_role;
revoke all on function public.get_ingredient_ai_recipe_refresh_input(uuid,uuid),
  public.write_ingredient_ai_recipe_refresh(uuid,uuid,jsonb,timestamptz,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_ingredient_ai_recipe_refresh_input(uuid,uuid),
  public.write_ingredient_ai_recipe_refresh(uuid,uuid,jsonb,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
