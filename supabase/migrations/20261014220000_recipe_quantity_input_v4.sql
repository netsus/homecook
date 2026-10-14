begin;
set local lock_timeout='5s';

-- Local candidate only. C03 and the three C04 foundation/consumer migrations precede this.
-- Old rows stay NULL; no historical row or immutable snapshot is rewritten.
alter table public.recipe_ingredients add column quantity_input jsonb
  check (quantity_input is null or (jsonb_typeof(quantity_input)='object'
    and quantity_input->>'schema_version'='quantity-v4'));

-- Reuse the reviewed resolver. This is source hydration and a CAS fingerprint,
-- not another unit table or client-supplied approval/evidence.
create function private.recipe_quantity_context_v4(p_ingredient uuid,p_product uuid,p_version uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_input jsonb;v_predecessor jsonb;v_kind text;v_rows jsonb;v_row jsonb;v_source public.nutrition_sources%rowtype;
begin
  if (p_product is null)<>(p_version is null) then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  if p_product is not null then
    v_predecessor:=private.recipe_product_nutrition_predecessor(p_product,p_version,p_ingredient);
    if v_predecessor is null then return null;end if;
    return jsonb_build_object('source_kind','food_product','product_id',p_product,'version_id',p_version,
      'basis',(v_predecessor#>'{nutrition,profile}')-'values',
      'basis_relations',v_predecessor->'basis_relations');
  end if;
  if p_ingredient is null then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  begin v_input:=private.ingredient_quantity_v4_input(p_ingredient,null);
  exception when no_data_found then return null;end;
  -- Existing context includes the exact reviewed measurements. Attach their
  -- actual source attribution for the same calculator/contributing-source check.
  foreach v_kind in array array['densities','pieces'] loop
    v_rows:='[]';
    for v_row in select value from jsonb_array_elements(coalesce(v_input->'unit_context'->v_kind,'[]')) order by value->>'id' collate "C" loop
      select * into v_source from public.nutrition_sources where id=(v_row#>>'{source,id}')::uuid;
      v_rows:=v_rows||jsonb_build_array(v_row||jsonb_build_object('source',(v_row->'source')||jsonb_build_object(
        'provider',v_source.provider_code,'dataset',v_source.dataset_name,'data_basis_date',v_source.data_basis_date,
        'license',v_source.license_name,'source_url',v_source.source_url)));
    end loop;
    v_input:=jsonb_set(v_input,array['unit_context',v_kind],v_rows);
  end loop;
  return v_input||jsonb_build_object('source_kind','ingredient');
end;
$function$;

create function private.recipe_quantity_context_hash_v4(p_ingredient uuid,p_product uuid,p_version uuid)
returns text language sql stable set search_path=pg_catalog,public,private,pg_temp as $function$
  select encode(sha256(convert_to(jsonb_build_array(p_ingredient,p_product,p_version,private.recipe_quantity_context_v4(p_ingredient,p_product,p_version))::text,'UTF8')),'hex');
$function$;

create function private.recipe_quantity_options_v4(p_ingredient uuid,p_product uuid,p_version uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_context jsonb;v_hash text;v_options jsonb;v_default text;
begin
  v_context:=private.recipe_quantity_context_v4(p_ingredient,p_product,p_version);
  v_hash:=private.recipe_quantity_context_hash_v4(p_ingredient,p_product,p_version);
  if v_context is null then
    if p_product is not null then return jsonb_build_object('ready',false);end if;
    select case when default_unit in ('ml','mL','l','L') then 'mL' else 'g' end into v_default
      from public.ingredients where id=p_ingredient and public.is_selectable_catalog_ingredient(id);
    if v_default is null then return jsonb_build_object('ready',false);end if;
    return jsonb_build_object('ready',private.quantity_input_v4_enabled(),'context_sha256',v_hash,'raw_default_unit',v_default);
  end if;
  if p_product is not null then
    return jsonb_build_object('ready',private.quantity_input_v4_enabled(),'context_sha256',v_hash,
      'product',jsonb_build_object('id',p_product,'nutrition_version_id',p_version,
        'basis_unit',v_context#>>'{basis,basis_unit}','basis_relations',v_context->'basis_relations'));
  end if;
  v_options:=private.ingredient_quantity_v4_options(p_ingredient);
  return jsonb_build_object('ready',v_options is not null,'context_sha256',v_hash)
    ||case when v_options is not null then jsonb_build_object('options',v_options) else '{}'::jsonb end;
end;
$function$;

create function private.recipe_quantity_snapshot_v4(p_ingredient uuid,p_product uuid,p_version uuid,p_amount numeric,p_unit text,p_input jsonb)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_raw jsonb;v_result jsonb;v_snapshot jsonb;v_hash text;v_resolution jsonb;v_context jsonb;
begin
  if p_input is null or p_input='null'::jsonb then return null;end if;
  if p_input ? 'expected_batch_revision' then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  v_hash:=private.recipe_quantity_context_hash_v4(p_ingredient,p_product,p_version);
  if jsonb_typeof(p_input->'expected_context_sha256') is distinct from 'string' or (p_input->>'expected_context_sha256' !~ '^[0-9a-f]{64}$'
    or p_input->>'expected_context_sha256' is distinct from v_hash) then
    raise exception 'UNIT_CONTEXT_STALE' using errcode='40001';end if;
  if p_product is not null then
    if (p_input->>'expected_product_nutrition_version_id')::uuid is distinct from p_version then
      raise exception 'NUTRITION_VERSION_CONFLICT' using errcode='40001';end if;
    v_resolution:=private.product_quantity_input_v4(p_version,p_amount,p_unit,p_input-'expected_context_sha256');
    v_snapshot:=v_resolution->'snapshot';
  else
    if p_input ? 'expected_product_nutrition_version_id' then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
    v_raw:=private.parse_quantity_input_v4(p_input-'expected_context_sha256',p_amount,p_unit);
    if v_raw->>'raw_unit'=p_unit then
      v_context:=private.recipe_quantity_context_v4(p_ingredient,null,null);
      if v_context is null then
        v_context:=jsonb_build_object('ingredient_id',p_ingredient,'basis_unit',case when p_unit in ('ml','mL','l','L') then 'ml' else 'g' end);
      end if;
      -- A recipe may keep its original uncalibrated cup/count quantity. Its
      -- nutrition remains unavailable; it is never converted to fake grams.
      v_result:=private.resolve_ingredient_quantity_v4(v_context||jsonb_build_object(
        'amount',(v_raw->>'amount')::numeric,'unit',v_raw->>'raw_unit'),v_context->>'basis_unit');
    else
      v_context:=private.recipe_quantity_context_v4(p_ingredient,null,null);
      if v_context is null then
        v_context:=jsonb_build_object('ingredient_id',p_ingredient,'basis_unit',case when p_unit in ('ml','mL','l','L') then 'ml' else 'g' end);
        v_result:=private.resolve_ingredient_quantity_v4(v_context||jsonb_build_object('amount',(v_raw->>'amount')::numeric,'unit',v_raw->>'raw_unit'),v_context->>'basis_unit');
        v_resolution:=private.resolve_ingredient_quantity_v4(v_context||jsonb_build_object('amount',p_amount,'unit',p_unit),v_context->>'basis_unit');
        if v_result->>'status'<>'resolved' or v_resolution->>'status'<>'resolved'
          or abs((v_result->>'amount')::numeric-(v_resolution->>'amount')::numeric)>greatest(1,abs((v_result->>'amount')::numeric))*0.000000000001 then
          raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023';end if;
      else
      v_resolution:=private.resolve_meal_log_ingredient_v4(p_ingredient,null,p_amount,p_unit,p_input-'expected_context_sha256');
      v_result:=v_resolution->'result';
      end if;
    end if;
    v_snapshot:=(v_raw-'amount')||jsonb_build_object(
      'normalized',case when v_result->>'status'='resolved' then jsonb_build_object('amount',v_result->'amount','unit',v_result->'unit') else null end,
      'display_quantity',jsonb_build_object('amount',p_amount,'unit',p_unit),
      'quality',coalesce(v_result->>'quality','unavailable'),'reason',v_result->>'reason',
      'evidence_ids',coalesce(v_result->'evidence_ids','[]'),
      'source_versions',coalesce((select jsonb_agg(value->>'source_version' order by value->>'source_version')
        from jsonb_array_elements(coalesce(v_result->'sources','[]'))),'[]'), 'batch_basis',null);
  end if;
  return v_snapshot||jsonb_build_object('context_sha256',v_hash);
end;
$function$;

-- OFF waits for an admitted recipe write; an already returned receipt does not
-- enter this helper. Keep the shared policy table and existing authority.
create function private.require_recipe_quantity_writes_v4() returns void
language plpgsql volatile set search_path=pg_catalog,private,pg_temp as $function$
declare v_enabled boolean;
begin
  select enabled into v_enabled from private.quantity_input_v4_policy where singleton for share;
  if not coalesce(v_enabled,false) then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000';end if;
end;
$function$;

-- No new public RPC/grant/scope: extend the already protected source reader only
-- for explicit metadata requests. Its original actor/private checks remain.
do $read_context$
declare v_def text:=pg_get_functiondef('public.read_recipe_product_nutrition_predecessors(uuid,jsonb)'::regprocedure);v_old text;v_new text;
begin
  v_old:=$old$    v_predecessor := private.recipe_product_nutrition_predecessor($old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_READER_PREIMAGE';end if;
  v_new:=$new$    if (v_pin ? 'quantity_options_requested' or v_pin ? 'quantity_policy_version') then
      if (nullif(v_pin->>'food_product_id','') is null)<>(nullif(v_pin->>'food_product_nutrition_version_id','') is null)
        or (nullif(v_pin->>'food_product_id','') is null and not public.is_selectable_catalog_ingredient((v_pin->>'ingredient_id')::uuid))
        or (v_product.id is not null and (v_product.deleted_at is not null or v_product.moderation_status<>'visible'
          or not recipe_visibility_guard.is_owner_publicly_visible(v_product.owner_user_id))) then
        raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
      if v_product.id is not null and v_product.source_type<>'public_dataset' and not exists(
        select 1 from public.food_product_ingredient_links link where link.product_id=v_product.id
          and link.ingredient_id=(v_pin->>'ingredient_id')::uuid and link.is_primary and link.is_active
          and link.relation='represents' and link.review_status='approved') then
        raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
    end if;
$new$||v_old;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$  return v_result;$old$;
  v_new:=$new$  if exists(select 1 from jsonb_array_elements(p_ingredients) item where item ? 'quantity_options_requested' or item ? 'quantity_policy_version') then
    select coalesce(jsonb_agg(row.value||case when pin.value ? 'quantity_options_requested' then
      jsonb_build_object('recipe_quantity_context',private.recipe_quantity_options_v4(
        (pin.value->>'ingredient_id')::uuid,(pin.value->>'food_product_id')::uuid,(pin.value->>'food_product_nutrition_version_id')::uuid))
      when pin.value ? 'quantity_policy_version' then jsonb_build_object('recipe_quantity_predecessor',jsonb_build_object(
        'context',private.recipe_quantity_context_v4((pin.value->>'ingredient_id')::uuid,(pin.value->>'food_product_id')::uuid,(pin.value->>'food_product_nutrition_version_id')::uuid),
        'guard_hash',private.recipe_quantity_context_hash_v4((pin.value->>'ingredient_id')::uuid,(pin.value->>'food_product_id')::uuid,(pin.value->>'food_product_nutrition_version_id')::uuid)))
      else '{}'::jsonb end order by row.ordinality),'[]') into v_result
    from jsonb_array_elements(v_result) with ordinality row(value,ordinality)
    join jsonb_array_elements(p_ingredients) with ordinality pin(value,ordinality) using(ordinality);
    if exists(select 1 from jsonb_array_elements(v_result) row join jsonb_array_elements(p_ingredients) pin on row->'id'=pin->'id'
      where (pin ? 'quantity_options_requested' or pin ? 'quantity_policy_version')
        and pin->>'food_product_id' is not null and row->'product_predecessor'='null'::jsonb) then
      raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
  end if;
  return v_result;$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_READER_RETURN_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
end;
$read_context$;

alter function private.recipe_quantity_context_v4(uuid,uuid,uuid) owner to postgres;
alter function private.recipe_quantity_context_hash_v4(uuid,uuid,uuid) owner to postgres;
alter function private.recipe_quantity_options_v4(uuid,uuid,uuid) owner to postgres;
alter function private.recipe_quantity_snapshot_v4(uuid,uuid,uuid,numeric,text,jsonb) owner to postgres;
alter function private.require_recipe_quantity_writes_v4() owner to postgres;
revoke all on function private.recipe_quantity_context_v4(uuid,uuid,uuid),private.recipe_quantity_context_hash_v4(uuid,uuid,uuid),
  private.recipe_quantity_options_v4(uuid,uuid,uuid),private.recipe_quantity_snapshot_v4(uuid,uuid,uuid,numeric,text,jsonb),
  private.require_recipe_quantity_writes_v4() from public,anon,authenticated,service_role;

-- Trusted table writes must contain the real server-resolved metadata. A direct
-- client cannot smuggle approval/evidence by writing the jsonb column itself.
create function private.guard_recipe_quantity_input_v4() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_raw jsonb;v_expected jsonb;
begin
  if tg_op='UPDATE' and new.quantity_input is not distinct from old.quantity_input
    and new.amount is not distinct from old.amount and new.unit is not distinct from old.unit
    and new.ingredient_type is not distinct from old.ingredient_type
    and new.ingredient_id is not distinct from old.ingredient_id
    and new.food_product_id is not distinct from old.food_product_id
    and new.food_product_nutrition_version_id is not distinct from old.food_product_nutrition_version_id then return new;end if;
  if new.quantity_input is null then
    if tg_op='UPDATE' and old.quantity_input is not null then
      if new.ingredient_type<>'TO_TASTE' or new.amount is not null or new.unit is not null then
        raise exception 'RECIPE_SOURCE_CONTRACT_REQUIRED' using errcode='22023';end if;
      perform private.require_recipe_quantity_writes_v4();
    end if;
    return new;
  end if;
  perform private.require_recipe_quantity_writes_v4();
  if new.ingredient_type<>'QUANT' then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  v_raw:=jsonb_build_object('schema_version','quantity-v4','raw_value',new.quantity_input->>'raw_value',
    'raw_unit',new.quantity_input->>'raw_unit','expected_context_sha256',new.quantity_input->>'context_sha256');
  if new.food_product_id is not null then v_raw:=v_raw||jsonb_build_object('expected_product_nutrition_version_id',new.food_product_nutrition_version_id);end if;
  v_expected:=private.recipe_quantity_snapshot_v4(new.ingredient_id,new.food_product_id,new.food_product_nutrition_version_id,new.amount,new.unit,v_raw);
  if new.quantity_input is distinct from v_expected then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  return new;
end;
$function$;
alter function private.guard_recipe_quantity_input_v4() owner to postgres;
revoke all on function private.guard_recipe_quantity_input_v4() from public,anon,authenticated,service_role;
create trigger recipe_quantity_input_v4_guard before insert or update on public.recipe_ingredients
for each row execute function private.guard_recipe_quantity_input_v4();

do $source_writer$
declare v_def text:=pg_get_functiondef('private.write_recipe_source_rows(uuid,uuid,jsonb,jsonb,boolean)'::regprocedure);v_old text;v_new text;
begin
  v_old:=$old$v_quantity_unit text;v_live_original jsonb;v_written_ids uuid[]:='{}';$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_DECLARATION';end if;
  v_def:=replace(v_def,v_old,v_old||' v_quantity_snapshot jsonb;');
  v_def:=replace(v_def,'v_row:=null;','v_row:=null; v_original:=null;');
  v_old:=$old$  for v_item in select value from jsonb_array_elements(p_ingredients) loop$old$;
  v_new:=$new$  -- An omitted quantity key is not an instruction to discard an existing
  -- raw fraction. Removed ingredient rows remain an explicit normal deletion.
  if exists(select 1 from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) original
    join jsonb_array_elements(p_ingredients) item on
      original->>'ingredient_id' is not distinct from item->>'ingredient_id'
      and original->>'food_product_id' is not distinct from item->>'food_product_id'
      and original->>'food_product_nutrition_version_id' is not distinct from item->>'food_product_nutrition_version_id'
      and nullif(btrim(original->>'component_label'),'') is not distinct from nullif(btrim(item->>'component_label'),'')
    where original->'quantity_input' is not null and original->'quantity_input'<>'null'::jsonb
      and not(item ? 'quantity_input')) then
    raise exception 'RECIPE_SOURCE_CONTRACT_REQUIRED' using errcode='22023';end if;
$new$||v_old;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_LOOP';end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$    if v_row is not null then
      -- Existing format is not downgraded$old$;
  v_new:=$new$    v_quantity_snapshot:=null;
    if v_item ? 'quantity_input' then
      if v_item->'quantity_input'='null'::jsonb then
        if coalesce(v_item->>'ingredient_type','QUANT')<>'TO_TASTE' or v_amount is not null or v_unit is not null then
          raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
        if v_original->'quantity_input' is not null and v_original->'quantity_input'<>'null'::jsonb then
          perform private.require_recipe_quantity_writes_v4();end if;
      else
        perform private.require_recipe_quantity_writes_v4();
        v_quantity_snapshot:=private.recipe_quantity_snapshot_v4(v_ingredient,v_product,v_version,v_amount,v_unit,v_item->'quantity_input');
      end if;
    end if;
    if v_row is not null then
      -- Existing format is not downgraded$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_UPDATE';end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$food_product_id=v_product,food_product_nutrition_version_id=v_version,source_kind=v_marker$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_COLUMNS';end if;
  v_def:=replace(v_def,v_old,v_old||',quantity_input=v_quantity_snapshot');
  v_old:=$old$food_product_id,food_product_nutrition_version_id,source_kind)
      values($old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_INSERT_COLUMNS';end if;
  v_def:=replace(v_def,v_old,$new$food_product_id,food_product_nutrition_version_id,source_kind,quantity_input)
      values($new$);
  v_old:=$old$v_product,v_version,v_marker);$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_INSERT_VALUES';end if;
  v_def:=replace(v_def,v_old,'v_product,v_version,v_marker,v_quantity_snapshot);');
  v_old:=$old$)||v_label);$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_WRITER_RETURN';end if;
  execute replace(v_def,v_old,$new$)||v_label||case when v_quantity_snapshot is null then '{}'::jsonb
      else jsonb_build_object('quantity_input',v_quantity_snapshot) end);$new$);
end;
$source_writer$;

-- The existing core still validates every actor, revision, state and receipt.
-- Only the additional input key and its request fingerprint are admitted.
do $core_keys$
declare v_name text;v_def text;v_old text;v_patched integer:=0;
begin
  foreach v_name in array array[
    'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'
  ] loop
    v_def:=pg_get_functiondef(v_name::regprocedure);
    v_old:=$old$'ingredient_id', 'row_key', 'source_kind', 'amount'$old$;
    if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_CORE_KEYS: %',v_name;end if;
    v_def:=replace(v_def,v_old,$new$'ingredient_id', 'row_key', 'source_kind', 'quantity_input', 'amount'$new$);
    -- Fingerprint the raw request only when the key exists. Its null value is
    -- an explicit format change; absence preserves legacy request hashes.
    if v_name like 'public.write_personal_recipe_core%' then
      v_old:=$old$        )) order by ordinality)
        from jsonb_array_elements(p_draft -> 'ingredients')$old$;
      if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_CORE_FINGERPRINT';end if;
      v_def:=replace(v_def,v_old,$new$        ))||case when item ? 'quantity_input' then jsonb_build_object('quantity_input',item->'quantity_input') else '{}'::jsonb end order by ordinality)
        from jsonb_array_elements(p_draft -> 'ingredients')$new$);
    end if;
    execute v_def;v_patched:=v_patched+1;
  end loop;
  if v_patched<>1 then raise exception 'RECIPE_QUANTITY_CORE_COUNT';end if;
