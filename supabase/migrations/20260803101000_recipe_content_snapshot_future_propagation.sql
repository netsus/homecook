-- Repair standalone public visibility and description-aware future-plan hashes.
-- The existing session_kind constraint keeps legacy_v1 and snapshot_v2
-- namespaces isolated; this follow-up does not reopen that storage boundary.
-- shopping_list_items identity continues to use ingredient_id,
-- food_product_id, and food_product_nutrition_version_id rows only.

begin;

create or replace function public.preview_recipe_future_plan_impact(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_recipe_id uuid,
  p_base_recipe_revision bigint,
  p_draft jsonb,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_recipe public.recipes%rowtype;
  v_canonical_draft jsonb;
  v_target_state jsonb;
  v_proposed_content_hash text;
  v_target_set_revision_hash text;
  v_impact_token text;
  v_token_hash text;
  v_future_meal_count integer;
  v_date_from date;
  v_date_to date;
  v_incomplete_count integer;
  v_completed_count integer;
  v_active_claim_count integer;
  v_expires_at timestamptz := p_now + interval '5 minutes';
begin
  if p_recipe_id is null or p_base_recipe_revision is null or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );
  perform public.lock_personal_recipe_ids(array[p_recipe_id]);

  select recipe.* into v_recipe
  from public.recipes as recipe
  where recipe.id = p_recipe_id
  for update;
  if v_recipe.id is null
    or v_recipe.created_by is distinct from p_owner_uuid
    or v_recipe.visibility is distinct from 'private'
    or v_recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_recipe.revision is distinct from p_base_recipe_revision then
    raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
  end if;

  v_canonical_draft := public.canonicalize_recipe_future_draft(p_draft);
  v_proposed_content_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(
          v_canonical_draft ->> 'title',
          v_canonical_draft ->> 'description',
          (v_canonical_draft ->> 'base_servings')::numeric,
          v_canonical_draft -> 'ingredients',
          v_canonical_draft -> 'steps'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_target_state := public.build_recipe_future_target_state(
    p_owner_uuid, p_recipe_id, p_now::date
  );
  v_target_set_revision_hash := encode(extensions.digest(
    convert_to(v_target_state::text, 'UTF8'), 'sha256'
  ), 'hex');

  select count(*)::integer, min(meal.plan_date), max(meal.plan_date),
         count(claim.meal_id)::integer
    into v_future_meal_count, v_date_from, v_date_to, v_active_claim_count
  from public.meals as meal
  left join public.cooking_session_meal_claims as claim on claim.meal_id = meal.id
  where meal.user_id = p_owner_uuid
    and meal.recipe_id = p_recipe_id
    and meal.plan_date >= p_now::date
    and meal.status <> 'cook_done';

  select
    count(distinct meal.shopping_list_id) filter (where not list.is_completed)::integer,
    count(distinct meal.shopping_list_id) filter (where list.is_completed)::integer
    into v_incomplete_count, v_completed_count
  from public.meals as meal
  join public.shopping_lists as list on list.id = meal.shopping_list_id
  where meal.user_id = p_owner_uuid and meal.recipe_id = p_recipe_id;

  v_impact_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(
    convert_to(v_impact_token, 'UTF8'), 'sha256'
  ), 'hex');

  insert into public.recipe_change_previews (
    owner_uuid, account_generation, session_key_hash, hmac_key_version,
    recipe_id, token_hash, base_recipe_revision, proposed_content_hash,
    target_set_revision_hash, future_meal_count, date_from, date_to,
    incomplete_shopping_list_count, completed_shopping_list_count,
    active_cooking_claim_count, replace_all_allowed, expires_at, created_at
  ) values (
    p_owner_uuid, (v_authority ->> 'account_generation')::bigint,
    p_session_key_hash, p_hmac_key_version, p_recipe_id, v_token_hash,
    p_base_recipe_revision, v_proposed_content_hash,
    v_target_set_revision_hash, coalesce(v_future_meal_count, 0),
    v_date_from, v_date_to, coalesce(v_incomplete_count, 0),
    coalesce(v_completed_count, 0), coalesce(v_active_claim_count, 0),
    coalesce(v_active_claim_count, 0) = 0, v_expires_at, p_now
  );

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'impact_token', v_impact_token,
      'expires_at', v_expires_at,
      'proposed_content_hash', v_proposed_content_hash,
      'future_meal_count', coalesce(v_future_meal_count, 0),
      'date_range', jsonb_build_object('from', v_date_from, 'to', v_date_to),
      'incomplete_shopping_list_count', coalesce(v_incomplete_count, 0),
      'completed_shopping_list_count', coalesce(v_completed_count, 0),
      'active_cooking_claim_count', coalesce(v_active_claim_count, 0),
      'replace_all_allowed', coalesce(v_active_claim_count, 0) = 0
    ),
    'error', null
  );
