begin;
set local lock_timeout = '5s';

-- v5 is a personal-write reason identity contract. The v4 calculator, content
-- hash and immutable snapshot comparison retain their original definitions.
create function private.map_recipe_nutrition_reasons_v5(
  p_recipe uuid, p_requested jsonb, p_written jsonb, p_reasons jsonb
) returns jsonb language plpgsql volatile
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_request jsonb; v_written jsonb; v_actual public.recipe_ingredients%rowtype;
  v_index integer; v_count integer; v_count_key text; v_alias text; v_token text; v_kind text;
  v_ingredient uuid; v_product uuid; v_version uuid; v_row uuid; v_component text;
  v_rows uuid[] := '{}'; v_tokens text[] := '{}'; v_aliases jsonb := '{}';
  v_reason jsonb; v_parts text[]; v_result text; v_results text[] := '{}';
begin
  if jsonb_typeof(p_requested) is distinct from 'array'
    or jsonb_typeof(p_written->'ingredients') is distinct from 'array'
    or jsonb_typeof(p_reasons) is distinct from 'array' then
    raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_requested);
  if v_count>200 or v_count<>jsonb_array_length(p_written->'ingredients')
    or v_count<>(select count(*) from public.recipe_ingredients where recipe_id=p_recipe) then
    raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';
  end if;
  for v_index in 0..v_count-1 loop
    v_request:=p_requested->v_index;
    v_written:=p_written->'ingredients'->v_index;
    if jsonb_typeof(v_request) is distinct from 'object' or jsonb_typeof(v_written) is distinct from 'object'
      or (v_request ? 'row_key' and coalesce(v_request->>'row_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';
    end if;
    v_ingredient:=(v_request->>'ingredient_id')::uuid;
    v_product:=(v_request->>'food_product_id')::uuid;
    v_version:=(v_request->>'food_product_nutrition_version_id')::uuid;
    v_row:=(v_written->>'row_key')::uuid;
    v_kind:=case when v_product is null then 'ingredient' else 'food_product' end;
    v_component:=nullif(btrim(v_request->>'component_label'),'');
    select * into v_actual from public.recipe_ingredients where id=v_row and recipe_id=p_recipe;
    if not found or v_row=any(v_rows) or (v_product is null)<>(v_version is null)
      or (v_product is null and v_ingredient is null)
      or (v_request ? 'source_kind' and v_request->>'source_kind' is distinct from v_kind)
      or (v_written->>'ingredient_id')::uuid is distinct from v_ingredient
      or (v_written->>'food_product_id')::uuid is distinct from v_product
      or (v_written->>'food_product_nutrition_version_id')::uuid is distinct from v_version
      or v_actual.ingredient_id is distinct from v_ingredient
      or v_actual.food_product_id is distinct from v_product
      or v_actual.food_product_nutrition_version_id is distinct from v_version
      -- NULL generic markers and the existing step mapper's promotion are valid.
      or coalesce(v_written->>'source_kind',v_kind)<>v_kind
      or coalesce(v_actual.source_kind,v_kind)<>v_kind
      or nullif(btrim(v_written->>'component_label'),'') is distinct from v_component
      or nullif(btrim(v_actual.component_label),'') is distinct from v_component
      or (v_written->>'amount')::numeric is distinct from (v_request->>'amount')::numeric
      or v_actual.amount is distinct from (v_request->>'amount')::numeric
      or nullif(v_written->>'unit','') is distinct from nullif(v_request->>'unit','')
      or v_actual.unit is distinct from nullif(v_request->>'unit','')
      or v_written->>'ingredient_type' is distinct from coalesce(v_request->>'ingredient_type','QUANT')
      or v_actual.ingredient_type::text is distinct from coalesce(v_request->>'ingredient_type','QUANT')
      or (v_written->>'scalable')::boolean is distinct from coalesce((v_request->>'scalable')::boolean,true)
      or v_actual.scalable is distinct from coalesce((v_request->>'scalable')::boolean,true)
      or nullif(v_written->'quantity_input','null'::jsonb) is distinct from v_actual.quantity_input then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';
    end if;
    v_rows:=array_append(v_rows,v_row);
    -- Reproduce the calculator's raw-string aliases before UUID canonicalization.
    -- Counts include keyed/TO_TASTE rows; the suffix is the draft array index.
    v_count_key:=coalesce(v_request->>'ingredient_id',v_request->>'food_product_id');
    v_alias:=v_request->>'row_key';
    if v_alias is null then
      if (select count(*) from jsonb_array_elements(p_requested) item
        where coalesce(item->>'ingredient_id',item->>'food_product_id')=v_count_key)>1 then
        v_alias:=v_count_key||'-row-'||v_index;
      else v_alias:=v_count_key;end if;
    end if;
    v_token:='row-v1-'||encode(sha256(convert_to(jsonb_build_array(
      v_kind,coalesce(v_product,v_ingredient)::text,v_version::text,v_component)::text,'UTF8')),'hex');
    if v_alias is null or v_aliases ? v_alias or v_token=any(v_tokens) then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';
    end if;
    v_tokens:=array_append(v_tokens,v_token);
    v_aliases:=v_aliases||jsonb_build_object(v_alias,v_token);
  end loop;
  for v_reason in select value from jsonb_array_elements(p_reasons) loop
    if jsonb_typeof(v_reason) is distinct from 'string' then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';end if;
    v_parts:=string_to_array(v_reason#>>'{}',':');
    if not ((cardinality(v_parts)=2 and v_parts[1]=any(array[
        'TO_TASTE_EXCLUDED','PREDECESSOR_NOT_APPROVED','NUTRITION_PROFILE_MISSING','INVALID_QUANTITY',
        'UNIT_CONVERSION_MISSING','PIECE_WEIGHT_REQUIRED','UNIT_DEFINITION_REQUIRED','UNIT_DEFINITION_CONFLICT',
        'PIECE_IDENTITY_REQUIRED','DENSITY_REQUIRED','AMBIGUOUS_EVIDENCE']))
      or (cardinality(v_parts)=3 and v_parts[1]='NUTRIENT_VALUE_MISSING' and v_parts[3]=any(array[
        'energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg','sugars_g','saturated_fat_g','fiber_g'])))
      or not(v_aliases ? v_parts[2]) then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';end if;
    v_parts[2]:=v_aliases->>v_parts[2];
    v_result:=array_to_string(v_parts,':');
    if v_result=any(v_results) then
      raise exception 'INVALID_SNAPSHOT_REASON_IDENTITY' using errcode='22023';end if;
    v_results:=array_append(v_results,v_result);
  end loop;
  return coalesce((select jsonb_agg(reason order by reason collate "C") from unnest(v_results) reason),'[]'::jsonb);
end;
$function$;
alter function private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb) owner to postgres;
revoke all on function private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Patch only exact DB229 predecessors and preserve their effective authority.
do $reason_identity$
declare
  v_function regprocedure; v_definition text; v_before jsonb; v_after jsonb;
  v_target record; v_patch record;
begin
  for v_target in select * from (values
    ('private.recipe_quantity_mode_metadata_v4(uuid)','c18ae940baf179fbb9281bfb789e8a72'),
    ('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)','38dcdca8bbc22679b9c0d5e54a317d85'),
    ('public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)','712c3d5eed4329062794cacdf0623b47'),
    ('public.validate_recipe_nutrition_snapshot_payload(jsonb)','25806c0e6081cb90ff234114f8ef4bb6')
  ) targets(signature,source_md5) loop
    v_function:=to_regprocedure(v_target.signature);
    if v_function is null or (select md5(btrim(prosrc,chr(10))) from pg_proc where oid=v_function)<>v_target.source_md5 then
      raise exception 'RECIPE_REASON_IDENTITY_PREIMAGE_MISMATCH';end if;
    select pg_get_functiondef(oid),jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,
      'security',prosecdef,'volatility',provolatile,'parallel',proparallel) into v_definition,v_before from pg_proc where oid=v_function;
    for v_patch in select * from (values
      ('private.recipe_quantity_mode_metadata_v4(uuid)',
        $old$calculation_version='recipe-nutrition-v4'$old$,
        $new$calculation_version in ('recipe-nutrition-v4','recipe-nutrition-v5')$new$,1),
      ('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)',
        $old$p_nutrition_snapshot->>'calculation_version' is distinct from 'recipe-nutrition-v4'$old$,
        $new$p_nutrition_snapshot->>'calculation_version' is distinct from 'recipe-nutrition-v4' and p_nutrition_snapshot->>'calculation_version' is distinct from 'recipe-nutrition-v5'$new$,1),
      ('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)',
        $old$p_nutrition_snapshot->>'calculation_version'='recipe-nutrition-v4'$old$,
        $new$p_nutrition_snapshot->>'calculation_version' in ('recipe-nutrition-v4','recipe-nutrition-v5')$new$,1),
      ('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)',
        $old$    v_nutrition_result := public.write_recipe_nutrition_snapshot($old$,
        $new$    if v_nutrition_payload->>'calculation_version'='recipe-nutrition-v5' then
      v_nutrition_payload:=jsonb_set(v_nutrition_payload,'{missing_reasons}',
        private.map_recipe_nutrition_reasons_v5(v_result_recipe_id,p_draft->'ingredients',v_row_write,v_nutrition_payload->'missing_reasons'));
    end if;
    v_nutrition_result := public.write_recipe_nutrition_snapshot($new$,1),
      ('public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)',
        $old$p_snapshot->>'calculation_version'='recipe-nutrition-v4'$old$,
        $new$p_snapshot->>'calculation_version' in ('recipe-nutrition-v4','recipe-nutrition-v5')$new$,1),
      ('public.validate_recipe_nutrition_snapshot_payload(jsonb)',
        $old$    select 1 from jsonb_array_elements(p_snapshot -> 'missing_reasons') item
    where jsonb_typeof(item) <> 'string'$old$,
        $new$    select 1 from jsonb_array_elements(p_snapshot -> 'missing_reasons') item
    where jsonb_typeof(item) <> 'string'
      or (p_snapshot->>'calculation_version'='recipe-nutrition-v5'
        and item #>> '{}' !~ '^[A-Z_]+:row-v1-[0-9a-f]{64}(:[a-z_]+)?$')$new$,1),
      ('public.validate_recipe_nutrition_snapshot_payload(jsonb)',
        $old$p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4'$old$,
        $new$p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4' and p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v5'$new$,2)
    ) patches(signature,before_text,after_text,expected_count) where signature=v_target.signature loop
      if (length(v_definition)-length(replace(v_definition,v_patch.before_text,'')))/length(v_patch.before_text)<>v_patch.expected_count then
        raise exception 'RECIPE_REASON_IDENTITY_PATCH_MISMATCH';end if;
      v_definition:=replace(v_definition,v_patch.before_text,v_patch.after_text);
    end loop;
    execute v_definition;
    select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,
      'security',prosecdef,'volatility',provolatile,'parallel',proparallel) into v_after from pg_proc where oid=v_function;
    if v_after is distinct from v_before then raise exception 'RECIPE_REASON_IDENTITY_AUTHORITY_CHANGED';end if;
  end loop;
end;
$reason_identity$;
commit;
