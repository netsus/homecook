-- Dormant recipe future propagation and snapshot-v2 cooking authority.
-- Public routes cannot enable either creation capability; the transaction-local
-- switches remain off unless a later, separately approved release gate sets them.

begin;

create table if not exists public.recipe_change_previews (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_uuid uuid not null,
  account_generation bigint not null check (account_generation > 0),
  session_key_hash text not null,
  hmac_key_version integer not null check (hmac_key_version > 0),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  token_hash text not null unique,
  base_recipe_revision bigint not null check (base_recipe_revision > 0),
  proposed_content_hash text not null,
  target_set_revision_hash text not null,
  future_meal_count integer not null check (future_meal_count >= 0),
  date_from date,
  date_to date,
  incomplete_shopping_list_count integer not null check (incomplete_shopping_list_count >= 0),
  completed_shopping_list_count integer not null check (completed_shopping_list_count >= 0),
  active_cooking_claim_count integer not null check (active_cooking_claim_count >= 0),
  replace_all_allowed boolean not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  durable_result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  check (date_from is null = (date_to is null)),
  check ((consumed_at is null and durable_result is null)
      or (consumed_at is not null and durable_result is not null))
);

create index if not exists recipe_change_previews_owner_generation_recipe_idx
  on public.recipe_change_previews (owner_uuid, account_generation, recipe_id, expires_at desc);

alter table public.shopping_list_recipes
  add column if not exists recipe_content_snapshot_id uuid
    references public.recipe_content_snapshots(id) on delete restrict;

alter table public.shopping_list_recipes
  drop constraint if exists shopping_list_recipes_shopping_list_id_recipe_id_key;

