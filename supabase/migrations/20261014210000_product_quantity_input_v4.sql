begin;
-- C03 supplies the converter and recipe amount precision. Do not redefine it.
alter table public.product_planner_entries alter column quantity_amount type numeric,
  add constraint product_planner_quantity_finite_range check (
    quantity_amount::text not in ('NaN','Infinity','-Infinity')
    and quantity_amount>0 and quantity_amount<100000000),
  add column quantity_input jsonb check (quantity_input is null or (
    jsonb_typeof(quantity_input)='object' and quantity_input->>'schema_version'='quantity-v4'));

create function private.product_quantity_input_v4(p_version uuid,p_amount numeric,p_unit text,p_input jsonb)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_raw jsonb; v_profile public.nutrition_profiles%rowtype; v_relations jsonb;
  v_amount numeric; v_normal numeric; v_physical numeric; v_physical_unit text; v_profile_id uuid;
  v_display numeric; v_target text; v_target_factor numeric:=1;
begin
  if p_input ? 'expected_batch_revision' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_raw:=private.parse_quantity_input_v4(p_input,p_amount,p_unit); v_amount:=(v_raw->>'amount')::numeric;
  if p_input ? 'expected_product_nutrition_version_id' and
    (p_input->>'expected_product_nutrition_version_id')::uuid is distinct from p_version then
    raise exception 'NUTRITION_VERSION_CONFLICT' using errcode='40001'; end if;
  select basis_relations_json,nutrition_profile_id into v_relations,v_profile_id
    from public.food_product_nutrition_versions where id=p_version;
  select * into v_profile from public.nutrition_profiles where id=v_profile_id;
  if v_profile.id is null or v_profile.basis_amount<=0 or v_profile.basis_amount::text in ('NaN','Infinity','-Infinity')
    or v_profile.basis_unit not in ('g','ml','serving','package') then
    raise exception 'NUTRITION_BASIS_MISMATCH' using errcode='22023'; end if;
  v_target:=case p_unit when 'kg' then 'g' when 'l' then 'ml' when 'L' then 'ml' when 'mL' then 'ml' else p_unit end;
  v_target_factor:=case when p_unit in ('kg','l','L') then 1000 else 1 end;
  v_display:=private.convert_recipe_product_quantity(v_amount,v_raw->>'raw_unit',v_target,v_relations)/v_target_factor;
  if v_display is null then raise exception 'NUTRITION_BASIS_MISMATCH' using errcode='22023'; end if;
  if abs(v_display-p_amount)>greatest(1,abs(v_display))*0.000000000001 then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_normal:=private.convert_recipe_product_quantity(v_amount,v_raw->>'raw_unit',v_profile.basis_unit,v_relations);
  if v_normal is null then raise exception 'NUTRITION_BASIS_MISMATCH' using errcode='22023'; end if;
  if v_profile.basis_unit in ('g','ml') then v_physical:=v_normal; v_physical_unit:=v_profile.basis_unit;
  else
    v_physical:=private.convert_recipe_product_quantity(v_amount,v_raw->>'raw_unit','g',v_relations); v_physical_unit:='g';
    if v_physical is null then
      v_physical:=private.convert_recipe_product_quantity(v_amount,v_raw->>'raw_unit','ml',v_relations); v_physical_unit:='ml';
    end if;
  end if;
  return jsonb_build_object('amount',v_display,'nutrition_amount',v_normal,'nutrition_unit',v_profile.basis_unit,
    'snapshot',(v_raw-'amount')||jsonb_build_object(
      'normalized',case when v_physical is not null then jsonb_build_object('amount',v_physical,'unit',v_physical_unit) else null end,
      'display_quantity',jsonb_build_object('amount',v_display,'unit',p_unit),
      'quality',case when v_physical is not null then 'direct' else 'unavailable' end,
      'reason',case when v_physical is null then 'PRODUCT_PHYSICAL_BASIS_UNAVAILABLE' else null end,
      'evidence_ids','[]'::jsonb,'source_versions',jsonb_build_array(p_version::text),'batch_basis',null));
end;
$function$;

