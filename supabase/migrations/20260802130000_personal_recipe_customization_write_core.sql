-- Dormant personal-recipe write core. There is deliberately no public route or
-- durable capability row in this migration. A trusted server transaction must
-- set homecook.personal_recipe_v2=on, and the repository ships no caller that
-- does so until the #7/#8 release gate is complete.

begin;

-- The official ingredient contract keeps the canonical ingredient while
-- pinning the exact approved product/version provenance when one was used.
-- These columns belong to this migration; disposable runners must not seed
-- them ahead of the target migration.
alter table public.recipe_ingredients
  add column if not exists food_product_id uuid,
  add column if not exists food_product_nutrition_version_id uuid;

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredient_product_provenance_pair,
  drop constraint if exists recipe_ingredient_product_version_fkey;

alter table public.recipe_ingredients
  add constraint recipe_ingredient_product_provenance_pair check (
    (food_product_id is null and food_product_nutrition_version_id is null)
    or
    (food_product_id is not null and food_product_nutrition_version_id is not null)
  ),
  add constraint recipe_ingredient_product_version_fkey
    foreign key (food_product_id, food_product_nutrition_version_id)
    references public.food_product_nutrition_versions (product_id, id)
    on delete restrict;

create or replace function public.enforce_recipe_ingredient_product_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.food_product_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.food_product_ingredient_links as link
    where link.product_id = new.food_product_id
      and link.ingredient_id = new.ingredient_id
      and link.relation = 'represents'
      and link.review_status = 'approved'
      and link.is_primary
      and link.is_active
  ) then
    raise exception 'recipe_ingredient_product_link_guard'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists recipe_ingredient_product_link_guard
  on public.recipe_ingredients;
create trigger recipe_ingredient_product_link_guard
before insert or update of ingredient_id, food_product_id,
  food_product_nutrition_version_id
on public.recipe_ingredients
for each row execute function public.enforce_recipe_ingredient_product_link();

revoke all on function public.enforce_recipe_ingredient_product_link()
  from public, anon, authenticated, service_role;

create or replace function public.lock_personal_recipe_ids(
  p_recipe_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_recipe_id uuid;
begin
  for v_recipe_id in
    select recipe_id
    from (
      select distinct recipe_id
      from unnest(coalesce(p_recipe_ids, '{}'::uuid[])) as ids(recipe_id)
      where recipe_id is not null
    ) as distinct_ids
    order by recipe_id::text collate "C"
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'homecook-personal-recipe:' || v_recipe_id::text,
        0
      )
    );
  end loop;
end;
$function$;