create unique index if not exists shopping_list_recipes_list_recipe_content_key
  on public.shopping_list_recipes (
    shopping_list_id,
    recipe_id,
    coalesce(
      recipe_content_snapshot_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  );

-- Keep the legacy and snapshot-v2 namespaces mutually exclusive at the
-- storage boundary, even when rows are written outside the route layer.
alter table public.cooking_sessions
  alter column session_kind drop not null;
alter table public.cooking_sessions
  drop constraint if exists cooking_sessions_snapshot_v2_shape_check;
alter table public.cooking_sessions
  drop constraint if exists cooking_sessions_contract_namespace_check;
alter table public.cooking_sessions
  add constraint cooking_sessions_contract_namespace_check
  check (
    (
      contract_version = 'legacy_v1'
      and session_kind is null
      and recipe_id is null
      and recipe_content_snapshot_id is null
      and cooking_servings is null
      and base_recipe_revision is null
    )
    or
    (
      contract_version = 'snapshot_v2'
      and session_kind in ('planner', 'standalone')
      and recipe_id is not null
      and recipe_content_snapshot_id is not null
      and cooking_servings > 0
      and (
        (session_kind = 'planner' and base_recipe_revision is null)
        or
        (session_kind = 'standalone' and base_recipe_revision > 0)
      )
    )
  );

alter table public.recipe_change_previews enable row level security;
revoke all on table public.recipe_change_previews
  from public, anon, authenticated, service_role;

create or replace function public.pin_recipe_snapshot_for_future_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_snapshot_id uuid;
  v_content_id uuid;
  v_owner_user_id uuid;
  v_title varchar(200);
  v_base_servings numeric(8,2);
  v_ingredients_json jsonb;
  v_steps_json jsonb;
  v_content_hash text;
  v_clone_token uuid;
begin
  if new.recipe_content_snapshot_id is not null
    or new.recipe_content_snapshot_origin is not null
    or new.recipe_nutrition_snapshot_id is not null
    or new.nutrition_snapshot_origin is not null then
    delete from public.shopping_meal_snapshot_clone_tokens as clone_token
    where clone_token.token = nullif(current_setting(
        'homecook.shopping_meal_snapshot_clone_token', true
      ), '')::uuid
      and clone_token.user_id = new.user_id
      and clone_token.recipe_id = new.recipe_id
      and clone_token.plan_date = new.plan_date
      and clone_token.column_id = new.column_id
      and clone_token.planned_servings = new.planned_servings
      and clone_token.is_leftover = new.is_leftover
      and clone_token.leftover_dish_id is not distinct from new.leftover_dish_id
      and clone_token.recipe_nutrition_snapshot_id
        is not distinct from new.recipe_nutrition_snapshot_id
      and clone_token.nutrition_snapshot_origin
        is not distinct from new.nutrition_snapshot_origin
      and clone_token.recipe_content_snapshot_id
        is not distinct from new.recipe_content_snapshot_id
      and clone_token.recipe_content_snapshot_origin
        is not distinct from new.recipe_content_snapshot_origin
    returning clone_token.token into v_clone_token;

    if v_clone_token is null then
      raise exception 'CLIENT_SELECTED_CONTENT_OR_NUTRITION_SNAPSHOT_NOT_ALLOWED'
        using errcode = '42501';
    end if;
    perform set_config('homecook.shopping_meal_snapshot_clone_token', '', true);
    return new;
  end if;

  -- The personal recipe writer is the canonical snapshot producer. Reusing
  -- its latest immutable row prevents Meal creation from inventing a second,
  -- structurally different snapshot for the same recipe revision.
  select snapshot.id, snapshot.recipe_nutrition_snapshot_id
    into v_content_id, v_snapshot_id
  from public.recipe_content_snapshots as snapshot
  join public.recipes as recipe on recipe.id = snapshot.recipe_id
  join public.recipe_nutrition_snapshots as nutrition_snapshot
    on nutrition_snapshot.id = snapshot.recipe_nutrition_snapshot_id
   and nutrition_snapshot.recipe_id = snapshot.recipe_id
   and nutrition_snapshot.is_current
  where snapshot.recipe_id = new.recipe_id
    and snapshot.owner_user_id is not distinct from case
      when recipe.visibility = 'private' then recipe.created_by else null end
  limit 1;

  if v_content_id is null then
    select snapshot.id into v_snapshot_id
    from public.recipe_nutrition_snapshots as snapshot
    where snapshot.recipe_id = new.recipe_id
      and snapshot.is_current
    limit 1;

    select input.owner_user_id, input.title, input.base_servings,
           input.ingredients_json, input.steps_json, input.content_hash
      into v_owner_user_id, v_title, v_base_servings,
           v_ingredients_json, v_steps_json, v_content_hash
    from public.build_recipe_content_snapshot_input(new.recipe_id) as input;

    insert into public.recipe_content_snapshots (
      owner_user_id, recipe_id, recipe_nutrition_snapshot_id, title,
      base_servings, ingredients_json, steps_json, content_hash, schema_version
    ) values (
      v_owner_user_id, new.recipe_id, v_snapshot_id, v_title,
      v_base_servings, v_ingredients_json, v_steps_json, v_content_hash, 1
    )
    on conflict (
      recipe_id, content_hash, recipe_nutrition_snapshot_id, schema_version
    ) do nothing
    returning id into v_content_id;

    if v_content_id is null then
      select snapshot.id into v_content_id
      from public.recipe_content_snapshots as snapshot
      where snapshot.recipe_id = new.recipe_id
        and snapshot.content_hash = v_content_hash
        and snapshot.recipe_nutrition_snapshot_id is not distinct from v_snapshot_id
        and snapshot.schema_version = 1;
    end if;
  end if;

  new.recipe_content_snapshot_id := v_content_id;
  new.recipe_content_snapshot_origin := 'created';
  new.recipe_nutrition_snapshot_id := v_snapshot_id;
  new.nutrition_snapshot_origin := case when v_snapshot_id is null
    then null else 'created' end;
  return new;
end;
$function$;

drop trigger if exists pin_current_recipe_nutrition_snapshot_on_meal_insert
  on public.meals;
create trigger pin_current_recipe_nutrition_snapshot_on_meal_insert
before insert on public.meals
for each row execute function
  public.pin_recipe_snapshot_for_future_meal_insert();

create or replace function public.assert_recipe_future_session_authority(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_auth_control jsonb;
  v_session_authority jsonb;
begin
  if v_request_role <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed'
    or p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_session_issued_at is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  v_auth_control := public.read_full_local_auth_control();
  perform 1
  from private.full_local_auth_control as control
  where control.singleton
  for share;

  select capability.* into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state = 'cutover_maintenance' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE' using errcode = '55000';
  end if;
  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null then
    raise exception 'ACCOUNT_GENERATION_STALE' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-owner:' || p_owner_uuid::text, 0)
  );
  select lifecycle.* into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED' using errcode = '55000';
  end if;
  if v_lifecycle.status in ('deleting', 'cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETING' using errcode = '55000';
  end if;
  if v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  v_session_authority := public.assert_full_local_session_authority(
    v_auth_control ->> 'local_issuer',
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    (v_auth_control ->> 'cutover_epoch')::bigint,
    p_session_issued_at
  );
  if (v_session_authority ->> 'expected_account_generation')::bigint
    is distinct from v_lifecycle.account_generation then
    raise exception 'ACCOUNT_GENERATION_STALE' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'account_generation', v_lifecycle.account_generation,
    'cutover_attempt_id', v_capability.current_cutover_attempt_id
  );
end;
$function$;

create or replace function public.canonicalize_recipe_future_draft(p_draft jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_draft) <> 'object'
    or jsonb_typeof(p_draft -> 'ingredients') <> 'array'
    or jsonb_typeof(p_draft -> 'steps') <> 'array'
    or exists (
      select 1 from jsonb_object_keys(p_draft) as key
      where key not in ('title', 'description', 'base_servings', 'ingredients', 'steps')
    )
    or nullif(btrim(p_draft ->> 'title'), '') is null
    or length(btrim(p_draft ->> 'title')) > 200
    or coalesce((p_draft ->> 'base_servings')::integer, 0) <= 0
    or jsonb_array_length(p_draft -> 'ingredients') = 0
    or jsonb_array_length(p_draft -> 'steps') = 0 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'title', btrim(p_draft ->> 'title'),
    'description', nullif(p_draft ->> 'description', ''),
    'base_servings', (p_draft ->> 'base_servings')::integer,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_id', nullif(item ->> 'ingredient_id', '')::uuid,
        'amount', nullif(item ->> 'amount', '')::numeric,
        'unit', nullif(item ->> 'unit', ''),
        'ingredient_type', coalesce(nullif(item ->> 'ingredient_type', ''), 'QUANT'),
        'display_text', nullif(item ->> 'display_text', ''),
        'component_label', nullif(item ->> 'component_label', ''),
        'scalable', coalesce((item ->> 'scalable')::boolean, true),
        'sort_order', ordinality - 1,
        'food_product_id', nullif(item ->> 'food_product_id', '')::uuid,
        'food_product_nutrition_version_id',
          nullif(item ->> 'food_product_nutrition_version_id', '')::uuid,
        'food_product_name', product.name,
        'food_product_brand', product.brand
      ) order by ordinality)
      from jsonb_array_elements(p_draft -> 'ingredients')
        with ordinality as rows(item, ordinality)
      left join public.food_products as product
        on product.id = nullif(item ->> 'food_product_id', '')::uuid
       and product.deleted_at is null
      left join public.food_product_nutrition_versions as version
        on version.product_id = product.id
       and version.id = nullif(item ->> 'food_product_nutrition_version_id', '')::uuid
      where (nullif(item ->> 'food_product_id', '') is null
          and nullif(item ->> 'food_product_nutrition_version_id', '') is null)
         or version.id is not null
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'step_number', (item ->> 'step_number')::integer,
        'instruction', item ->> 'instruction',
        'cooking_method_id', nullif(item ->> 'cooking_method_id', '')::uuid,
        'cooking_method_ids', case when jsonb_typeof(item -> 'cooking_method_ids') = 'array'
          then item -> 'cooking_method_ids' else null end,
        'ingredients_used', coalesce(item -> 'ingredients_used', '[]'::jsonb),
        'component_label', nullif(item ->> 'component_label', ''),
        'heat_level', nullif(item ->> 'heat_level', ''),
        'duration_seconds', nullif(item ->> 'duration_seconds', '')::integer,
        'duration_text', nullif(item ->> 'duration_text', '')
      ) order by ordinality)
      from jsonb_array_elements(p_draft -> 'steps')
        with ordinality as rows(item, ordinality)
    ), '[]'::jsonb)
  ) into v_result;

  if jsonb_array_length(v_result -> 'ingredients')
      is distinct from jsonb_array_length(p_draft -> 'ingredients') then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  return v_result;
end;
$function$;

