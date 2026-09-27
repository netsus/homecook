-- Direct manual publication gets fresh public snapshots; private forks stay private.
begin;

create or replace function private.complete_manual_recipe_runtime(
  p_owner_uuid uuid, p_recipe_id uuid, p_expected_updated_at timestamptz,
  p_nutrition_snapshot jsonb, p_input_guard jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_recipe public.recipes%rowtype;
  v_nutrition jsonb;
  v_input record;
  v_content_id uuid;
  v_nutrition_id uuid;
begin
  perform public.lock_personal_recipe_ids(array[p_recipe_id]);
  select * into v_recipe from public.recipes where id=p_recipe_id for update;
  if v_recipe.id is null or v_recipe.created_by is distinct from p_owner_uuid
    or v_recipe.source_type <> 'manual' or v_recipe.origin_recipe_id is not null
    or v_recipe.visibility <> 'public' or v_recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_recipe.updated_at is distinct from p_expected_updated_at then
    raise exception 'RECIPE_REVISION_CONFLICT' using errcode='40001';
  end if;
  -- The existing writer validates current ingredient/product predecessors and
  -- observed/partial/unavailable nutrition. Missing evidence never becomes zero.
  v_nutrition := public.write_recipe_nutrition_snapshot(
    p_recipe_id,p_nutrition_snapshot,p_expected_updated_at,p_input_guard
  );
  v_nutrition_id := nullif(v_nutrition->>'snapshot_id','')::uuid;
  if v_nutrition_id is null or not exists (
    select 1 from public.recipe_nutrition_snapshots
    where id=v_nutrition_id and recipe_id=p_recipe_id and owner_user_id is null and is_current
  ) then raise exception 'RECIPE_RUNTIME_NUTRITION_NOT_READY' using errcode='55000'; end if;
  select * into strict v_input from public.build_recipe_content_snapshot_input(p_recipe_id);
  if v_input.owner_user_id is not null or jsonb_array_length(v_input.ingredients_json)=0
    or jsonb_array_length(v_input.steps_json)=0 then
    raise exception 'RECIPE_RUNTIME_CONTENT_NOT_READY' using errcode='55000';
  end if;
  insert into public.recipe_content_snapshots (
    owner_user_id,recipe_id,recipe_nutrition_snapshot_id,title,base_servings,
    ingredients_json,steps_json,content_hash,schema_version
  ) values (null,p_recipe_id,v_nutrition_id,v_input.title,v_input.base_servings,
    v_input.ingredients_json,v_input.steps_json,v_input.content_hash,1)
  on conflict (recipe_id,content_hash,recipe_nutrition_snapshot_id,schema_version)
  do nothing returning id into v_content_id;
  if v_content_id is null then
    select id into strict v_content_id from public.recipe_content_snapshots
    where recipe_id=p_recipe_id and content_hash=v_input.content_hash
      and recipe_nutrition_snapshot_id=v_nutrition_id and schema_version=1 and owner_user_id is null;
  end if;
  return jsonb_build_object('content_snapshot_id',v_content_id,'recipe_nutrition_snapshot_id',v_nutrition_id);
end;
$function$;
alter function private.complete_manual_recipe_runtime(uuid,uuid,timestamptz,jsonb,jsonb) owner to postgres;
revoke all on function private.complete_manual_recipe_runtime(uuid,uuid,timestamptz,jsonb,jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_manual_recipe_publication_context(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,p_recipe_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_result jsonb;
begin
  v_authority := public.assert_recipe_future_session_authority(p_owner_uuid,
    p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  select jsonb_build_object('recipe_id',recipe.id,'idempotency_key',receipt.idempotency_key,
    'visibility',recipe.visibility,'runtime_ready',exists (
      select 1 from public.recipe_content_snapshots content
      join public.recipe_nutrition_snapshots nutrition on nutrition.id=content.recipe_nutrition_snapshot_id
      where content.recipe_id=recipe.id and nutrition.recipe_id=recipe.id and nutrition.is_current
        and content.owner_user_id is null and nutrition.owner_user_id is null
        and content.title=recipe.title and content.base_servings=recipe.base_servings
        and content.schema_version=1 and content.content_hash=(select canonical.content_hash from public.build_recipe_content_snapshot_input(recipe.id) canonical)
    )) into v_result
  from public.recipes recipe join private.manual_recipe_create_receipts receipt
    on receipt.response_body->>'id'=recipe.id::text
    and receipt.owner_uuid=p_owner_uuid
    and receipt.account_generation=(v_authority->>'account_generation')::bigint
  where recipe.id=p_recipe_id and recipe.created_by=p_owner_uuid
    and recipe.source_type='manual' and recipe.origin_recipe_id is null and recipe.deleted_at is null
  order by receipt.created_at desc limit 1;
  if v_result is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  return v_result;
end;
$function$;
alter function public.read_owned_manual_recipe_publication_context(uuid,timestamptz,text,integer,timestamptz,uuid) owner to postgres;
revoke all on function public.read_owned_manual_recipe_publication_context(uuid,timestamptz,text,integer,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_manual_recipe_publication_context(uuid,timestamptz,text,integer,timestamptz,uuid) to service_role;

-- Extend ownership, not client authority: only an author's direct manual original
-- may be edited publicly. Public imported recipes and another author's rows remain blocked.
do $manual_owner_writers$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_signature regprocedure;
begin
  v_signature := 'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_old := 'if v_recipe.id is not null and v_recipe.visibility = ''public'' then';
  v_new := 'if v_recipe.id is not null and v_recipe.visibility = ''public'' and not (
      v_recipe.created_by = p_owner_uuid and v_recipe.source_type = ''manual'' and v_recipe.origin_recipe_id is null
    ) then';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PUBLIC_CORE_ACCESS_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := 'or v_recipe.visibility is distinct from ''private'' then';
  v_new := 'or not (v_recipe.visibility = ''private'' or (v_recipe.visibility = ''public''
        and v_recipe.source_type = ''manual'' and v_recipe.origin_recipe_id is null)) then';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PUBLIC_CORE_VISIBILITY_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := E'    ) values (\n      p_owner_uuid,\n      v_result_recipe_id,\n      v_nutrition_snapshot_id,';
  v_new := E'    ) values (\n      case when v_recipe.visibility = ''public'' then null else p_owner_uuid end,\n      v_result_recipe_id,\n      v_nutrition_snapshot_id,';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PUBLIC_CORE_SNAPSHOT_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_definition := replace(v_definition,'''visibility'', ''private'',',
    '''visibility'', case when v_effective_operation = ''update'' and v_recipe.visibility = ''public'' then ''public'' else ''private'' end,');
  -- Public direct originals use the same source fingerprint as their initial
  -- publication, so readiness checks do not mistake a normal edit for stale data.
  v_old := E'    v_nutrition_payload := p_nutrition_snapshot || jsonb_build_object(';
  v_new := E'    if v_recipe.visibility = ''public'' then\n      select canonical.ingredients_json,canonical.steps_json,canonical.content_hash\n        into v_canonical_ingredients,v_canonical_steps,v_content_hash\n      from public.build_recipe_content_snapshot_input(v_result_recipe_id) canonical;\n    end if;\n\n    v_nutrition_payload := p_nutrition_snapshot || jsonb_build_object(';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PUBLIC_CORE_CANONICAL_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;

  foreach v_signature in array array[
    'public.preview_recipe_future_plan_impact(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,timestamptz)'::regprocedure,
    'public.write_recipe_future_plan_change(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamptz)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    v_old := 'or v_recipe.visibility is distinct from ''private''';
    v_new := 'or not (v_recipe.visibility = ''private'' or (v_recipe.visibility = ''public''
      and v_recipe.source_type = ''manual'' and v_recipe.origin_recipe_id is null))';
    if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PUBLIC_FUTURE_ACCESS_DRIFT'; end if;
    execute replace(v_definition,v_old,v_new);
  end loop;
end;
$manual_owner_writers$;

-- Publication does not invalidate the author's already-pinned plan after deletion.
-- Public snapshots remain anonymous-history rows; the selecting Meal is still owner-bound.
do $manual_deleted_plan_access$
declare v_signature regprocedure; v_definition text;
begin
  foreach v_signature in array array[
    'public.create_shopping_list_with_snapshot_authority(uuid,timestamptz,text,integer,timestamptz,uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure,
    'public.create_shopping_list_from_payload(uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if strpos(v_definition,'shopping_deleted_private_pin_v1')=0 then raise exception 'MANUAL_PUBLIC_SHOPPING_GUARD_DRIFT'; end if;
    v_definition := replace(v_definition,'and recipe.visibility = ''private''',
      'and (recipe.visibility = ''private'' or (recipe.visibility = ''public'' and recipe.source_type = ''manual'' and recipe.origin_recipe_id is null))');
    v_definition := replace(v_definition,'and pinned.owner_user_id = p_owner_uuid',
      'and (pinned.owner_user_id = p_owner_uuid or (recipe.visibility = ''public'' and pinned.owner_user_id is null))');
    v_definition := replace(v_definition,'and pinned.owner_user_id = p_user_id',
      'and (pinned.owner_user_id = p_user_id or (recipe.visibility = ''public'' and pinned.owner_user_id is null))');
    execute v_definition;
  end loop;
end;
$manual_deleted_plan_access$;

notify pgrst, 'reload schema';
commit;