end;
$core_keys$;

do $managed_unit_gate$
declare v_def text;v_old text;v_name text;
begin
  foreach v_name in array array['public.create_manual_recipe_with_managed_image(uuid,timestamptz,text,integer,uuid,bigint,text,integer,text,text[],text,jsonb,jsonb,timestamptz)',
    'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'] loop
  v_def:=pg_get_functiondef(v_name::regprocedure);
  v_old:=$old$and not coalesce(item ->> 'unit' = any(array[$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_MANAGED_UNIT_PREIMAGE';end if;
  execute replace(v_def,v_old,$new$and not(item ? 'quantity_input')
      $new$||v_old);
  end loop;
end;
$managed_unit_gate$;

-- The already approved ingredient catalog read supplies only a CAS stamp.
-- Product history contexts are obtained separately from the exact pinned pair.
do $catalog_context_hash$
declare v_name text;v_def text;v_old text:=$old$'quantity_options', private.ingredient_quantity_v4_options(ingredient.id)$old$;
begin
  perform public.similarity('', '');
  foreach v_name in array array['public.read_food_catalog_source(uuid,text,uuid)',
    'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'] loop
    v_def:=pg_get_functiondef(v_name::regprocedure);
    if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'RECIPE_QUANTITY_CATALOG_PREIMAGE';end if;
    execute replace(v_def,v_old,v_old||$new$,
      'quantity_context_sha256',private.recipe_quantity_context_hash_v4(ingredient.id,null,null),
      'recipe_quantity_context',private.recipe_quantity_options_v4(ingredient.id,null,null)$new$);
  end loop;
end;
$catalog_context_hash$;

-- Stored evidence is projected back to raw input only for editing. Canonical
-- draft input remains raw, never a client claim about approval or conversion.
create function private.recipe_quantity_draft_v4(p_snapshot jsonb,p_version uuid)
returns jsonb language sql immutable set search_path=pg_catalog,private,pg_temp as $function$
  select jsonb_build_object('schema_version','quantity-v4','raw_value',p_snapshot->>'raw_value',
    'raw_unit',p_snapshot->>'raw_unit','expected_context_sha256',p_snapshot->>'context_sha256')
    ||case when p_version is null then '{}'::jsonb else jsonb_build_object('expected_product_nutrition_version_id',p_version) end;
$function$;
alter function private.recipe_quantity_draft_v4(jsonb,uuid) owner to postgres;
revoke all on function private.recipe_quantity_draft_v4(jsonb,uuid) from public,anon,authenticated,service_role;

do $canonical_projection$
declare v_def text;v_old text;v_new text;
begin
  v_def:=pg_get_functiondef('public.canonicalize_recipe_future_draft(jsonb)'::regprocedure);
  v_old:=$old$      ) order by ordinality)
      from jsonb_array_elements(p_draft -> 'ingredients')$old$;
  v_new:=$new$      )||case when item ? 'quantity_input' then jsonb_build_object('quantity_input',item->'quantity_input') else '{}'::jsonb end order by ordinality)
      from jsonb_array_elements(p_draft -> 'ingredients')$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_CANONICAL_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
  v_def:=pg_get_functiondef('public.build_recipe_content_snapshot_before_yt_saved_20261012(uuid)'::regprocedure);
  v_old:=$old$      order by ingredient.sort_order asc, ingredient.id asc$old$;
  v_new:=$new$      ||case when ingredient.quantity_input is null then '{}'::jsonb
        else jsonb_build_object('quantity_input',ingredient.quantity_input,'row_key',ingredient.id) end
      order by ingredient.sort_order asc, ingredient.id asc$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_SNAPSHOT_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
  v_def:=pg_get_functiondef('public.read_recipe_snapshot_entrypoint_context(uuid,timestamptz,text,integer,timestamptz,uuid)'::regprocedure);
  v_old:=$old$            order by ingredient.sort_order, ingredient.id)$old$;
  v_new:=$new$            ||case when ingredient.quantity_input is null then '{}'::jsonb else jsonb_build_object(
              'row_key',ingredient.id,'quantity_input',private.recipe_quantity_draft_v4(ingredient.quantity_input,ingredient.food_product_nutrition_version_id)) end
            order by ingredient.sort_order, ingredient.id)$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_EDIT_CONTEXT_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
  v_def:=pg_get_functiondef('public.build_recipe_draft_nutrition_predecessor_guard(jsonb)'::regprocedure);
  v_old:=$old$      )) end order by row.ordinality$old$;
  v_new:=$new$      )) end||case when exists(select 1 from jsonb_array_elements(p_draft->'ingredients') item where item ? 'quantity_input')
        then jsonb_build_object('recipe_quantity_context_sha256',private.recipe_quantity_context_hash_v4(
          (row.value->>'ingredient_id')::uuid,(row.value->>'food_product_id')::uuid,(row.value->>'food_product_nutrition_version_id')::uuid))
        else '{}'::jsonb end order by row.ordinality$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_NUTRITION_GUARD_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
  v_def:=pg_get_functiondef('public.build_recipe_nutrition_input_guard(uuid)'::regprocedure);
  v_old:=$old$      ) end order by row.ordinality$old$;
  v_new:=$new$      ) end||case when exists(select 1 from public.recipe_ingredients current_row
        where current_row.recipe_id=p_recipe_id and current_row.quantity_input is not null)
        then jsonb_build_object('recipe_quantity_context_sha256',private.recipe_quantity_context_hash_v4(
          ingredient.ingredient_id,ingredient.food_product_id,ingredient.food_product_nutrition_version_id))
        else '{}'::jsonb end order by row.ordinality$new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_STORED_NUTRITION_GUARD_PREIMAGE';end if;
  execute replace(v_def,v_old,v_new);