-- This is the draft equivalent of build_recipe_nutrition_input_guard. It
-- intentionally excludes generated recipe_ingredients.id and preserves draft
-- order so the server-side guard is byte-for-byte comparable with the route
-- helper projection.
create or replace function public.build_recipe_draft_nutrition_predecessor_guard(
  p_draft jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if to_regclass('public.ingredient_nutrition_profiles') is null
    or to_regclass('public.ingredient_conversion_assignments') is null
    or to_regprocedure('public.normalize_recipe_nutrition_unit(text)') is null then
    return jsonb_build_object(
      'recipe_ingredients', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ingredient_id', ingredient -> 'ingredient_id',
          'amount', ingredient -> 'amount',
          'unit', ingredient -> 'unit',
          'ingredient_type', ingredient -> 'ingredient_type',
          'scalable', ingredient -> 'scalable',
          'sort_order', ingredient -> 'sort_order',
          'food_product_id', case when product_link.id is null then null
            else ingredient -> 'food_product_id' end,
          'food_product_nutrition_version_id',
            case when product_link.id is null then null
              else ingredient -> 'food_product_nutrition_version_id' end,
          'nutrition_candidates', '[]'::jsonb,
          'conversion_candidates', '[]'::jsonb,
          'selected_nutrition_link_id', null,
          'selected_conversion_assignment_id', null
        ) order by ordinality)
        from jsonb_array_elements(
          public.canonicalize_recipe_future_draft(p_draft) -> 'ingredients'
        ) with ordinality as rows(ingredient, ordinality)
        left join public.food_product_ingredient_links as product_link
          on product_link.product_id =
            nullif(ingredient ->> 'food_product_id', '')::uuid
         and product_link.ingredient_id = (ingredient ->> 'ingredient_id')::uuid
         and product_link.relation = 'represents'
         and product_link.review_status = 'approved'
         and product_link.is_primary and product_link.is_active
      ), '[]'::jsonb)
    );
  end if;

  execute $guard$
  with draft_ingredient as (
    select ingredient, ordinality
    from jsonb_array_elements(
      public.canonicalize_recipe_future_draft($1) -> 'ingredients'
    ) with ordinality as rows(ingredient, ordinality)
  )
  select jsonb_build_object(
    'recipe_ingredients', coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', ingredient.ingredient -> 'ingredient_id',
      'amount', ingredient.ingredient -> 'amount',
      'unit', ingredient.ingredient -> 'unit',
      'ingredient_type', ingredient.ingredient -> 'ingredient_type',
      'scalable', ingredient.ingredient -> 'scalable',
      'sort_order', ingredient.ingredient -> 'sort_order',
      'food_product_id', case when product_link.id is null then null
        else ingredient.ingredient -> 'food_product_id' end,
      'food_product_nutrition_version_id', case when product_link.id is null then null
        else ingredient.ingredient -> 'food_product_nutrition_version_id' end,
      'nutrition_candidates', nutrition.candidates,
      'conversion_candidates', conversion.candidates,
      'selected_nutrition_link_id', selected.link_id,
      'selected_conversion_assignment_id', case
        when (
          (selected.basis_unit = 'g' and selected.is_volume_input)
          or (selected.basis_unit = 'ml' and selected.is_mass_input)
        ) and conversion.candidate_count = 1
        then conversion.single_assignment_id else null end
    ) order by ingredient.ordinality), '[]'::jsonb)
  )
  from draft_ingredient as ingredient
  left join public.food_product_ingredient_links as product_link
    on product_link.product_id = nullif(
      ingredient.ingredient ->> 'food_product_id', ''
    )::uuid
   and product_link.ingredient_id =
      (ingredient.ingredient ->> 'ingredient_id')::uuid
   and product_link.relation = 'represents'
   and product_link.review_status = 'approved'
   and product_link.is_primary
   and product_link.is_active
  left join lateral (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'link_id', link.id,
        'profile_id', profile.id,
        'source_item_id', source_item.id,
        'source_id', source.id,
        'preparation_state', link.preparation_state,
        'normalization_method', profile.normalization_method,
        'basis_amount', profile.basis_amount,
        'basis_unit', profile.basis_unit,
        'nutrition_values', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'nutrient_code', value.nutrient_code,
            'amount', value.amount,
            'value_status', value.value_status
          ) order by value.nutrient_code collate "C"), '[]'::jsonb)
          from public.nutrition_values as value
          where value.profile_id = profile.id
        ),
        'source', jsonb_build_object(
          'provider', source.provider_code,
          'dataset', source.dataset_name,
          'source_version', source.source_version,
          'data_basis_date', source.data_basis_date,
          'license', source.license_name,
          'source_url', source.source_url
        )
      ) order by link.id::text collate "C"), '[]'::jsonb) as candidates,
      count(*) filter (where profile.basis_unit = 'g') as mass_count,
      count(*) filter (where profile.basis_unit = 'ml') as volume_count,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'g'))[1] as single_mass_link_id,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'ml'))[1] as single_volume_link_id
    from public.ingredient_nutrition_profiles as link
    join public.nutrition_profiles as profile
      on profile.id = link.nutrition_profile_id
    join public.nutrition_source_items as source_item
      on source_item.id = profile.source_item_id
    join public.nutrition_sources as source on source.id = source_item.source_id
    where link.ingredient_id =
        (ingredient.ingredient ->> 'ingredient_id')::uuid
      and link.review_status = 'approved'
      and link.is_active and link.is_primary
      and profile.profile_kind = 'ingredient_source'
      and profile.normalization_method in ('mass_100g', 'volume_100ml')
      and profile.review_status = 'approved' and profile.is_active
      and profile.basis_amount = 100
      and ((profile.normalization_method = 'mass_100g' and profile.basis_unit = 'g')
        or (profile.normalization_method = 'volume_100ml' and profile.basis_unit = 'ml'))
      and source_item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current' and source.is_active
      and not exists (
        select 1 from public.nutrition_values as value
        where value.profile_id = profile.id
          and value.nutrient_code <> all(array[
            'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g',
            'sodium_mg', 'sugars_g', 'saturated_fat_g', 'fiber_g'
          ])
      )
  ) as nutrition on true
  left join lateral (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', assignment.id,
        'profile_id', profile.id,
        'evidence_id', evidence.id,
        'source_id', source.id,
        'preparation_state', assignment.preparation_state,
        'profile_code', profile.code,
        'basis_volume_ml', profile.basis_volume_ml,
        'representative_weight_g', profile.representative_weight_g,
        'normalized_g_per_15ml', evidence.normalized_g_per_15ml,
        'evidence_preparation_state', evidence.preparation_state,
        'source', jsonb_build_object(
          'provider', source.provider_code,
          'dataset', source.dataset_name,
          'source_version', source.source_version,
          'data_basis_date', source.data_basis_date,
          'license', source.license_name,
          'source_url', source.source_url
        )
      ) order by assignment.id::text collate "C"), '[]'::jsonb) as candidates,
      count(*) as candidate_count,
      (array_agg(assignment.id order by assignment.id::text collate "C"))[1]
        as single_assignment_id
    from public.ingredient_conversion_assignments as assignment
    join public.measurement_conversion_profiles as profile
      on profile.id = assignment.conversion_profile_id
    join public.measurement_source_evidence as evidence
      on evidence.id = assignment.evidence_id
    join public.nutrition_sources as source on source.id = evidence.source_id
    where assignment.ingredient_id =
        (ingredient.ingredient ->> 'ingredient_id')::uuid
      and assignment.review_status = 'approved' and assignment.is_active
      and profile.is_active and profile.basis_volume_ml = 15
      and ((profile.code = 'VOLUME_G6' and profile.representative_weight_g = 6)
        or (profile.code = 'VOLUME_G10' and profile.representative_weight_g = 10)
        or (profile.code = 'VOLUME_G15' and profile.representative_weight_g = 15)
        or (profile.code = 'VOLUME_G20' and profile.representative_weight_g = 20)
        or (profile.code = 'VOLUME_G25' and profile.representative_weight_g = 25))
      and evidence.evidence_kind = 'volume_weight'
      and evidence.normalized_g_per_15ml > 0
      and evidence.preparation_state = assignment.preparation_state
      and evidence.review_status = 'approved' and evidence.is_active
      and source.review_status = 'approved'
      and source.freshness_status = 'current' and source.is_active
  ) as conversion on true
  cross join lateral (
    select unit_flags.is_volume_input, unit_flags.is_mass_input,
      case
        when unit_flags.is_volume_input and nutrition.volume_count = 1
          then nutrition.single_volume_link_id
        when unit_flags.is_volume_input and nutrition.volume_count = 0
          and nutrition.mass_count = 1 then nutrition.single_mass_link_id
        when not unit_flags.is_volume_input and nutrition.mass_count = 1
          then nutrition.single_mass_link_id
        when unit_flags.is_mass_input and nutrition.mass_count = 0
          and nutrition.volume_count = 1 then nutrition.single_volume_link_id
        else null end as link_id,
      case
        when unit_flags.is_volume_input and nutrition.volume_count = 1 then 'ml'
        when unit_flags.is_volume_input and nutrition.volume_count = 0
          and nutrition.mass_count = 1 then 'g'
        when not unit_flags.is_volume_input and nutrition.mass_count = 1 then 'g'
        when unit_flags.is_mass_input and nutrition.mass_count = 0
          and nutrition.volume_count = 1 then 'ml'
        else null end as basis_unit
    from (select
      public.normalize_recipe_nutrition_unit(ingredient.ingredient ->> 'unit')
        in ('ml', 'l', 'tbsp', 'tsp', 'cup') as is_volume_input,
      public.normalize_recipe_nutrition_unit(ingredient.ingredient ->> 'unit')
        in ('g', 'kg') as is_mass_input
    ) as unit_flags
  ) as selected
  $guard$ into v_result using p_draft;
  return v_result;
