begin;

create or replace function public.create_manual_recipe_with_managed_image(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_image_object_id uuid,
  p_expected_cleanup_generation bigint,
  p_title text,
  p_base_servings integer,
  p_thumbnail_url text,
  p_tags text[],
  p_tag_source text,
  p_ingredients jsonb,
  p_steps jsonb,
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
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_recipe public.recipes%rowtype;
  v_attach_result jsonb;
  v_item jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'managed manual recipe create requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or nullif(btrim(p_title), '') is null
    or length(btrim(p_title)) > 200
    or p_base_servings is null
    or p_base_servings <= 0
    or p_tag_source is null
    or p_tag_source not in ('system_suggested', 'user_reviewed')
    or p_tags is null
    or p_ingredients is null
    or jsonb_typeof(p_ingredients) <> 'array'
    or p_steps is null
    or jsonb_typeof(p_steps) <> 'array'
    or p_now is null
    or (
      p_image_object_id is null
      and p_expected_cleanup_generation is not null
    )
    or (
      p_image_object_id is not null
      and (
        p_expected_cleanup_generation is null
        or p_expected_cleanup_generation < 0
      )
    ) then
    raise exception 'managed manual recipe create fields are invalid'
      using errcode = '22023';
  end if;

  if p_image_object_id is not null
    and nullif(btrim(p_thumbnail_url), '') is not null then
    raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  if v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  end if;

  if v_lifecycle.status in ('deleting', 'cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  end if;

  if v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
    and binding.owner_uuid = p_owner_uuid
    and binding.expected_account_generation = v_lifecycle.account_generation
    and binding.auth_identity_created_at_snapshot
      = p_auth_identity_created_at_snapshot
    and binding.revoked_at is null
  for key share;

  if v_binding.owner_uuid is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  insert into public.recipes (
    title,
    base_servings,
    source_type,
    created_by,
    thumbnail_url,
    tags,
    visibility
  ) values (
    btrim(p_title),
    p_base_servings,
    'manual',
    p_owner_uuid,
    case
      when p_image_object_id is null
        then nullif(btrim(p_thumbnail_url), '')
      else null
    end,
    p_tags,
    'private'
  )
  returning * into v_recipe;

  perform public.set_recipe_tags(
    v_recipe.id,
    public.build_recipe_tag_payload(p_tags, p_tag_source),
    p_owner_uuid,
    p_tag_source
  );

  for v_item in
    select value
    from jsonb_array_elements(p_ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id,
      ingredient_id,
      amount,
      unit,
      ingredient_type,
      display_text,
      scalable,
      sort_order
    ) values (
      v_recipe.id,
      (v_item ->> 'ingredient_id')::uuid,
      nullif(v_item ->> 'amount', '')::numeric,
      nullif(v_item ->> 'unit', ''),
      (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
      nullif(v_item ->> 'display_text', ''),
      coalesce((v_item ->> 'scalable')::boolean, true),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(p_steps)
  loop
    insert into public.recipe_steps (
      recipe_id,
      step_number,
      instruction,
      cooking_method_id,
      ingredients_used,
      heat_level,
      duration_seconds,
      duration_text
    ) values (
      v_recipe.id,
      (v_item ->> 'step_number')::integer,
      v_item ->> 'instruction',
      (v_item ->> 'cooking_method_id')::uuid,
      coalesce(v_item -> 'ingredients_used', '[]'::jsonb),
      nullif(v_item ->> 'heat_level', ''),
      nullif(v_item ->> 'duration_seconds', '')::integer,
      nullif(v_item ->> 'duration_text', '')
    );
  end loop;

  if p_image_object_id is not null then
    v_attach_result := public.attach_recipe_image_object(
      p_owner_uuid,
      p_auth_identity_created_at_snapshot,
      p_session_key_hash,
      p_hmac_key_version,
      v_recipe.id,
      p_image_object_id,
      p_expected_cleanup_generation,
      p_now
    );

    if v_attach_result ->> 'outcome' <> 'succeeded'
      or (v_attach_result ->> 'recipe_id')::uuid <> v_recipe.id
      or (v_attach_result ->> 'object_id')::uuid <> p_image_object_id
      or v_attach_result ->> 'state' <> 'attached_private' then
      raise exception 'managed manual recipe image attach result is invalid'
        using errcode = '55000';
    end if;
  end if;

  return jsonb_build_object(
    'id',
    v_recipe.id,
    'title',
    v_recipe.title,
    'source_type',
    v_recipe.source_type,
    'created_by',
    v_recipe.created_by,
    'base_servings',
    v_recipe.base_servings,
    'visibility',
    v_recipe.visibility,
    'image_object_id',
    p_image_object_id,
    'image_state',
    case
      when p_image_object_id is null then null
      else 'attached_private'
    end
  );
end;
$function$;

revoke all on function public.create_manual_recipe_with_managed_image(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  bigint,
  text,
  integer,
  text,
  text[],
  text,
  jsonb,
  jsonb,
  timestamp with time zone
) from public, anon, authenticated, service_role;

grant execute on function public.create_manual_recipe_with_managed_image(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  bigint,
  text,
  integer,
  text,
  text[],
  text,
  jsonb,
  jsonb,
  timestamp with time zone
) to service_role;

commit;