-- A reader of an already saved v4 entry remains valid after activation is OFF.
-- The private caller supplies stored metadata, never a user's approval claim.
create function private.product_quantity_input_v4_scale(p_version uuid,p_amount numeric,p_unit text,p_input jsonb)
returns numeric language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_profile public.nutrition_profiles%rowtype; v_relations jsonb; v_amount numeric; v_profile_id uuid;
begin
  if p_input->>'schema_version' is distinct from 'quantity-v4'
    or p_input->'source_versions' is distinct from jsonb_build_array(p_version::text) then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  perform private.parse_quantity_input_v4(jsonb_build_object('schema_version','quantity-v4',
    'raw_value',p_input->>'raw_value','raw_unit',p_input->>'raw_unit'),p_amount,p_unit);
  if p_input ? 'display_quantity' and (p_input#>>'{display_quantity,unit}' is distinct from p_unit
    or abs((p_input#>>'{display_quantity,amount}')::numeric-p_amount)>greatest(1,abs(p_amount))*0.000000000001) then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  select nutrition_profile_id,basis_relations_json into v_profile_id,v_relations
    from public.food_product_nutrition_versions where id=p_version;
  select * into v_profile from public.nutrition_profiles where id=v_profile_id;
  if v_profile.id is null or v_profile.basis_amount<=0 or v_profile.basis_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'NUTRITION_BASIS_MISMATCH'; end if;
  v_amount:=private.convert_recipe_product_quantity(p_amount,p_unit,v_profile.basis_unit,v_relations);
  if v_amount is null then raise exception 'NUTRITION_BASIS_MISMATCH'; end if;
  return v_amount/v_profile.basis_amount;
end;
$function$;

-- Keep legacy four-decimal writes; precision only expands on an explicit v4
-- row. Source identity/version, actor and column owner checks stay in place.
do $trigger_patch$
declare v_def text; v_old text;
begin
  v_def:=pg_get_functiondef('public.protect_product_planner_entry()'::regprocedure);
  v_old:=$old$  perform public.product_planner_quantity_scale($old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_TRIGGER_BASELINE'; end if;
  v_def:=replace(v_def,v_old,$new$  if tg_op='UPDATE' and (new.quantity_amount is distinct from old.quantity_amount or new.quantity_unit is distinct from old.quantity_unit)
    and new.quantity_input is not distinct from old.quantity_input then new.quantity_input:=null; end if;
  if new.quantity_input is not null then
    perform private.product_quantity_input_v4_scale(new.product_nutrition_version_id,new.quantity_amount,new.quantity_unit,new.quantity_input);
  else
  new.quantity_amount:=round(new.quantity_amount,4);
  perform public.product_planner_quantity_scale($new$);
  v_old:=$old$    new.quantity_unit
  );$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_TRIGGER_SCALE_ARGS'; end if;
  v_def:=replace(v_def,v_old,v_old||' end if;');
  execute v_def;
end;
$trigger_patch$;

-- Generate additive overloads from the reviewed existing writers, preserving
-- every authority/visibility/current-version check instead of a second writer.
do $writer_overloads$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('public.create_product_planner_entry(uuid,uuid,date,uuid,numeric,text,uuid)'::regprocedure);
  v_old:='p_expected_current_version_id uuid)';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_SIGNATURE'; end if;
  v_def:=replace(v_def,v_old,'p_expected_current_version_id uuid, p_quantity_input jsonb)');
  v_def:=replace(v_def,'v_entry_id uuid;','v_entry_id uuid; v_quantity_v4 jsonb;');
  v_old:=$old$  perform public.assert_food_product_actor(p_user_id);$old$;
  v_new:=v_old||$new$
  if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;$new$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_AUTHORITY'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$  perform public.product_planner_quantity_scale($old$;
  v_new:=$new$  v_quantity_v4:=private.product_quantity_input_v4(v_product.current_nutrition_version_id,p_quantity_amount,p_quantity_unit,p_quantity_input);
  if (p_quantity_input->>'expected_product_nutrition_version_id')::uuid is distinct from v_product.current_nutrition_version_id then
    raise exception 'NUTRITION_VERSION_CONFLICT' using errcode='40001'; end if;
  p_quantity_amount:=(v_quantity_v4->>'amount')::numeric;
  perform private.product_quantity_input_v4_scale($new$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_SCALE'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$p_quantity_unit
  );$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_SCALE_ARGS'; end if;
  v_def:=replace(v_def,v_old,$new$p_quantity_unit, v_quantity_v4->'snapshot'
  );$new$);
  v_old:='quantity_amount, quantity_unit, product_name_snapshot, product_brand_snapshot';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_COLUMNS'; end if;
  v_def:=replace(v_def,v_old,v_old||', quantity_input');
  v_old:='v_product.name, v_product.brand';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CREATE_VALUES'; end if;
  v_def:=replace(v_def,v_old,v_old||$new$, v_quantity_v4->'snapshot'$new$);
  execute v_def;

  v_def:=pg_get_functiondef('public.update_product_planner_entry_quantity(uuid,uuid,numeric,text)'::regprocedure);
  v_old:='p_quantity_unit text)';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PATCH_SIGNATURE'; end if;
  v_def:=replace(v_def,v_old,'p_quantity_unit text, p_quantity_input jsonb)');
  v_def:=replace(v_def,'v_entry public.product_planner_entries%rowtype;','v_entry public.product_planner_entries%rowtype; v_quantity_v4 jsonb;');
  v_old:=$old$  perform public.assert_food_product_actor(p_user_id);$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PATCH_AUTHORITY'; end if;
  v_def:=replace(v_def,v_old,v_old||$new$
  if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;$new$);
  v_old:=$old$  perform public.product_planner_quantity_scale($old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PATCH_SCALE'; end if;
  v_def:=replace(v_def,v_old,$new$  v_quantity_v4:=private.product_quantity_input_v4(v_entry.product_nutrition_version_id,p_quantity_amount,p_quantity_unit,p_quantity_input);
  p_quantity_amount:=(v_quantity_v4->>'amount')::numeric;
  perform private.product_quantity_input_v4_scale($new$);
  v_old:=$old$p_quantity_unit
  );$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PATCH_SCALE_ARGS'; end if;
  v_def:=replace(v_def,v_old,$new$p_quantity_unit, v_quantity_v4->'snapshot'
  );$new$);
  v_old:='quantity_unit = p_quantity_unit';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PATCH_COLUMNS'; end if;
  execute replace(v_def,v_old,v_old||$new$, quantity_input = case when v_entry.quantity_amount=p_quantity_amount and v_entry.quantity_unit=p_quantity_unit then v_entry.quantity_input else v_quantity_v4->'snapshot' end$new$);
end;
$writer_overloads$;

do $reader_patch$
declare v_def text; v_old text;
begin
  v_def:=pg_get_functiondef('public.product_planner_entry_payload(uuid,uuid)'::regprocedure);
  v_old:=$old$'quantity', jsonb_build_object('amount', v_entry.quantity_amount, 'unit', v_entry.quantity_unit),$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PAYLOAD_QUANTITY'; end if;
  v_def:=replace(v_def,v_old,v_old||$new$'quantity_input', v_entry.quantity_input,$new$);
  v_old:=$old$  v_scale := public.product_planner_quantity_scale($old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PAYLOAD_SCALE'; end if;
  v_def:=replace(v_def,v_old,$new$  if v_entry.quantity_input is not null then
    v_scale:=private.product_quantity_input_v4_scale(v_entry.product_nutrition_version_id,v_entry.quantity_amount,v_entry.quantity_unit,v_entry.quantity_input);
  else
  v_scale := public.product_planner_quantity_scale($new$);
  v_old:=$old$    v_entry.quantity_unit
  );$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_PAYLOAD_SCALE_ARGS'; end if;
  execute replace(v_def,v_old,v_old||' end if;');

  v_def:=pg_get_functiondef('public.list_product_planner_entries(uuid,date,date,uuid)'::regprocedure);
  v_old:=$old$      public.product_planner_quantity_scale(
        entry.product_nutrition_version_id,
        entry.quantity_amount,
        entry.quantity_unit
      ) as scale$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_LIST_SCALE'; end if;
  v_def:=replace(v_def,v_old,$new$      case when entry.quantity_input is not null then
        private.product_quantity_input_v4_scale(entry.product_nutrition_version_id,entry.quantity_amount,entry.quantity_unit,entry.quantity_input)
      else public.product_planner_quantity_scale(entry.product_nutrition_version_id,entry.quantity_amount,entry.quantity_unit) end as scale$new$);
  -- The existing context selects entry.*; the additive column is already there.
  v_old:=$old$'quantity', jsonb_build_object('amount', context.quantity_amount, 'unit', context.quantity_unit),$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_LIST_QUANTITY'; end if;
  execute replace(v_def,v_old,v_old||$new$'quantity_input',context.quantity_input,$new$);

  v_def:=pg_get_functiondef('public.list_food_products(uuid,text,text,timestamptz,uuid,integer)'::regprocedure);
  v_old:=$old$'has_next', v_has_next$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PRODUCT_CATALOG_POLICY'; end if;
  execute replace(v_def,v_old,v_old||$new$,'quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end$new$);
end;
$reader_patch$;

do $permissions$
declare v_function regprocedure;
begin
  for v_function in select oid::regprocedure from pg_proc where pronamespace='private'::regnamespace
    and proname in ('product_quantity_input_v4','product_quantity_input_v4_scale') loop
    execute format('alter function %s owner to postgres',v_function);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
  end loop;
  foreach v_function in array array[
    'public.create_product_planner_entry(uuid,uuid,date,uuid,numeric,text,uuid,jsonb)'::regprocedure,
    'public.update_product_planner_entry_quantity(uuid,uuid,numeric,text,jsonb)'::regprocedure] loop
    execute format('alter function %s owner to postgres',v_function);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
    execute format('grant execute on function %s to authenticated,service_role',v_function);
  end loop;
end;
$permissions$;
notify pgrst,'reload schema';
commit;