end;
$function$;

create or replace function public.build_recipe_future_target_state(
  p_owner_uuid uuid,
  p_recipe_id uuid,
  p_as_of_date date
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'meal_id', meal.id,
    'revision', meal.revision,
    'content_snapshot_id', meal.recipe_content_snapshot_id,
    'claim_session_id', claim.session_id,
    'claim_session_status', session.status
  ) order by meal.id::text collate "C"), '[]'::jsonb)
  from public.meals as meal
  left join public.cooking_session_meal_claims as claim on claim.meal_id = meal.id
  left join public.cooking_sessions as session on session.id = claim.session_id
  where meal.user_id = p_owner_uuid
    and meal.recipe_id = p_recipe_id
    and meal.plan_date >= p_as_of_date
    and meal.status <> 'cook_done';
$function$;

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
  v_proposed_content_hash := encode(extensions.digest(convert_to(
    jsonb_build_array(
      v_canonical_draft ->> 'title',
      (v_canonical_draft ->> 'base_servings')::numeric,
      v_canonical_draft -> 'ingredients',
      v_canonical_draft -> 'steps'
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
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

create or replace function public.reconcile_incomplete_recipe_shopping_lists(
  p_owner_uuid uuid,
  p_recipe_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_list_id uuid;
begin
  -- Completed shopping is intentionally absent from this loop and therefore
  -- remains bit-for-bit immutable. Existing identity rows keep their checked
  -- and pantry-excluded state; only their derived amount projection changes.
  for v_list_id in
    select selected_list.id
    from (
      select distinct list.id
      from public.shopping_lists as list
      join public.meals as meal on meal.shopping_list_id = list.id
      where list.user_id = p_owner_uuid
        and not list.is_completed
        and meal.recipe_id = p_recipe_id
    ) as selected_list
    order by selected_list.id::text collate "C"
  loop
    perform 1
    from public.shopping_lists as list
    where list.id = v_list_id
    for update;

    with required as (
      select
        v_list_id as shopping_list_id,
        nullif(ingredient ->> 'food_product_id', '')::uuid as food_product_id,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
          as food_product_nutrition_version_id,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end as ingredient_id,
        coalesce(ingredient ->> 'display_text', dictionary.name) as display_text,
        jsonb_agg(jsonb_build_object(
          'amount', (ingredient ->> 'amount')::numeric
            * meal.planned_servings / snapshot.base_servings,
          'unit', ingredient ->> 'unit'
        ) order by meal.id::text collate "C") as amounts_json,
        min(coalesce((ingredient ->> 'sort_order')::integer, 0)) as sort_order
      from public.meals as meal
      join public.recipe_content_snapshots as snapshot
        on snapshot.id = meal.recipe_content_snapshot_id
      cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
      left join public.ingredients as dictionary
        on dictionary.id = (ingredient ->> 'ingredient_id')::uuid
      where meal.shopping_list_id = v_list_id
      group by
        nullif(ingredient ->> 'food_product_id', '')::uuid,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end,
        coalesce(ingredient ->> 'display_text', dictionary.name)
    )
    update public.shopping_list_items as item
    set display_text = required.display_text,
        amounts_json = required.amounts_json,
        sort_order = required.sort_order
    from required
    where item.shopping_list_id = v_list_id
      and item.ingredient_id is not distinct from required.ingredient_id
      and item.food_product_id is not distinct from required.food_product_id
      and item.food_product_nutrition_version_id
        is not distinct from required.food_product_nutrition_version_id;

    -- New requirements are created unchecked. Existing states are never
    -- overwritten by this INSERT path.
    insert into public.shopping_list_items (
      shopping_list_id, ingredient_id, food_product_id,
      food_product_nutrition_version_id, display_text, amounts_json,
      is_pantry_excluded, is_checked, added_to_pantry, sort_order
    )
    select required.shopping_list_id, required.ingredient_id,
           required.food_product_id, required.food_product_nutrition_version_id,
           required.display_text, required.amounts_json, false, false, false,
           required.sort_order
    from (
      select
        v_list_id as shopping_list_id,
        nullif(ingredient ->> 'food_product_id', '')::uuid as food_product_id,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
          as food_product_nutrition_version_id,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end as ingredient_id,
        coalesce(ingredient ->> 'display_text', dictionary.name) as display_text,
        jsonb_agg(jsonb_build_object(
          'amount', (ingredient ->> 'amount')::numeric
            * meal.planned_servings / snapshot.base_servings,
          'unit', ingredient ->> 'unit'
        ) order by meal.id::text collate "C") as amounts_json,
        min(coalesce((ingredient ->> 'sort_order')::integer, 0)) as sort_order
      from public.meals as meal
      join public.recipe_content_snapshots as snapshot
        on snapshot.id = meal.recipe_content_snapshot_id
      cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
      left join public.ingredients as dictionary
        on dictionary.id = (ingredient ->> 'ingredient_id')::uuid
      where meal.shopping_list_id = v_list_id
      group by
        nullif(ingredient ->> 'food_product_id', '')::uuid,
        nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid,
        case when nullif(ingredient ->> 'food_product_id', '') is null
          then (ingredient ->> 'ingredient_id')::uuid else null end,
        coalesce(ingredient ->> 'display_text', dictionary.name)
    ) as required
    where not exists (
      select 1 from public.shopping_list_items as existing
      where existing.shopping_list_id = required.shopping_list_id
        and existing.ingredient_id is not distinct from required.ingredient_id
        and existing.food_product_id is not distinct from required.food_product_id
        and existing.food_product_nutrition_version_id
          is not distinct from required.food_product_nutrition_version_id
    );

    delete from public.shopping_list_items as item
    where item.shopping_list_id = v_list_id
      and not exists (
        select 1
        from public.meals as meal
        join public.recipe_content_snapshots as snapshot
          on snapshot.id = meal.recipe_content_snapshot_id
        cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
        where meal.shopping_list_id = v_list_id
          and item.ingredient_id is not distinct from case
            when nullif(ingredient ->> 'food_product_id', '') is null
              then (ingredient ->> 'ingredient_id')::uuid else null end
          and item.food_product_id is not distinct from
            nullif(ingredient ->> 'food_product_id', '')::uuid
          and item.food_product_nutrition_version_id is not distinct from
            nullif(ingredient ->> 'food_product_nutrition_version_id', '')::uuid
      );
  end loop;
end;
$function$;

create or replace function public.protect_meal_recipe_content_pin_with_future_propagation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if old.recipe_content_snapshot_id is not distinct from new.recipe_content_snapshot_id
    and old.recipe_content_snapshot_origin is not distinct from new.recipe_content_snapshot_origin then
    return new;
  end if;
  if current_setting('homecook.recipe_future_propagation_writer', true) = 'on'
    and old.recipe_id is not distinct from new.recipe_id
    and new.recipe_content_snapshot_id is not null
    and new.recipe_content_snapshot_origin = 'created' then
    return new;
  end if;
  if current_setting('homecook.recipe_content_backfill', true) = 'on'
    and old.recipe_content_snapshot_id is null
    and new.recipe_content_snapshot_id is not null
    and new.recipe_content_snapshot_origin = 'legacy_backfill' then
    return new;
  end if;
  raise exception 'IMMUTABLE_MEAL_CONTENT_SNAPSHOT_PIN' using errcode = '42501';
end;
$function$;

drop trigger if exists protect_meal_recipe_content_pin on public.meals;
create trigger protect_meal_recipe_content_pin
before update of recipe_id, recipe_content_snapshot_id,
  recipe_content_snapshot_origin
on public.meals
for each row execute function
  public.protect_meal_recipe_content_pin_with_future_propagation();

create or replace function public.protect_meal_recipe_nutrition_pin_with_future_propagation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if old.recipe_id is not distinct from new.recipe_id
    and old.recipe_nutrition_snapshot_id is not distinct from new.recipe_nutrition_snapshot_id
    and old.nutrition_snapshot_origin is not distinct from new.nutrition_snapshot_origin then
    return new;
  end if;
  if current_setting('homecook.recipe_future_propagation_writer', true) = 'on'
    and old.recipe_id is not distinct from new.recipe_id
    and new.recipe_nutrition_snapshot_id is not null
    and new.nutrition_snapshot_origin = 'created' then
    return new;
  end if;
  if current_setting('homecook.recipe_nutrition_backfill', true) = 'on'
    and old.recipe_nutrition_snapshot_id is null
    and old.nutrition_snapshot_origin is null
    and new.recipe_nutrition_snapshot_id is not null
    and new.nutrition_snapshot_origin = 'backfill'
    and exists (
      select 1 from public.recipe_nutrition_snapshots as snapshot
      where snapshot.id = new.recipe_nutrition_snapshot_id
        and snapshot.recipe_id = new.recipe_id
    ) then
    return new;
  end if;
  raise exception 'IMMUTABLE_MEAL_NUTRITION_SNAPSHOT_PIN' using errcode = '42501';
end;
$function$;

drop trigger if exists protect_meal_recipe_nutrition_pin on public.meals;
create trigger protect_meal_recipe_nutrition_pin
before update of recipe_id, recipe_nutrition_snapshot_id,
  nutrition_snapshot_origin
on public.meals
for each row execute function
  public.protect_meal_recipe_nutrition_pin_with_future_propagation();

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

  -- Acquire every eligible Meal in UUID order before preview/idempotency/image
  -- resource rows. Re-entrant calls into #6 keep the same global->owner->recipe
  -- ordering and never perform a lock-only RPC followed by REST DML.
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
  v_content_hash := encode(extensions.digest(convert_to(jsonb_build_array(
    v_canonical_draft ->> 'title',
    (v_canonical_draft ->> 'base_servings')::numeric,
    v_canonical_draft -> 'ingredients',
    v_canonical_draft -> 'steps'
  )::text, 'UTF8'), 'sha256'), 'hex');
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

  -- Draft ingredient/product predecessor locks are deterministic and held
  -- through #6 content/nutrition creation.
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
  v_snapshot public.recipe_content_snapshots%rowtype;
  v_session_id uuid := extensions.gen_random_uuid();
  v_recipe_id uuid;
  v_content_snapshot_id uuid;
  v_cooking_servings integer;
  v_key_hash text;
  v_payload_hash text;
  v_result jsonb;
  v_meal record;
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
  if current_setting('homecook.snapshot_v2_creation', true) is distinct from 'on' then
    raise exception 'SNAPSHOT_V2_CREATION_DISABLED' using errcode = '55000';
  end if;

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
  end if;

  perform public.lock_personal_recipe_ids(array[v_recipe_id]);
  select recipe.* into v_recipe
  from public.recipes as recipe
  where recipe.id = v_recipe_id
  for update;
  if v_recipe.id is null or v_recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_recipe.visibility = 'private'
    and v_recipe.created_by is distinct from p_owner_uuid then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
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

  v_recipe := jsonb_build_object(
    'id', v_session.recipe_id,
    'title', v_snapshot.title,
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

create or replace function public.cancel_snapshot_v2_cooking_session(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_session_id uuid,
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
  v_session public.cooking_sessions%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_key_hash text;
  v_payload_hash text;
  v_result jsonb;
  v_recipe_id uuid;
  v_meal record;
begin
  if p_session_id is null or p_idempotency_key is null or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );

  select session.recipe_id into v_recipe_id
  from public.cooking_sessions as session
  where session.id = p_session_id
    and session.user_id = p_owner_uuid
    and session.contract_version = 'snapshot_v2';
  if v_recipe_id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.lock_personal_recipe_ids(array[v_recipe_id]);
  for v_meal in
    select meal.id
    from public.cooking_session_meals as session_meal
    join public.meals as meal on meal.id = session_meal.meal_id
    where session_meal.session_id = p_session_id
    order by meal.id::text collate "C"
    for update of meal
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-meal:' || v_meal.id::text, 0)
    );
  end loop;
  select session.* into v_session
  from public.cooking_sessions as session
  where session.id = p_session_id
    and session.user_id = p_owner_uuid
    and session.contract_version = 'snapshot_v2'
  for update;

  v_key_hash := encode(extensions.digest(
    convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'session_id', p_session_id, 'operation', 'cancel'
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.mutation_idempotency_keys (
    owner_uuid, account_generation, operation_scope, key_hash, payload_hash,
    state, attempt_token, lease_expires_at, created_at, updated_at
  ) values (
    p_owner_uuid, (v_authority ->> 'account_generation')::bigint,
    'snapshot_v2_cancel', v_key_hash, v_payload_hash, 'in_progress',
    extensions.gen_random_uuid(), p_now + interval '5 minutes', p_now, p_now
  ) on conflict (owner_uuid, account_generation, operation_scope, key_hash)
  do nothing returning * into v_idempotency;
  if v_idempotency.id is null then
    select receipt.* into v_idempotency
    from public.mutation_idempotency_keys as receipt
    where receipt.owner_uuid = p_owner_uuid
      and receipt.account_generation = (v_authority ->> 'account_generation')::bigint
      and receipt.operation_scope = 'snapshot_v2_cancel'
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

  if v_session.status = 'completed' then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  if v_session.status = 'in_progress' then
    update public.cooking_sessions
    set status = 'cancelled'
    where id = p_session_id;
    delete from public.cooking_session_meal_claims
    where session_id = p_session_id;
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'session_id', p_session_id,
      'contract_version', 'snapshot_v2',
      'mode', v_session.session_kind,
      'status', 'cancelled'
    ),
    'error', null
  );
  update public.mutation_idempotency_keys
  set state = 'succeeded', terminal_result = 'succeeded',
      durable_result = v_result, result_reference = p_session_id,
      attempt_token = null, lease_expires_at = null, updated_at = p_now
  where id = v_idempotency.id;
  return v_result;
end;
$function$;

create or replace function public.write_future_meal_with_snapshot_authority(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_action text,
  p_meal_id uuid default null,
  p_recipe_id uuid default null,
  p_plan_date date default null,
  p_column_id uuid default null,
  p_planned_servings integer default null,
  p_leftover_dish_id uuid default null,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, recipe_visibility_guard, pg_temp
as $function$
declare
  v_authority jsonb;
  v_meal public.meals%rowtype;
  v_recipe public.recipes%rowtype;
  v_column_owner uuid;
  v_leftover public.leftover_dishes%rowtype;
  v_recipe_id uuid;
begin
  if p_action not in ('create', 'update', 'delete') or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );

  if p_action = 'create' then
    if p_meal_id is not null or p_recipe_id is null or p_plan_date is null
      or p_column_id is null or p_planned_servings is null
      or p_planned_servings <= 0 then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    v_recipe_id := p_recipe_id;
  else
    if p_meal_id is null
      or (p_action = 'update' and (p_planned_servings is null or p_planned_servings <= 0))
      or (p_action = 'delete' and p_planned_servings is not null) then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    select meal.recipe_id into v_recipe_id
    from public.meals as meal
    where meal.id = p_meal_id;
    if v_recipe_id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  perform public.lock_personal_recipe_ids(array[v_recipe_id]);

  if p_action <> 'create' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-meal:' || p_meal_id::text, 0)
    );
    select meal.* into v_meal
    from public.meals as meal
    where meal.id = p_meal_id
    for update;
    if v_meal.id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_meal.user_id is distinct from p_owner_uuid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.cooking_session_meal_claims as claim
      where claim.meal_id = v_meal.id
    ) then
      raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode = '55000';
    end if;
  else
    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = p_recipe_id
    for key share;
    if v_recipe.id is null or v_recipe.deleted_at is not null
      or not (
        v_recipe.created_by = p_owner_uuid
        or (
          v_recipe.visibility = 'public'
          and recipe_visibility_guard.is_owner_publicly_visible(v_recipe.created_by)
        )
      ) then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;

    select planner_column.user_id into v_column_owner
    from public.meal_plan_columns as planner_column
    where planner_column.id = p_column_id
    for key share;
    if v_column_owner is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_column_owner is distinct from p_owner_uuid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if p_leftover_dish_id is not null then
      select leftover.* into v_leftover
      from public.leftover_dishes as leftover
      where leftover.id = p_leftover_dish_id
      for key share;
      if v_leftover.id is null then
        raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
      end if;
      if v_leftover.user_id is distinct from p_owner_uuid then
        raise exception 'FORBIDDEN' using errcode = '42501';
      end if;
      if v_leftover.recipe_id is distinct from p_recipe_id then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;
    end if;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );

  if p_action = 'create' then
    insert into public.meals (
      user_id, recipe_id, plan_date, column_id, planned_servings, status,
      is_leftover, leftover_dish_id, shopping_list_id, cooked_at,
      created_at, updated_at
    ) values (
      p_owner_uuid, p_recipe_id, p_plan_date, p_column_id, p_planned_servings,
      'registered', p_leftover_dish_id is not null, p_leftover_dish_id,
      null, null, p_now, p_now
    ) returning * into v_meal;
  elsif p_action = 'update' then
    update public.meals
    set planned_servings = p_planned_servings,
        updated_at = p_now
    where id = v_meal.id
    returning * into v_meal;

    if v_meal.shopping_list_id is not null then
      perform public.reconcile_incomplete_recipe_shopping_lists(
        p_owner_uuid, v_meal.recipe_id
      );
    end if;
  else
    delete from public.meals where id = v_meal.id;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );

  if p_action = 'delete' then
    return jsonb_build_object('id', p_meal_id, 'deleted', true);
  end if;
  if p_action = 'update' then
    return jsonb_build_object(
      'id', v_meal.id,
      'planned_servings', v_meal.planned_servings,
      'status', v_meal.status
    );
  end if;
  return jsonb_build_object(
    'id', v_meal.id,
    'recipe_id', v_meal.recipe_id,
    'plan_date', v_meal.plan_date,
    'column_id', v_meal.column_id,
    'planned_servings', v_meal.planned_servings,
    'status', v_meal.status,
    'is_leftover', v_meal.is_leftover,
    'leftover_dish_id', v_meal.leftover_dish_id,
    'recipe_nutrition_snapshot_id', v_meal.recipe_nutrition_snapshot_id
  );
end;
$function$;

create or replace function public.create_shopping_list_with_snapshot_authority(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_user_id uuid,
  p_title text,
  p_date_range_start date,
  p_date_range_end date,
  p_complete_without_list boolean,
  p_shopping_meal_ids uuid[],
  p_split_remainders jsonb default '[]'::jsonb,
  p_split_originals jsonb default '[]'::jsonb,
  p_recipe_rows jsonb default '[]'::jsonb,
  p_item_rows jsonb default '[]'::jsonb,
  p_pantry_item_count integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_authority jsonb;
  v_recipe_ids uuid[];
  v_meal_id uuid;
  v_requested_count integer;
  v_locked_count integer;
  v_invalid_count integer;
  v_legacy_recipe_rows jsonb;
  v_result jsonb;
  v_list_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if p_user_id is distinct from p_owner_uuid
    or p_user_id is null
    or jsonb_typeof(coalesce(p_recipe_rows, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_split_originals, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_split_remainders, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_item_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );

  select cardinality(coalesce(p_shopping_meal_ids, '{}'::uuid[])),
         count(distinct id)
  into v_requested_count, v_locked_count
  from unnest(coalesce(p_shopping_meal_ids, '{}'::uuid[])) as requested(id);
  if v_requested_count = 0 or v_locked_count <> v_requested_count then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select array_agg(recipe_id order by recipe_id::text collate "C")
  into v_recipe_ids
  from (
    select distinct meal.recipe_id
    from public.meals as meal
    where meal.id = any(p_shopping_meal_ids)
  ) as selected_recipe;
  perform public.lock_personal_recipe_ids(v_recipe_ids);

  for v_meal_id in
    select id from unnest(p_shopping_meal_ids) as requested(id)
    order by id::text collate "C"
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-meal:' || v_meal_id::text, 0)
    );
  end loop;

  perform meal.id
  from public.meals as meal
  join public.meal_plan_columns as planner_column
    on planner_column.id = meal.column_id
   and planner_column.user_id = p_owner_uuid
  join public.recipes as recipe
    on recipe.id = meal.recipe_id
   and recipe.deleted_at is null
   and (
     recipe.created_by = p_owner_uuid
     or (
       recipe.visibility = 'public'
       and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
     )
   )
  where meal.id = any(p_shopping_meal_ids)
    and meal.user_id = p_owner_uuid
    and meal.status = 'registered'
    and meal.shopping_list_id is null
  order by meal.id::text collate "C"
  for update of meal;

  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_requested_count then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.cooking_session_meal_claims as claim
    where claim.meal_id = any(p_shopping_meal_ids)
  ) then
    raise exception 'MEAL_COOKING_ALREADY_STARTED' using errcode = '55000';
  end if;

  with expected as (
    select
      meal.recipe_id,
      meal.recipe_content_snapshot_id,
      sum(coalesce(split.planned_servings, meal.planned_servings))::integer
        as planned_servings_total
    from public.meals as meal
    left join lateral (
      select (item ->> 'planned_servings')::integer as planned_servings
      from jsonb_array_elements(coalesce(p_split_originals, '[]'::jsonb)) as item
      where (item ->> 'meal_id')::uuid = meal.id
    ) as split on true
    where meal.id = any(p_shopping_meal_ids)
    group by meal.recipe_id, meal.recipe_content_snapshot_id
  ), provided as (
    select
      (item ->> 'recipe_id')::uuid as recipe_id,
      nullif(item ->> 'recipe_content_snapshot_id', '')::uuid
        as recipe_content_snapshot_id,
      (item ->> 'planned_servings_total')::integer as planned_servings_total,
      (item ->> 'shopping_servings')::integer as shopping_servings
    from jsonb_array_elements(coalesce(p_recipe_rows, '[]'::jsonb)) as item
  ), mismatched as (
    select expected.recipe_id as expected_recipe_id,
           provided.recipe_id as provided_recipe_id
    from expected
    full join provided
      on provided.recipe_id = expected.recipe_id
     and provided.recipe_content_snapshot_id
       is not distinct from expected.recipe_content_snapshot_id
    where expected.recipe_id is null
      or provided.recipe_id is null
      or provided.planned_servings_total is distinct from expected.planned_servings_total
      or provided.shopping_servings is null
      or provided.shopping_servings <= 0
  )
  select
    (select count(*) from mismatched)
    + greatest(
        (select count(*) from provided)
        - (select count(distinct (recipe_id, recipe_content_snapshot_id)) from provided),
        0
      )
  into v_invalid_count;
  if v_invalid_count <> 0 then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'recipe_id', grouped.recipe_id,
    'shopping_servings', grouped.shopping_servings,
    'planned_servings_total', grouped.planned_servings_total
  ) order by grouped.recipe_id::text collate "C"), '[]'::jsonb)
  into v_legacy_recipe_rows
  from (
    select (item ->> 'recipe_id')::uuid as recipe_id,
           sum((item ->> 'shopping_servings')::integer)::integer as shopping_servings,
           sum((item ->> 'planned_servings_total')::integer)::integer
             as planned_servings_total
    from jsonb_array_elements(p_recipe_rows) as item
    group by (item ->> 'recipe_id')::uuid
  ) as grouped;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  perform set_config('request.jwt.claim.sub', p_owner_uuid::text, true);

  begin
    v_result := public.create_shopping_list_from_payload(
      p_owner_uuid, p_title, p_date_range_start, p_date_range_end,
      p_complete_without_list, p_shopping_meal_ids, p_split_remainders,
      p_split_originals, v_legacy_recipe_rows, p_item_rows,
      p_pantry_item_count
    );

    if v_result ->> 'error_code' is null
      and nullif(v_result ->> 'id', '') is not null then
      v_list_id := (v_result ->> 'id')::uuid;
      delete from public.shopping_list_recipes
      where shopping_list_id = v_list_id;

      insert into public.shopping_list_recipes (
        shopping_list_id, recipe_id, recipe_content_snapshot_id,
        shopping_servings, planned_servings_total
      )
      select v_list_id,
             (item ->> 'recipe_id')::uuid,
             nullif(item ->> 'recipe_content_snapshot_id', '')::uuid,
             (item ->> 'shopping_servings')::integer,
             (item ->> 'planned_servings_total')::integer
      from jsonb_array_elements(p_recipe_rows) as item
      order by (item ->> 'recipe_id')::uuid::text collate "C",
               nullif(item ->> 'recipe_content_snapshot_id', '')::uuid::text
                 collate "C";
    end if;
  exception when others then
    perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
    perform public.set_account_generation_internal_writer_marker(
      (v_authority ->> 'cutover_attempt_id')::uuid, false
    );
    raise;
  end;

  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );
  return v_result;