end;
$canonical_projection$;

-- A retired last quantity keeps the already committed calculation contract.
-- The ordinary content builder reads no nutrition rows, so this proof is acyclic.
create function private.recipe_quantity_mode_metadata_v4(p_recipe uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare r public.recipes%rowtype;n public.recipe_nutrition_snapshots%rowtype;h text;
begin
  select * into r from public.recipes where id=p_recipe;
  if r.id is null or r.deleted_at is not null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
  if exists(select 1 from public.recipe_ingredients where recipe_id=p_recipe and quantity_input is not null) then
    return jsonb_build_object('quantity_policy_version','quantity-v4','quantity_recipe_revision',r.revision);
  end if;
  select * into n from public.recipe_nutrition_snapshots where recipe_id=p_recipe and is_current and calculation_version='recipe-nutrition-v4';
  if n.id is null then return '{}'::jsonb;end if;
  select content_hash into h from public.build_recipe_content_snapshot_input(p_recipe);
  if n.base_servings=r.base_servings and n.input_hash=h
    and (r.visibility<>'private' or n.owner_user_id=r.created_by)
    and exists(select 1 from public.recipe_content_snapshots c where c.recipe_id=r.id
      and c.recipe_nutrition_snapshot_id=n.id and c.content_hash=h and c.base_servings=r.base_servings
      and (r.visibility<>'private' or c.owner_user_id=r.created_by)) then
    return jsonb_build_object('quantity_policy_version','quantity-v4','quantity_recipe_revision',r.revision);
  end if;
  return jsonb_build_object('quantity_policy_version','unverified','quantity_recipe_revision',r.revision);
end;
$function$;

-- No client flag chooses a mode. Callers supply the verified server-captured
-- contract; all quantity evidence is still re-read from the actual source rows.
create function private.recipe_quantity_guard_v4(p_guard jsonb,p_recipe uuid default null)
returns jsonb language sql stable set search_path=pg_catalog,public,private,pg_temp as $function$
  select (p_guard-array['quantity_policy_version','quantity_recipe_revision'])
    ||case when p_recipe is null then '{}'::jsonb else jsonb_build_object('quantity_policy_version','quantity-v4',
      'quantity_recipe_revision',(select revision from public.recipes where id=p_recipe)) end
    ||jsonb_build_object('recipe_ingredients',coalesce((select jsonb_agg(row.value||jsonb_build_object(
      'recipe_quantity_context_sha256',private.recipe_quantity_context_hash_v4((row.value->>'ingredient_id')::uuid,
        (row.value->>'food_product_id')::uuid,(row.value->>'food_product_nutrition_version_id')::uuid)) order by row.ordinality)
      from jsonb_array_elements(p_guard->'recipe_ingredients') with ordinality row(value,ordinality)),'[]'));
$function$;
alter function private.recipe_quantity_mode_metadata_v4(uuid) owner to postgres;
alter function private.recipe_quantity_guard_v4(jsonb,uuid) owner to postgres;
revoke all on function private.recipe_quantity_mode_metadata_v4(uuid),private.recipe_quantity_guard_v4(jsonb,uuid) from public,anon,authenticated,service_role;

do $mode_lineage$
declare d text;o text;n text;
begin
  -- This existing owner/gen/session reader keeps its exact request arguments,
  -- visibility predicate and grants. The extra scalar is server-derived only.
  d:=pg_get_functiondef('public.read_recipe_snapshot_entrypoint_context(uuid,timestamptz,text,integer,timestamptz,uuid)'::regprocedure);
  o:=$old$  return v_result;$old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_READ_PREIMAGE';end if;
  n:=$new$  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='unverified' then
    raise exception 'UNIT_CONTEXT_STALE' using errcode='40001';end if;
  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='quantity-v4' then
    -- Preserve the physical row identity after a last raw quantity is retired.
    -- Legacy v3 read envelopes and immutable snapshot JSON are unchanged.
    v_result:=jsonb_set(v_result,array[case when v_result ? 'edit_context' then 'edit_context' else 'fork_context' end,'draft','ingredients'],
      (select coalesce(jsonb_agg(item.value||jsonb_build_object('row_key',source.id) order by item.ordinality),'[]')
       from jsonb_array_elements(v_result#>array[case when v_result ? 'edit_context' then 'edit_context' else 'fork_context' end,'draft','ingredients']) with ordinality item(value,ordinality)
       join (select id,row_number() over(order by sort_order,id) ordinality from public.recipe_ingredients where recipe_id=p_recipe_id) source using(ordinality)));
    return v_result||jsonb_build_object('quantity_policy_version','quantity-v4');
  end if;
  return v_result;$new$;
  execute replace(d,o,n);

  -- Existing service-only input-guard read. Legacy envelopes remain unchanged.
  d:=pg_get_functiondef('public.build_recipe_nutrition_input_guard(uuid)'::regprocedure);
  o:=$old$  select jsonb_build_object($old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_GUARD_PREIMAGE';end if;
  d:=replace(d,o,$new$  select (select jsonb_build_object($new$);
  o:=$old$  join public.recipe_ingredients ingredient on ingredient.id = (row.value ->> 'id')::uuid;$old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_GUARD_END';end if;
  execute replace(d,o,$new$  join public.recipe_ingredients ingredient on ingredient.id = (row.value ->> 'id')::uuid)
    ||private.recipe_quantity_mode_metadata_v4(p_recipe_id);$new$);

  -- Capture after the existing owner/revision locks and before any recipe/row
  -- mutation. Successful receipt replay has already returned before this point.
  d:=pg_get_functiondef('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure);
  o:=$old$  v_nutrition_guard jsonb;$old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_CORE_DECL';end if;
  d:=replace(d,o,o||' v_quantity_mode jsonb;v_quantity_v4 boolean:=false;');
  o:=$old$  if p_tags is null and v_effective_operation in ('fork', 'save_as_new') then$old$;
  n:=$new$  if p_operation<>'delete' then
    if v_effective_operation in ('update','fork','save_as_new') then
      v_quantity_mode:=private.recipe_quantity_mode_metadata_v4(case when v_effective_operation='update' then p_recipe_id else p_source_recipe_id end);
      if v_quantity_mode->>'quantity_policy_version'='unverified' then raise exception 'UNIT_CONTEXT_STALE' using errcode='40001';end if;
      v_quantity_v4:=v_quantity_mode->>'quantity_policy_version'='quantity-v4';
    end if;
    v_quantity_v4:=coalesce(v_quantity_v4,false) or exists(select 1 from jsonb_array_elements(p_draft->'ingredients') item where item ? 'quantity_input');
    if v_quantity_v4 then
      perform private.require_recipe_quantity_writes_v4();
      if p_nutrition_snapshot->>'calculation_version' is distinct from 'recipe-nutrition-v4' then raise exception 'RECIPE_SOURCE_CONTRACT_REQUIRED' using errcode='22023';end if;
    elsif p_nutrition_snapshot->>'calculation_version'='recipe-nutrition-v4' then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  end if;
$new$||o;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_CORE_CAPTURE';end if;
  d:=replace(d,o,n);
  o:=$old$    v_nutrition_result := public.write_recipe_nutrition_snapshot($old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_CORE_SUCCESSOR';end if;
  execute replace(d,o,$new$    if v_quantity_v4 then v_nutrition_guard:=private.recipe_quantity_guard_v4(v_nutrition_guard,v_result_recipe_id);end if;
$new$||o);

  -- The existing service-only snapshot writer verifies the real row/evidence
  -- guard for its already server-computed calculation version. No new ACL/path.
  d:=pg_get_functiondef('public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)'::regprocedure);
  o:=$old$  v_actual_input_guard := public.build_recipe_nutrition_input_guard(p_recipe_id);$old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_SNAPSHOT_GUARD';end if;
  execute replace(d,o,o||$new$
  if p_snapshot->>'calculation_version'='recipe-nutrition-v4' then
    v_actual_input_guard:=private.recipe_quantity_guard_v4(v_actual_input_guard,p_recipe_id);
  end if;$new$);

  d:=pg_get_functiondef('public.write_recipe_future_plan_change(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamptz)'::regprocedure);
  o:=$old$  v_current_guard := public.build_recipe_draft_nutrition_predecessor_guard(p_draft);$old$;
  if position(o in d)=0 then raise exception 'RECIPE_QUANTITY_MODE_FUTURE_GUARD';end if;
  execute replace(d,o,o||$new$
  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='unverified' then raise exception 'UNIT_CONTEXT_STALE' using errcode='40001';end if;
  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='quantity-v4' then
    v_current_guard:=private.recipe_quantity_guard_v4(v_current_guard);
  end if;$new$);
end;
$mode_lineage$;

-- A preview persists its draft, so new v4 previews use the same OFF fence.
-- Ordinary catalog/context reads and stored snapshots remain readable while OFF.
do $preview_write_gate$
declare v_def text:=pg_get_functiondef('public.preview_recipe_future_plan_impact(uuid,timestamptz,text,integer,timestamptz,uuid,bigint,jsonb,timestamptz)'::regprocedure);v_old text;
begin
  v_old:=$old$  v_canonical_draft := public.canonicalize_recipe_future_draft(p_draft);$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_PREVIEW_PREIMAGE';end if;
  execute replace(v_def,v_old,$new$  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='unverified' then raise exception 'UNIT_CONTEXT_STALE' using errcode='40001';end if;
  if private.recipe_quantity_mode_metadata_v4(p_recipe_id)->>'quantity_policy_version'='quantity-v4'
    or exists(select 1 from jsonb_array_elements(p_draft->'ingredients') item where item ? 'quantity_input') then
    perform private.require_recipe_quantity_writes_v4();
  end if;
$new$||v_old);
end;
$preview_write_gate$;

-- For an explicitly v4 draft use the same reviewed resolver as the calculator.
-- Without the additional guard, keep the predecessor's exact legacy behavior.
do $contributing_sources$
declare v_def text;v_old text;v_new text;
begin
  v_def:=pg_get_functiondef('public.build_recipe_nutrition_contributing_sources(jsonb)'::regprocedure);
  v_old:=$old$  v_scale numeric;$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_SOURCE_DECLARATION';end if;
  v_def:=replace(v_def,v_old,v_old||' v_context jsonb;v_resolution jsonb;v_candidate jsonb;');
  v_old:=$old$  v_sources := private.recipe_nutrition_sources_pre_product_20260922($old$;
  v_new:=$new$  if exists(select 1 from jsonb_array_elements(p_input_guard->'recipe_ingredients') item
    where item ? 'recipe_quantity_context_sha256') then
    v_sources:='[]';
    for v_row in select value from jsonb_array_elements(p_input_guard->'recipe_ingredients')
      where nullif(value->>'food_product_id','') is null loop
      select value into v_candidate from jsonb_array_elements(v_row->'nutrition_candidates')
        where value->>'link_id'=v_row->>'selected_nutrition_link_id';
      if v_candidate is null then continue;end if;
      if v_row->>'ingredient_type'='TO_TASTE' then
        if not exists(select 1 from jsonb_array_elements(v_candidate->'nutrition_values') val
          where val->>'value_status'='observed' and (val->>'amount')::numeric=0) then continue;end if;
      else
        v_context:=private.recipe_quantity_context_v4((v_row->>'ingredient_id')::uuid,null,null);
        v_resolution:=private.resolve_ingredient_quantity_v4(coalesce(v_context,'{}')||jsonb_build_object(
          'amount',v_row->'amount','unit',v_row->'unit'),v_candidate->>'basis_unit');
        if v_resolution->>'status'<>'resolved' or not exists(select 1 from jsonb_array_elements(v_candidate->'nutrition_values') val
          where val->>'value_status'='observed' and (val->>'amount')::numeric>=0) then continue;end if;
        select v_sources||coalesce(jsonb_agg(value-array['id','review_status','freshness_status','is_active']),'[]')
          into v_sources from jsonb_array_elements(v_resolution->'sources');
      end if;
      v_sources:=v_sources||jsonb_build_array(v_candidate->'source');
    end loop;
  else
  v_sources := private.recipe_nutrition_sources_pre_product_20260922($new$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_SOURCE_START';end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$  for v_row in select value from jsonb_array_elements(p_input_guard -> 'recipe_ingredients')$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_SOURCE_END';end if;
  v_def:=replace(v_def,v_old,'  end if;'||chr(10)||v_old);
  v_old:=$old$      v_unit := case v_row ->> 'unit' when 'T' then 'tbsp' when 't' then 'tsp'$old$;
  v_new:=$new$      if v_row ? 'recipe_quantity_context_sha256' then
        v_scale:=private.convert_recipe_product_quantity(v_amount,v_row->>'unit',
          v_nutrition#>>'{profile,basis_unit}',v_row#>'{product_predecessor,basis_relations}')
          /(v_nutrition#>>'{profile,basis_amount}')::numeric;
      else
$new$||v_old;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_PRODUCT_SOURCE_START';end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$      if v_scale is null or not exists$old$;
  if position(v_old in v_def)=0 then raise exception 'RECIPE_QUANTITY_PRODUCT_SOURCE_END';end if;
  execute replace(v_def,v_old,'      end if;'||chr(10)||v_old);
end;
$contributing_sources$;
commit;