create or replace function public.write_personal_recipe_core(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamp with time zone,
  p_operation text,
  p_recipe_id uuid,
  p_source_recipe_id uuid,
  p_base_recipe_revision bigint,
  p_draft jsonb,
  p_nutrition_snapshot jsonb,
  p_tags jsonb,
  p_image_object_id uuid,
  p_expected_cleanup_generation bigint,
  p_idempotency_key uuid,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability_state text;
  v_cutover_attempt_id uuid;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_affected_owner_lifecycle public.user_account_lifecycles%rowtype;
  v_affected_owner uuid;
  v_affected_owner_candidates uuid[] := '{}'::uuid[];
  v_pre_recipe_created_by uuid;
  v_pre_recipe_visibility text;
  v_pre_recipe_deleted_at timestamp with time zone;
  v_pre_source_created_by uuid;
  v_pre_source_visibility text;
  v_pre_source_deleted_at timestamp with time zone;
  v_auth_control jsonb;
  v_session_authority jsonb;
  v_recipe public.recipes%rowtype;
  v_source public.recipes%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_operation_scope text;
  v_key_hash text;
  v_payload_hash text;
  v_result_recipe_id uuid;
  v_content_hash text;
  v_nutrition_payload jsonb;
  v_nutrition_guard jsonb;
  v_nutrition_result jsonb;
  v_nutrition_snapshot_id uuid;
  v_content_snapshot_id uuid;
  v_result jsonb;
  v_ingredient jsonb;
  v_step jsonb;
  v_requested_ingredient_id uuid;
  v_ingredient_id uuid;
  v_product_id uuid;
  v_product_version_id uuid;
  v_product_name text;
  v_product_brand text;
  v_step_id uuid;
  v_target_ingredient_count integer := 0;
  v_canonical_draft jsonb;
  v_canonical_nutrition_snapshot jsonb;
  v_canonical_ingredients jsonb := '[]'::jsonb;
  v_canonical_steps jsonb := '[]'::jsonb;
  v_canonical_tags jsonb := '[]'::jsonb;
  v_existing_image_object_id uuid;
  v_image_outbox_id uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'personal recipe write requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_operation not in ('create', 'fork', 'update', 'save_as_new', 'delete')
    or p_idempotency_key is null
    or p_now is null
    or (
      p_operation in ('create', 'fork', 'update', 'save_as_new')
      and (
        jsonb_typeof(p_draft) <> 'object'
        or jsonb_typeof(p_nutrition_snapshot) <> 'object'
        or jsonb_typeof(p_draft -> 'ingredients') <> 'array'
        or jsonb_typeof(p_draft -> 'steps') <> 'array'
        or jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array'
      )
    )
  then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  if p_operation <> 'delete' then
    if exists (
      select 1 from jsonb_object_keys(p_draft) as key
      where key not in ('title', 'description', 'base_servings', 'ingredients', 'steps')
    ) or exists (
      select 1 from jsonb_array_elements(p_draft -> 'ingredients') as item
      where jsonb_typeof(item) <> 'object'
    ) or exists (
      select 1 from jsonb_array_elements(p_draft -> 'steps') as item
      where jsonb_typeof(item) <> 'object'
    ) or exists (
      select 1 from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as item
      where jsonb_typeof(item) <> 'object'
    ) then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_draft -> 'ingredients') as item,
        lateral jsonb_object_keys(item) as key
      where key not in (
        'ingredient_id', 'amount', 'unit', 'ingredient_type', 'display_text',
        'component_label', 'scalable', 'food_product_id',
        'food_product_nutrition_version_id'
      )
    ) or exists (
      select 1
      from jsonb_array_elements(p_draft -> 'steps') as item,
        lateral jsonb_object_keys(item) as key
      where key not in (
        'step_number', 'instruction', 'cooking_method_id',
        'cooking_method_ids', 'ingredients_used', 'component_label',
        'heat_level', 'duration_seconds', 'duration_text'
      )
    ) or exists (
      select 1
      from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as item,
        lateral jsonb_object_keys(item) as key
      where key not in ('normalized_key', 'label')
    ) or exists (
      select 1 from jsonb_object_keys(p_nutrition_snapshot) as key
      where key not in (
        'calculation_version', 'scalable_values', 'fixed_values',
        'nutrient_status', 'calculation_status', 'calculation_quality',
        'reflected_ingredient_count', 'target_ingredient_count',
        'missing_reasons', 'warnings', 'sources'
      )
    ) then
      -- Reject client authority/server-owned fields with the existing official
      -- validation failure instead of silently hashing values the server ignores.
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    select jsonb_build_object(
      'title', btrim(p_draft ->> 'title'),
      'description', nullif(p_draft ->> 'description', ''),
      'base_servings', (p_draft ->> 'base_servings')::integer,
      'ingredients', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'ingredient_id', nullif(item ->> 'ingredient_id', '')::uuid,
          'amount', nullif(item ->> 'amount', '')::numeric,
          'unit', nullif(item ->> 'unit', ''),
          'ingredient_type', coalesce(nullif(item ->> 'ingredient_type', ''), 'QUANT'),
          'display_text', nullif(item ->> 'display_text', ''),
          'component_label', nullif(item ->> 'component_label', ''),
          'scalable', coalesce((item ->> 'scalable')::boolean, true),
          'food_product_id', nullif(item ->> 'food_product_id', '')::uuid,
          'food_product_nutrition_version_id',
            nullif(item ->> 'food_product_nutrition_version_id', '')::uuid
        )) order by ordinality)
        from jsonb_array_elements(p_draft -> 'ingredients')
          with ordinality as ingredient_rows(item, ordinality)
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'step_number', (item ->> 'step_number')::integer,
          'instruction', item ->> 'instruction',
          'cooking_method_id', nullif(item ->> 'cooking_method_id', '')::uuid,
          'cooking_method_ids', case
            when jsonb_typeof(item -> 'cooking_method_ids') = 'array'
              then item -> 'cooking_method_ids'
            else null
          end,
          'ingredients_used', coalesce(item -> 'ingredients_used', '[]'::jsonb),
          'component_label', nullif(item ->> 'component_label', ''),
          'heat_level', nullif(item ->> 'heat_level', ''),
          'duration_seconds', nullif(item ->> 'duration_seconds', '')::integer,
          'duration_text', nullif(item ->> 'duration_text', '')
        )) order by ordinality)
        from jsonb_array_elements(p_draft -> 'steps')
          with ordinality as step_rows(item, ordinality)
      ), '[]'::jsonb)
    ) into v_canonical_draft;

    v_canonical_nutrition_snapshot := p_nutrition_snapshot;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'normalized_key', item ->> 'normalized_key',
      'label', item ->> 'label'
    )) order by ordinality), '[]'::jsonb)
      into v_canonical_tags
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
      with ordinality as tag_rows(item, ordinality);
  end if;

  if current_setting('homecook.personal_recipe_v2', true) is distinct from 'on' then
    -- Internal dark gate only; this exception is never mapped to a public API code.
    raise exception 'personal recipe capability is disabled'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  -- Read and pin the global full-local control before the owner lock. The
  -- canonical assertion is called after owner lifecycle acquisition so its
  -- binding row lock remains in the official global -> owner -> resource order.
  v_auth_control := public.read_full_local_auth_control();
  perform 1
  from private.full_local_auth_control as control
  where control.singleton
  for share;

  select capability.state, capability.current_cutover_attempt_id
    into v_capability_state, v_cutover_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state = 'cutover_maintenance' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE' using errcode = '55000';
  end if;
  if v_capability_state is distinct from 'generation_active' then
    raise exception 'ACCOUNT_GENERATION_STALE' using errcode = '55000';
  end if;

  v_result_recipe_id := case
    when p_operation in ('create', 'fork', 'save_as_new')
      then extensions.gen_random_uuid()
    else p_recipe_id
  end;

  if (p_operation in ('update', 'delete') and p_recipe_id is null)
    or (p_operation = 'fork' and p_source_recipe_id is null)
    or (p_operation = 'save_as_new' and p_source_recipe_id is null)
  then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  -- Mutation-free authority discovery must happen before any owner or recipe
  -- lock. Rows are re-read under recipe locks below, so this pre-read grants no
  -- authority and any owner/visibility/deletion drift fails closed.
  if p_recipe_id is not null then
    select recipe.created_by, recipe.visibility, recipe.deleted_at
      into v_pre_recipe_created_by, v_pre_recipe_visibility,
        v_pre_recipe_deleted_at
    from public.recipes as recipe
    where recipe.id = p_recipe_id;
  end if;
  if p_source_recipe_id is not null then
    select source.created_by, source.visibility, source.deleted_at
      into v_pre_source_created_by, v_pre_source_visibility,
        v_pre_source_deleted_at
    from public.recipes as source
    where source.id = p_source_recipe_id;
  end if;

  select coalesce(
    array_agg(owner_uuid order by owner_uuid::text collate "C"),
    '{}'::uuid[]
  )
    into v_affected_owner_candidates
  from (
    select distinct owner_uuid
    from unnest(array[
      p_owner_uuid,
      v_pre_recipe_created_by,
      v_pre_source_created_by
    ]) as affected(owner_uuid)
    where owner_uuid is not null
  ) as candidates;

  -- Every requester/source/target owner is acquired in one deterministic UUID
  -- order before any recipe advisory or row lock. The canonical session
  -- assertion runs only after this loop and therefore cannot reintroduce a
  -- requester-first inversion.
  foreach v_affected_owner in array v_affected_owner_candidates loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'homecook-account-owner:' || v_affected_owner::text,
        0
      )
    );

    if v_affected_owner = p_owner_uuid then
      select lifecycle.*
        into v_lifecycle
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = v_affected_owner
      order by lifecycle.account_generation desc
      limit 1
      for update;
    else
      select lifecycle.*
        into v_affected_owner_lifecycle
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = v_affected_owner
      order by lifecycle.account_generation desc
      limit 1
      for share;
    end if;
  end loop;

  if v_lifecycle.owner_uuid is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED' using errcode = '55000';
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

  if v_cutover_attempt_id is null then
    raise exception 'ACCOUNT_GENERATION_STALE' using errcode = '55000';
  end if;

  perform public.lock_personal_recipe_ids(array[
    p_recipe_id,
    p_source_recipe_id,
    v_result_recipe_id
  ]);
  perform public.lock_recipe_nutrition_recipe_ids(array[
    p_recipe_id,
    p_source_recipe_id,
    v_result_recipe_id
  ]);

  -- Resource rows are acquired only after the common fence, owner lock and the
  -- UUID-ascending recipe advisory locks above.
  if p_recipe_id is not null then
    select recipe.*
      into v_recipe
    from public.recipes as recipe
    where recipe.id = p_recipe_id
    for update;
  end if;
  if p_source_recipe_id is not null then
    select source.*
      into v_source
    from public.recipes as source
    where source.id = p_source_recipe_id
    for update;
  end if;

  if p_source_recipe_id is not null
    and (
      v_source.created_by is distinct from v_pre_source_created_by
      or v_source.visibility is distinct from v_pre_source_visibility
      or v_source.deleted_at is distinct from v_pre_source_deleted_at
    )
  then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_recipe_id is not null
    and (
      v_recipe.created_by is distinct from v_pre_recipe_created_by
      or v_recipe.visibility is distinct from v_pre_recipe_visibility
      or v_recipe.deleted_at is distinct from v_pre_recipe_deleted_at
    )
  then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_operation_scope := 'personal_recipe_' || p_operation;
  v_key_hash := encode(
    extensions.digest(convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_payload_hash := encode(
    extensions.digest(
      convert_to(
        (
          case p_operation
            when 'delete' then jsonb_build_object(
              'operation', p_operation,
              'recipe_id', p_recipe_id
            )
            when 'update' then jsonb_build_object(
              'operation', p_operation,
              'recipe_id', p_recipe_id,
              'base_recipe_revision', p_base_recipe_revision
            )
            when 'fork' then jsonb_build_object(
              'operation', p_operation,
              'source_recipe_id', p_source_recipe_id
            )
            when 'save_as_new' then jsonb_build_object(
              'operation', p_operation,
              'source_recipe_id', p_source_recipe_id
            )
            else jsonb_build_object('operation', p_operation)
          end
          || case when p_operation = 'delete' then '{}'::jsonb else
            jsonb_build_object(
              'draft', v_canonical_draft,
              'nutrition_snapshot', v_canonical_nutrition_snapshot,
              'tags', v_canonical_tags,
              'image', case when p_image_object_id is null then null else
                jsonb_build_object(
                  'object_id', p_image_object_id,
                  'expected_cleanup_generation', p_expected_cleanup_generation
                )
              end
            )
          end
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    owner_uuid,
    account_generation,
    operation_scope,
    key_hash,
    payload_hash,
    state,
    attempt_token,
    lease_expires_at,
    created_at,
    updated_at
  ) values (
    p_owner_uuid,
    v_lifecycle.account_generation,
    v_operation_scope,
    v_key_hash,
    v_payload_hash,
    'in_progress',
    extensions.gen_random_uuid(),
    p_now + interval '5 minutes',
    p_now,
    p_now
  )
  on conflict (
    owner_uuid,
    account_generation,
    operation_scope,
    key_hash
  ) do nothing
  returning * into v_idempotency;

  if v_idempotency.id is null then
    select idempotency.*
      into v_idempotency
    from public.mutation_idempotency_keys as idempotency
    where idempotency.owner_uuid = p_owner_uuid
      and idempotency.account_generation = v_lifecycle.account_generation
      and idempotency.operation_scope = v_operation_scope
      and idempotency.key_hash = v_key_hash
    for update;

    if v_idempotency.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    if v_idempotency.state = 'succeeded' then
      return v_idempotency.durable_result;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
  end if;

  if p_operation = 'fork' then
    if v_source.id is null
      or v_source.visibility is distinct from 'public'
      or v_source.deleted_at is not null
      or recipe_visibility_guard.is_owner_publicly_visible(v_source.created_by)
        is not true
    then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  elsif p_operation = 'save_as_new' then
    if v_source.id is null
      or v_source.created_by is distinct from p_owner_uuid
      or v_source.visibility is distinct from 'private'
      or v_source.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  elsif p_operation in ('update', 'delete') then
    if v_recipe.id is not null and v_recipe.visibility = 'public' then
      if v_recipe.deleted_at is not null
        or recipe_visibility_guard.is_owner_publicly_visible(v_recipe.created_by)
          is not true
      then
        raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
      end if;
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_recipe.id is null
      or v_recipe.created_by is distinct from p_owner_uuid
      or v_recipe.visibility is distinct from 'private' then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_operation = 'update' and v_recipe.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_operation = 'update'
      and (
        p_base_recipe_revision is null
        or v_recipe.revision is distinct from p_base_recipe_revision
      ) then
      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_cutover_attempt_id,
    true
  );

  if p_operation = 'delete' then
    update public.recipes as recipe
    set deleted_at = coalesce(recipe.deleted_at, p_now),
        updated_at = case when recipe.deleted_at is null then p_now else recipe.updated_at end,
        revision = case when recipe.deleted_at is null then recipe.revision + 1 else recipe.revision end
    where recipe.id = p_recipe_id;

    update public.recipe_tags
    set visibility = 'private'
    where recipe_id = p_recipe_id
      and visibility <> 'private';

    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = p_recipe_id;

    v_result := jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'id', p_recipe_id,
        'revision', v_recipe.revision,
        'deleted_at', v_recipe.deleted_at,
        'account_generation', v_lifecycle.account_generation
      ),
      'error', null
    );
  else
    if nullif(btrim(p_draft ->> 'title'), '') is null
      or length(btrim(p_draft ->> 'title')) > 200
      or coalesce((p_draft ->> 'base_servings')::integer, 0) <= 0
      or jsonb_array_length(p_draft -> 'ingredients') = 0
      or jsonb_array_length(p_draft -> 'steps') = 0 then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    if jsonb_array_length(coalesce(p_tags, '[]'::jsonb)) > 20 then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    if p_operation in ('create', 'fork', 'save_as_new') then
      insert into public.recipes (
        id,
        title,
        description,
        source_type,
        base_servings,
        created_by,
        visibility,
        origin_recipe_id,
        revision,
        created_at,
        updated_at
      ) values (
        v_result_recipe_id,
        btrim(p_draft ->> 'title'),
        nullif(p_draft ->> 'description', ''),
        'manual',
        (p_draft ->> 'base_servings')::integer,
        p_owner_uuid,
        'private',
        case when p_operation = 'fork' then p_source_recipe_id else null end,
        1,
        p_now,
        p_now
      );
    else
      update public.recipes as recipe
      set title = btrim(p_draft ->> 'title'),
          description = nullif(p_draft ->> 'description', ''),
          base_servings = (p_draft ->> 'base_servings')::integer,
          revision = recipe.revision + 1,
          updated_at = p_now
      where recipe.id = p_recipe_id;
      v_result_recipe_id := p_recipe_id;
    end if;

    delete from public.recipe_step_cooking_methods as link
    using public.recipe_steps as step
    where step.recipe_id = v_result_recipe_id
      and link.step_id = step.id;
    delete from public.recipe_steps
    where recipe_id = v_result_recipe_id;
    delete from public.recipe_ingredients
    where recipe_id = v_result_recipe_id;

    for v_ingredient in
      select value
      from jsonb_array_elements(p_draft -> 'ingredients')
    loop
      v_requested_ingredient_id :=
        nullif(v_ingredient ->> 'ingredient_id', '')::uuid;
      v_ingredient_id := v_requested_ingredient_id;
      v_product_id := nullif(v_ingredient ->> 'food_product_id', '')::uuid;
      v_product_version_id :=
        nullif(v_ingredient ->> 'food_product_nutrition_version_id', '')::uuid;
      v_product_name := null;
      v_product_brand := null;

      if (v_product_id is null) <> (v_product_version_id is null) then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      if v_product_id is not null then
        select link.ingredient_id, product.name, product.brand
          into v_ingredient_id, v_product_name, v_product_brand
        from public.food_product_nutrition_versions as version
        join public.food_products as product
          on product.id = version.product_id
         and product.deleted_at is null
         and product.moderation_status = 'visible'
         and (
           product.visibility = 'public'
           or product.owner_user_id = p_owner_uuid
         )
        join public.food_product_ingredient_links as link
          on link.product_id = product.id
         and link.relation = 'represents'
         and link.review_status = 'approved'
         and link.is_primary
         and link.is_active
        where version.product_id = v_product_id
          and version.id = v_product_version_id;

        if v_ingredient_id is null
          or (
            v_requested_ingredient_id is not null
            and v_requested_ingredient_id is distinct from v_ingredient_id
          ) then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;
      end if;

      if v_ingredient_id is null then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      insert into public.recipe_ingredients (
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ingredient_type,
        display_text,
        component_label,
        sort_order,
        scalable,
        food_product_id,
        food_product_nutrition_version_id
      ) values (
        v_result_recipe_id,
        v_ingredient_id,
        nullif(v_ingredient ->> 'amount', '')::numeric,
        nullif(v_ingredient ->> 'unit', ''),
        coalesce(nullif(v_ingredient ->> 'ingredient_type', ''), 'QUANT')::public.recipe_ingredient_type,
        nullif(v_ingredient ->> 'display_text', ''),
        nullif(v_ingredient ->> 'component_label', ''),
        v_target_ingredient_count,
        coalesce((v_ingredient ->> 'scalable')::boolean, true),
        v_product_id,
        v_product_version_id
      );
      v_canonical_ingredients := v_canonical_ingredients || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'ingredient_id', v_ingredient_id,
          'amount', nullif(v_ingredient ->> 'amount', '')::numeric,
          'unit', nullif(v_ingredient ->> 'unit', ''),
          'ingredient_type', coalesce(nullif(v_ingredient ->> 'ingredient_type', ''), 'QUANT'),
          'display_text', nullif(v_ingredient ->> 'display_text', ''),
          'component_label', nullif(v_ingredient ->> 'component_label', ''),
          'sort_order', v_target_ingredient_count,
          'scalable', coalesce((v_ingredient ->> 'scalable')::boolean, true),
          'food_product_id', v_product_id,
          'food_product_nutrition_version_id', v_product_version_id,
          'food_product_name', v_product_name,
          'food_product_brand', v_product_brand
        ))
      );
      v_target_ingredient_count := v_target_ingredient_count + 1;
    end loop;

    for v_step in
      select value
      from jsonb_array_elements(p_draft -> 'steps')
    loop
      insert into public.recipe_steps (
        recipe_id,
        step_number,
        instruction,
        cooking_method_id,
        ingredients_used,
        component_label,
        heat_level,
        duration_seconds,
        duration_text
      ) values (
        v_result_recipe_id,
        (v_step ->> 'step_number')::integer,
        v_step ->> 'instruction',
        (v_step ->> 'cooking_method_id')::uuid,
        coalesce(v_step -> 'ingredients_used', '[]'::jsonb),
        nullif(v_step ->> 'component_label', ''),
        nullif(v_step ->> 'heat_level', ''),
        nullif(v_step ->> 'duration_seconds', '')::integer,
        nullif(v_step ->> 'duration_text', '')
      ) returning id into v_step_id;

      v_canonical_steps := v_canonical_steps || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'step_number', (v_step ->> 'step_number')::integer,
          'instruction', v_step ->> 'instruction',
          'cooking_method_id', (v_step ->> 'cooking_method_id')::uuid,
          'ingredients_used', coalesce(v_step -> 'ingredients_used', '[]'::jsonb),
          'component_label', nullif(v_step ->> 'component_label', ''),
          'heat_level', nullif(v_step ->> 'heat_level', ''),
          'duration_seconds', nullif(v_step ->> 'duration_seconds', '')::integer,
          'duration_text', nullif(v_step ->> 'duration_text', ''),
          'cooking_method_ids', case
            when jsonb_typeof(v_step -> 'cooking_method_ids') = 'array'
              then v_step -> 'cooking_method_ids'
            else null
          end
        ))
      );

      if jsonb_typeof(v_step -> 'cooking_method_ids') = 'array' then
        insert into public.recipe_step_cooking_methods (
          step_id,
          method_id,
          position
        )
        select
          v_step_id,
          method_id::uuid,
          ordinality::integer
        from jsonb_array_elements_text(v_step -> 'cooking_method_ids')
          with ordinality as methods(method_id, ordinality);
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'normalized_key', tag ->> 'normalized_key',
      'label', tag ->> 'label',
      'kind', 'user',
      'is_system', false,
      'theme_eligible', false,
      'source', 'user_selected',
      'visibility', 'private',
      'review_status', 'approved'
    ) order by ordinality), '[]'::jsonb)
      into v_canonical_tags
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
      with ordinality as tag_rows(tag, ordinality);

    perform public.set_recipe_tags(
      v_result_recipe_id,
      v_canonical_tags,
      p_owner_uuid,
      'user_selected'
    );

    v_content_hash := encode(
      extensions.digest(
        convert_to(
          jsonb_build_array(
            btrim(p_draft ->> 'title'),
            (p_draft ->> 'base_servings')::numeric,
            v_canonical_ingredients,
            v_canonical_steps
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = v_result_recipe_id;

    v_nutrition_payload := p_nutrition_snapshot || jsonb_build_object(
      'base_servings', (p_draft ->> 'base_servings')::numeric,
      'input_hash', v_content_hash,
      'calculated_at', p_now
    );
    v_nutrition_guard := public.build_recipe_nutrition_input_guard(
      v_result_recipe_id
    );
    v_nutrition_result := public.write_recipe_nutrition_snapshot(
      v_result_recipe_id,
      v_nutrition_payload,
      v_recipe.updated_at,
      v_nutrition_guard
    );
    v_nutrition_snapshot_id := (v_nutrition_result ->> 'snapshot_id')::uuid;

    if v_nutrition_snapshot_id is null then
      raise exception 'SNAPSHOT_IDENTITY_COLLISION' using errcode = '55000';
    end if;

    insert into public.recipe_content_snapshots (
      owner_user_id,
      recipe_id,
      recipe_nutrition_snapshot_id,
      title,
      base_servings,
      ingredients_json,
      steps_json,
      content_hash,
      schema_version
    ) values (
      p_owner_uuid,
      v_result_recipe_id,
      v_nutrition_snapshot_id,
      btrim(p_draft ->> 'title'),
      (p_draft ->> 'base_servings')::numeric,
      v_canonical_ingredients,
      v_canonical_steps,
      v_content_hash,
      1
    )
    on conflict (
      recipe_id,
      content_hash,
      recipe_nutrition_snapshot_id,
      schema_version
    ) do nothing
    returning id into v_content_snapshot_id;

    if v_content_snapshot_id is null then
      select snapshot.id
        into v_content_snapshot_id
      from public.recipe_content_snapshots as snapshot
      where snapshot.recipe_id = v_result_recipe_id
        and snapshot.content_hash = v_content_hash
        and snapshot.recipe_nutrition_snapshot_id = v_nutrition_snapshot_id
        and snapshot.schema_version = 1;
    end if;

    select reference.image_object_id
      into v_existing_image_object_id
    from public.recipe_image_object_references as reference
    where reference.reference_type = 'recipe_thumbnail'
      and reference.consumer_id = v_result_recipe_id
    for update;

    if v_existing_image_object_id is not null
      and v_existing_image_object_id is distinct from p_image_object_id then
      delete from public.recipe_image_object_references
      where reference_type = 'recipe_thumbnail'
        and consumer_id = v_result_recipe_id;

      update public.recipe_image_objects as object
      set state = 'cleanup_pending',
          cleanup_generation = greatest(object.cleanup_generation + 1, 1),
          unlinked_cleanup_after = null,
          upload_attempt_token = null,
          upload_lease_expires_at = null,
          updated_at = p_now
      where object.id = v_existing_image_object_id
        and object.owner_uuid = p_owner_uuid
        and object.account_generation = v_lifecycle.account_generation
        and object.visibility = 'private'
        and object.state = 'attached_private';

      select public.enqueue_recipe_image_cleanup(
        object.id,
        p_owner_uuid,
        v_lifecycle.account_generation,
        object.cleanup_generation,
        'personal_recipe_image_replaced'
      )
        into v_image_outbox_id
      from public.recipe_image_objects as object
      where object.id = v_existing_image_object_id;

      if v_image_outbox_id is null then
        raise exception 'IMAGE_EXPIRED' using errcode = '55000';
      end if;
    end if;

    if p_image_object_id is not null
      and p_image_object_id is distinct from v_existing_image_object_id then
      perform public.attach_recipe_image_object(
        p_owner_uuid,
        p_auth_identity_created_at_snapshot,
        p_session_key_hash,
        p_hmac_key_version,
        v_result_recipe_id,
        p_image_object_id,
        p_expected_cleanup_generation,
        p_now
      );
    end if;

    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = v_result_recipe_id;

    v_result := jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'id', v_result_recipe_id,
        'origin_recipe_id', v_recipe.origin_recipe_id,
        'revision', v_recipe.revision,
        'content_snapshot_id', v_content_snapshot_id,
        'recipe_nutrition_snapshot_id', v_nutrition_snapshot_id,
        'account_generation', v_lifecycle.account_generation
      ),
      'error', null
    );
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_cutover_attempt_id,
    false
  );

  update public.mutation_idempotency_keys as idempotency
  set state = 'succeeded',
      terminal_result = 'succeeded',
      durable_result = v_result,
      result_reference = v_result_recipe_id,
      attempt_token = null,
      lease_expires_at = null,
      updated_at = p_now
  where idempotency.id = v_idempotency.id;

  -- Any exception aborts this function's transaction; all effects roll back.
  return v_result;
end;
$function$;

-- Account deletion moves an exact generation to deleting while holding the
-- common owner lock before dependent hard-delete work starts. Remove only that
-- generation's non-image personal write receipts at this transition.
create or replace function public.cleanup_personal_recipe_write_receipts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if old.status is not distinct from new.status
    or new.status is distinct from 'deleting' then
    return new;
  end if;

  delete from public.mutation_idempotency_keys
  where owner_uuid = new.owner_uuid
    and account_generation = new.account_generation
    and operation_scope like 'personal_recipe_%';

  return new;
end;
$function$;

drop trigger if exists cleanup_personal_recipe_write_receipts
  on public.user_account_lifecycles;
create trigger cleanup_personal_recipe_write_receipts
after update of status on public.user_account_lifecycles
for each row execute function public.cleanup_personal_recipe_write_receipts();

revoke all on function public.cleanup_personal_recipe_write_receipts()
  from public, anon, authenticated, service_role;

alter function public.lock_personal_recipe_ids(uuid[]) owner to postgres;
alter function public.write_personal_recipe_core(uuid, timestamp with time zone, text, integer, timestamp with time zone, text, uuid, uuid, bigint, jsonb, jsonb, jsonb, uuid, bigint, uuid, timestamp with time zone) owner to postgres;
alter function public.cleanup_personal_recipe_write_receipts() owner to postgres;
alter function public.enforce_recipe_ingredient_product_link() owner to postgres;

revoke insert, update, delete on table
  public.recipes,
  public.recipe_ingredients,
  public.recipe_steps,
  public.recipe_content_snapshots,
  public.recipe_nutrition_snapshots,
  public.recipe_image_object_references
from public, anon, authenticated;

revoke all on function public.lock_personal_recipe_ids(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.write_personal_recipe_core(
  uuid,
  timestamp with time zone,
  text,
  integer,
  timestamp with time zone,
  text,
  uuid,
  uuid,
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  bigint,
  uuid,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.write_personal_recipe_core(
  uuid,
  timestamp with time zone,
  text,
  integer,
  timestamp with time zone,
  text,
  uuid,
  uuid,
  bigint,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  bigint,
  uuid,
  timestamp with time zone
) to service_role;

commit;