end;
$function$;

create or replace function public.cleanup_expired_recipe_change_previews(
  p_before timestamptz default clock_timestamp()
)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_deleted bigint;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  ) <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.recipe_change_previews
  where expires_at < p_before;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

alter function public.pin_recipe_snapshot_for_future_meal_insert() owner to postgres;
alter function public.assert_recipe_future_session_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone) owner to postgres;
alter function public.canonicalize_recipe_future_draft(jsonb) owner to postgres;
alter function public.build_recipe_draft_nutrition_predecessor_guard(jsonb) owner to postgres;
alter function public.build_recipe_future_target_state(uuid,uuid,date) owner to postgres;
alter function public.preview_recipe_future_plan_impact(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,timestamp with time zone) owner to postgres;
alter function public.reconcile_incomplete_recipe_shopping_lists(uuid,uuid) owner to postgres;
alter function public.protect_meal_recipe_content_pin_with_future_propagation() owner to postgres;
alter function public.protect_meal_recipe_nutrition_pin_with_future_propagation() owner to postgres;
alter function public.write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone) owner to postgres;
alter function public.start_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamp with time zone) owner to postgres;
alter function public.read_snapshot_v2_cook_mode(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone) owner to postgres;
alter function public.cancel_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,timestamp with time zone) owner to postgres;
alter function public.write_future_meal_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,date,uuid,integer,uuid,timestamp with time zone) owner to postgres;
alter function public.create_shopping_list_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer) owner to postgres;
alter function public.cleanup_expired_recipe_change_previews(timestamp with time zone) owner to postgres;