end;
$function$;

create or replace function public.write_recipe_future_plan_change(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_recipe_id uuid,
  p_base_recipe_revision bigint,
  p_draft jsonb,
  p_nutrition_snapshot jsonb,
  p_nutrition_predecessor_guard jsonb,
  p_future_plan_strategy text,
  p_impact_token text,
  p_image_object_id uuid,
  p_idempotency_key uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_recipe public.recipes%rowtype;
  v_preview public.recipe_change_previews%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_canonical_draft jsonb;
  v_current_guard jsonb;
  v_target_state jsonb;
  v_target_hash text;
  v_content_hash text;
  v_token_hash text;
  v_key_hash text;
  v_payload_hash text;
  v_tags jsonb;
  v_cleanup_generation bigint;
  v_core_result jsonb;
  v_content_snapshot_id uuid;
  v_nutrition_snapshot_id uuid;
  v_public_result jsonb;
  v_active_claim_count integer;
  v_meal record;
begin
  if p_recipe_id is null
    or p_base_recipe_revision is null
    or p_idempotency_key is null
    or p_future_plan_strategy not in ('replace_all', 'keep')
    or nullif(p_impact_token, '') is null
    or jsonb_typeof(p_nutrition_snapshot) <> 'object'
    or jsonb_typeof(p_nutrition_predecessor_guard) <> 'object'
    or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  perform public.lock_personal_recipe_ids(array[p_recipe_id]);

  select recipe.* into v_recipe
  from public.recipes as recipe
  where recipe.id = p_recipe_id
  for update;
  if v_recipe.id is null
    or v_recipe.created_by is distinct from p_owner_uuid
    or v_recipe.visibility is distinct from 'private'
    or v_recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_meal in
    select meal.id
    from public.meals as meal
    where meal.user_id = p_owner_uuid
      and meal.recipe_id = p_recipe_id
      and meal.plan_date >= p_now::date
      and meal.status <> 'cook_done'
    order by meal.id::text collate "C"
    for update
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-meal:' || v_meal.id::text, 0)
    );
  end loop;

  v_canonical_draft := public.canonicalize_recipe_future_draft(p_draft);
  v_content_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(
          v_canonical_draft ->> 'title',
          v_canonical_draft ->> 'description',
          (v_canonical_draft ->> 'base_servings')::numeric,
          v_canonical_draft -> 'ingredients',
          v_canonical_draft -> 'steps'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_target_state := public.build_recipe_future_target_state(
    p_owner_uuid, p_recipe_id, p_now::date
  );
  v_target_hash := encode(extensions.digest(
    convert_to(v_target_state::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_token_hash := encode(extensions.digest(
    convert_to(p_impact_token, 'UTF8'), 'sha256'
  ), 'hex');

  v_key_hash := encode(extensions.digest(
    convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'recipe_id', p_recipe_id,
    'base_recipe_revision', p_base_recipe_revision,
    'draft', v_canonical_draft,
    'nutrition_snapshot', p_nutrition_snapshot,
    'nutrition_predecessor_guard', p_nutrition_predecessor_guard,
    'future_plan_strategy', p_future_plan_strategy,
    'impact_token_hash', v_token_hash,
    'image_object_id', p_image_object_id
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.mutation_idempotency_keys (
    owner_uuid, account_generation, operation_scope, key_hash, payload_hash,
    state, attempt_token, lease_expires_at, created_at, updated_at
  ) values (
    p_owner_uuid, (v_authority ->> 'account_generation')::bigint,
    'recipe_future_patch', v_key_hash, v_payload_hash, 'in_progress',
    extensions.gen_random_uuid(), p_now + interval '5 minutes', p_now, p_now
  )
  on conflict (owner_uuid, account_generation, operation_scope, key_hash)
  do nothing returning * into v_idempotency;

  if v_idempotency.id is null then
    select receipt.* into v_idempotency
    from public.mutation_idempotency_keys as receipt
    where receipt.owner_uuid = p_owner_uuid
      and receipt.account_generation = (v_authority ->> 'account_generation')::bigint
      and receipt.operation_scope = 'recipe_future_patch'
      and receipt.key_hash = v_key_hash
    for update;
    if v_idempotency.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    if v_idempotency.state = 'succeeded' and v_idempotency.durable_result is not null then
      return v_idempotency.durable_result;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
  end if;

  select preview.* into v_preview
  from public.recipe_change_previews as preview
  where preview.token_hash = v_token_hash
  for update;

  if v_preview.id is null
    or v_preview.owner_uuid is distinct from p_owner_uuid
    or v_preview.account_generation
      is distinct from (v_authority ->> 'account_generation')::bigint
    or v_preview.session_key_hash is distinct from p_session_key_hash
    or v_preview.hmac_key_version is distinct from p_hmac_key_version
    or v_preview.recipe_id is distinct from p_recipe_id
    or v_preview.expires_at <= p_now
    or v_preview.consumed_at is not null
    or v_recipe.revision is distinct from p_base_recipe_revision
    or v_preview.base_recipe_revision is distinct from p_base_recipe_revision
    or v_preview.proposed_content_hash is distinct from v_content_hash
    or v_preview.target_set_revision_hash is distinct from v_target_hash then
    raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
  end if;

  select count(*)::integer into v_active_claim_count
  from public.cooking_session_meal_claims as claim
  join public.meals as meal on meal.id = claim.meal_id
  where meal.user_id = p_owner_uuid
    and meal.recipe_id = p_recipe_id
    and meal.plan_date >= p_now::date
    and meal.status <> 'cook_done';
  if p_future_plan_strategy = 'replace_all' and v_active_claim_count > 0 then
    raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode = '55000';
  end if;

  for v_meal in
    select distinct_ingredient.id
    from (
      select distinct (item ->> 'ingredient_id')::uuid as id
      from jsonb_array_elements(v_canonical_draft -> 'ingredients') as item
    ) as distinct_ingredient
    order by distinct_ingredient.id::text collate "C"
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-ingredient-predecessor:' || v_meal.id::text, 0)
    );
  end loop;
  v_current_guard := public.build_recipe_draft_nutrition_predecessor_guard(p_draft);
  if v_current_guard is distinct from p_nutrition_predecessor_guard then
    raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'normalized_key', tag.normalized_key,
    'label', tag.label
  ) order by recipe_tag.sort_order, tag.normalized_key collate "C"), '[]'::jsonb)
    into v_tags
  from public.recipe_tags as recipe_tag
  join public.tags as tag on tag.id = recipe_tag.tag_id
  where recipe_tag.recipe_id = p_recipe_id;

  if p_image_object_id is not null then
    select object.cleanup_generation into v_cleanup_generation
    from public.recipe_image_objects as object
    where object.id = p_image_object_id
      and object.owner_uuid = p_owner_uuid
      and object.account_generation = (v_authority ->> 'account_generation')::bigint
    for update;
    if v_cleanup_generation is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  v_core_result := public.write_personal_recipe_core(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at, 'update', p_recipe_id, null,
    p_base_recipe_revision, p_draft, p_nutrition_snapshot, v_tags,
    p_image_object_id, v_cleanup_generation, p_idempotency_key, p_now
  );
  v_content_snapshot_id := (v_core_result #>> '{data,content_snapshot_id}')::uuid;
  v_nutrition_snapshot_id :=
    (v_core_result #>> '{data,recipe_nutrition_snapshot_id}')::uuid;
  if v_content_snapshot_id is null then
    raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
  end if;

  if p_future_plan_strategy = 'replace_all' then
    perform public.set_account_generation_internal_writer_marker(
      (v_authority ->> 'cutover_attempt_id')::uuid, true
    );
    perform set_config('homecook.recipe_future_propagation_writer', 'on', true);
    update public.meals as meal
    set recipe_content_snapshot_id = v_content_snapshot_id,
        recipe_content_snapshot_origin = 'created',
        recipe_nutrition_snapshot_id = v_nutrition_snapshot_id,
        nutrition_snapshot_origin = case when v_nutrition_snapshot_id is null
          then null else 'created' end,
        updated_at = p_now
    where meal.user_id = p_owner_uuid
      and meal.recipe_id = p_recipe_id
      and meal.plan_date >= p_now::date
      and meal.status <> 'cook_done';
    perform public.reconcile_incomplete_recipe_shopping_lists(
      p_owner_uuid, p_recipe_id
    );
    perform public.set_account_generation_internal_writer_marker(
      (v_authority ->> 'cutover_attempt_id')::uuid, false
    );
  end if;

  v_public_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', p_recipe_id,
      'revision', (v_core_result #>> '{data,revision}')::bigint
    ),
    'error', null
  );
  update public.recipe_change_previews
  set consumed_at = p_now, durable_result = v_public_result
  where id = v_preview.id;
  update public.mutation_idempotency_keys
  set state = 'succeeded', terminal_result = 'succeeded',
      durable_result = v_public_result, result_reference = p_recipe_id,
      attempt_token = null, lease_expires_at = null, updated_at = p_now
  where id = v_idempotency.id;
  return v_public_result;
end;
$function$;

create or replace function public.start_snapshot_v2_cooking_session(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_idempotency_key uuid,
  p_mode text,
  p_meal_ids uuid[],
  p_expected_meal_revisions jsonb,
  p_recipe_id uuid,
  p_expected_recipe_revision bigint,
  p_cooking_servings numeric,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_recipe public.recipes%rowtype;
  v_source_recipe public.recipes%rowtype;
  v_source_lifecycle public.user_account_lifecycles%rowtype;
  v_snapshot public.recipe_content_snapshots%rowtype;
  v_session_id uuid := extensions.gen_random_uuid();
  v_recipe_id uuid;
  v_content_snapshot_id uuid;
  v_cooking_servings integer;
  v_key_hash text;
  v_payload_hash text;
  v_result jsonb;
  v_meal record;
  v_owner_uuid uuid;
begin
  if p_idempotency_key is null
    or p_mode not in ('planner', 'standalone')
    or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );

  if p_mode = 'planner' then
    if cardinality(coalesce(p_meal_ids, '{}'::uuid[])) = 0
      or cardinality(p_meal_ids) is distinct from (
        select count(distinct id) from unnest(p_meal_ids) as ids(id)
      )
      or jsonb_typeof(p_expected_meal_revisions) <> 'object'
      or (select count(*) from jsonb_object_keys(p_expected_meal_revisions))
        is distinct from cardinality(p_meal_ids)
      or p_recipe_id is not null
      or p_expected_recipe_revision is not null
      or p_cooking_servings is not null then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    select
           (array_agg(meal.recipe_id order by meal.recipe_id::text collate "C"))[1],
           (array_agg(meal.recipe_content_snapshot_id
             order by meal.recipe_content_snapshot_id::text collate "C"))[1],
           sum(meal.planned_servings)::integer
      into v_recipe_id, v_content_snapshot_id, v_cooking_servings
    from public.meals as meal
    where meal.id = any(p_meal_ids);
  else
    if p_recipe_id is null
      or p_expected_recipe_revision is null
      or p_cooking_servings is null
      or p_cooking_servings <= 0
      or trunc(p_cooking_servings) <> p_cooking_servings
      or cardinality(coalesce(p_meal_ids, '{}'::uuid[])) <> 0
      or coalesce(p_expected_meal_revisions, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    v_recipe_id := p_recipe_id;
    v_cooking_servings := p_cooking_servings::integer;
    select recipe.* into v_source_recipe
    from public.recipes as recipe
    where recipe.id = v_recipe_id;
  end if;

  v_key_hash := encode(extensions.digest(
    convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'mode', p_mode,
    'meal_ids', case when p_mode = 'planner' then to_jsonb(p_meal_ids) else null end,
    'expected_meal_revisions', case when p_mode = 'planner'
      then p_expected_meal_revisions else null end,
    'recipe_id', case when p_mode = 'standalone' then p_recipe_id else null end,
    'expected_recipe_revision', case when p_mode = 'standalone'
      then p_expected_recipe_revision else null end,
    'cooking_servings', case when p_mode = 'standalone'
      then p_cooking_servings else null end
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.mutation_idempotency_keys (
    owner_uuid, account_generation, operation_scope, key_hash, payload_hash,
    state, attempt_token, lease_expires_at, created_at, updated_at
  ) values (
    p_owner_uuid, (v_authority ->> 'account_generation')::bigint,
    'snapshot_v2_start', v_key_hash, v_payload_hash, 'in_progress',
    extensions.gen_random_uuid(), p_now + interval '5 minutes', p_now, p_now
  ) on conflict (owner_uuid, account_generation, operation_scope, key_hash)
  do nothing returning * into v_idempotency;
  if v_idempotency.id is null then
    select receipt.* into v_idempotency
    from public.mutation_idempotency_keys as receipt
    where receipt.owner_uuid = p_owner_uuid
      and receipt.account_generation = (v_authority ->> 'account_generation')::bigint
      and receipt.operation_scope = 'snapshot_v2_start'
      and receipt.key_hash = v_key_hash
    for update;
    if v_idempotency.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    if v_idempotency.state = 'succeeded' then
      return v_idempotency.durable_result;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
  end if;

  if current_setting('homecook.snapshot_v2_creation', true) is distinct from 'on' then
    raise exception 'SNAPSHOT_V2_CREATION_DISABLED' using errcode = '55000';
  end if;

  if p_mode = 'standalone'
    and v_source_recipe.visibility = 'public'
    and v_source_recipe.created_by is distinct from p_owner_uuid then
    for v_owner_uuid in
      select ordered.owner_uuid
      from (
        select distinct owner_uuid
        from unnest(array[p_owner_uuid, v_source_recipe.created_by]) as owner_uuid
        where owner_uuid is not null
      ) as ordered
      order by ordered.owner_uuid::text collate "C"
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'homecook-account-owner:' || v_owner_uuid::text,
          0
        )
      );
    end loop;
  end if;

  perform public.lock_personal_recipe_ids(array[v_recipe_id]);
  select recipe.* into v_recipe
  from public.recipes as recipe
  where recipe.id = v_recipe_id
  for update;
  if v_recipe.id is null or v_recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (
    v_recipe.created_by = p_owner_uuid
    or (
      v_recipe.visibility = 'public'
      and recipe_visibility_guard.is_owner_publicly_visible(v_recipe.created_by)
    )
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_mode = 'standalone'
    and v_recipe.visibility = 'public'
    and v_recipe.created_by is distinct from p_owner_uuid then
    select lifecycle.* into v_source_lifecycle
    from public.user_account_lifecycles as lifecycle
    where lifecycle.owner_uuid = v_recipe.created_by
    order by lifecycle.account_generation desc
    limit 1
    for update;
    if v_source_lifecycle.owner_uuid is not null
      and v_source_lifecycle.status is distinct from 'active' then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if p_mode = 'planner' then
    for v_meal in
      select meal.*
      from public.meals as meal
      where meal.id = any(p_meal_ids)
      order by meal.id::text collate "C"
      for update
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('homecook-meal:' || v_meal.id::text, 0)
      );
      if v_meal.user_id is distinct from p_owner_uuid
        or v_meal.recipe_id is distinct from v_recipe_id
        or v_meal.recipe_content_snapshot_id is null
        or v_meal.recipe_content_snapshot_id is distinct from v_content_snapshot_id
        or v_meal.status not in ('registered', 'shopping_done')
        or v_meal.revision is distinct from
          (p_expected_meal_revisions ->> v_meal.id::text)::bigint then
        raise exception 'RECIPE_IMPACT_STALE' using errcode = '40001';
      end if;
      if exists (
        select 1 from public.cooking_session_meal_claims as claim
        where claim.meal_id = v_meal.id
      ) then
        raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode = '23505';
      end if;
    end loop;
    if (select count(*) from public.meals where id = any(p_meal_ids))
      is distinct from cardinality(p_meal_ids) then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  else
    if v_recipe.revision is distinct from p_expected_recipe_revision then
      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
    select snapshot.* into v_snapshot
    from public.recipe_content_snapshots as snapshot
    where snapshot.recipe_id = v_recipe_id
      and snapshot.owner_user_id is not distinct from
        case when v_recipe.visibility = 'private' then p_owner_uuid else null end
    order by snapshot.created_at desc, snapshot.id desc
    limit 1;
    v_content_snapshot_id := v_snapshot.id;
    if v_content_snapshot_id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select snapshot.* into v_snapshot
  from public.recipe_content_snapshots as snapshot
  where snapshot.id = v_content_snapshot_id;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  set constraints all deferred;
  insert into public.cooking_sessions (
    id, user_id, status, contract_version, session_kind, recipe_id,
    recipe_content_snapshot_id, cooking_servings, base_recipe_revision,
    created_at
  ) values (
    v_session_id, p_owner_uuid, 'in_progress', 'snapshot_v2', p_mode,
    v_recipe_id, v_content_snapshot_id, v_cooking_servings,
    case when p_mode = 'standalone' then p_expected_recipe_revision else null end,
    p_now
  );
  if p_mode = 'planner' then
    insert into public.cooking_session_meals (
      session_id, meal_id, recipe_id, cooking_servings, meal_revision_snapshot
    )
    select v_session_id, meal.id, meal.recipe_id, meal.planned_servings,
           meal.revision
    from public.meals as meal
    where meal.id = any(p_meal_ids)
    order by meal.id::text collate "C";
    insert into public.cooking_session_meal_claims (
      meal_id, session_id, owner_user_id, claimed_at
    )
    select meal.id, v_session_id, p_owner_uuid, p_now
    from public.meals as meal
    where meal.id = any(p_meal_ids)
    order by meal.id::text collate "C";
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', v_session_id,
      'contract_version', 'snapshot_v2',
      'mode', p_mode,
      'status', 'in_progress',
      'content_summary', jsonb_build_object(
        'recipe_id', v_recipe_id,
        'title', v_snapshot.title,
        'cooking_servings', v_cooking_servings
      )
    ),
    'error', null
  );
  update public.mutation_idempotency_keys
  set state = 'succeeded', terminal_result = 'succeeded',
      durable_result = v_result, result_reference = v_session_id,
      attempt_token = null, lease_expires_at = null, updated_at = p_now
  where id = v_idempotency.id;
  return v_result;
end;
$function$;

create or replace function public.read_snapshot_v2_cook_mode(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_session_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_session public.cooking_sessions%rowtype;
  v_snapshot public.recipe_content_snapshots%rowtype;
  v_recipe_row public.recipes%rowtype;
  v_source_lifecycle_status text;
  v_recipe jsonb;
  v_candidates jsonb;
begin
  perform public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  select session.* into v_session
  from public.cooking_sessions as session
  where session.id = p_session_id
    and session.user_id = p_owner_uuid
    and session.contract_version = 'snapshot_v2';
  if v_session.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select snapshot.* into v_snapshot
  from public.recipe_content_snapshots as snapshot
  where snapshot.id = v_session.recipe_content_snapshot_id;
  if v_snapshot.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select recipe.* into v_recipe_row
  from public.recipes as recipe
  where recipe.id = v_session.recipe_id;
  if v_recipe_row.id is null
    or v_recipe_row.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_recipe_row.visibility = 'public'
    and v_recipe_row.created_by is distinct from p_owner_uuid then
    select lifecycle.status into v_source_lifecycle_status
    from public.user_account_lifecycles as lifecycle
    where lifecycle.owner_uuid = v_recipe_row.created_by
    order by lifecycle.account_generation desc
    limit 1;
    if v_source_lifecycle_status is not null
      and v_source_lifecycle_status is distinct from 'active' then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  v_recipe := jsonb_build_object(
    'id', v_session.recipe_id,
    'title', v_snapshot.title,
    'base_servings', v_snapshot.base_servings,
    'cooking_servings', v_session.cooking_servings,
    'ingredients', v_snapshot.ingredients_json,
    'steps', v_snapshot.steps_json
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'pantry_item_id', pantry.id,
    'ingredient_id', (ingredient ->> 'ingredient_id')::uuid,
    'item_type', case when pantry.food_product_id is null
      then 'ingredient' else 'food_product' end,
    'standard_name', dictionary.name,
    'food_product_id', pantry.food_product_id,
    'food_product_nutrition_version_id',
      pantry.food_product_nutrition_version_id,
    'name', case when pantry.food_product_id is null
      then dictionary.name else product.name end,
    'brand', case when pantry.food_product_id is null
      then null else product.brand end
  ) order by pantry.id::text collate "C"), '[]'::jsonb)
    into v_candidates
  from jsonb_array_elements(v_snapshot.ingredients_json) as ingredient
  join public.ingredients as dictionary
    on dictionary.id = (ingredient ->> 'ingredient_id')::uuid
  join public.pantry_items as pantry
    on pantry.user_id = p_owner_uuid
   and (
     (pantry.ingredient_id = (ingredient ->> 'ingredient_id')::uuid
       and pantry.food_product_id is null)
     or
     (pantry.ingredient_id is null
       and pantry.food_product_id = nullif(ingredient ->> 'food_product_id', '')::uuid
       and pantry.food_product_nutrition_version_id =
         nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid)
   )
  left join public.food_products as product on product.id = pantry.food_product_id;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', v_session.id,
      'contract_version', 'snapshot_v2',
      'mode', v_session.session_kind,
      'status', v_session.status,
      'recipe', v_recipe,
      'pantry_candidates', v_candidates
    ),
    'error', null
  );
end;
$function$;

commit;