revoke all on function public.pin_recipe_snapshot_for_future_meal_insert() from public, anon, authenticated, service_role;
revoke all on function public.assert_recipe_future_session_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.canonicalize_recipe_future_draft(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_draft_nutrition_predecessor_guard(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_future_target_state(uuid,uuid,date) from public, anon, authenticated, service_role;
revoke all on function public.preview_recipe_future_plan_impact(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_incomplete_recipe_shopping_lists(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.protect_meal_recipe_content_pin_with_future_propagation() from public, anon, authenticated, service_role;
revoke all on function public.protect_meal_recipe_nutrition_pin_with_future_propagation() from public, anon, authenticated, service_role;
revoke all on function public.write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.start_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.read_snapshot_v2_cook_mode(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.cancel_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.write_future_meal_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,date,uuid,integer,uuid,timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.create_shopping_list_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_expired_recipe_change_previews(timestamp with time zone) from public, anon, authenticated, service_role;

grant execute on function public.build_recipe_draft_nutrition_predecessor_guard(jsonb) to service_role;
grant execute on function public.preview_recipe_future_plan_impact(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,timestamp with time zone) to service_role;
grant execute on function public.write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone) to service_role;
grant execute on function public.start_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamp with time zone) to service_role;
grant execute on function public.read_snapshot_v2_cook_mode(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone) to service_role;
grant execute on function public.cancel_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,timestamp with time zone) to service_role;
grant execute on function public.write_future_meal_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,date,uuid,integer,uuid,timestamp with time zone) to service_role;
grant execute on function public.create_shopping_list_with_snapshot_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer) to service_role;
grant execute on function public.cleanup_expired_recipe_change_previews(timestamp with time zone) to service_role;

commit;
