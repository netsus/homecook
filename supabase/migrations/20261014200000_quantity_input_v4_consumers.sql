-- Inactive preparation. No historical rows, review evidence or runtime grants
-- are populated. Activation and reviewed metadata are separate operations.
begin;
create table private.quantity_input_v4_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.quantity_input_v4_policy values (true,false);
revoke all on private.quantity_input_v4_policy from public,anon,authenticated,service_role;
alter table public.ingredient_nutrition_profiles add column quantity_v4_metadata jsonb
  check (quantity_v4_metadata is null or jsonb_typeof(quantity_v4_metadata)='object');
alter table public.measurement_source_evidence add column quantity_v4_metadata jsonb
  check (quantity_v4_metadata is null or jsonb_typeof(quantity_v4_metadata)='object');
alter table public.meal_log_entries add column quantity_input jsonb
  check (quantity_input is null or (jsonb_typeof(quantity_input)='object'
    and quantity_input->>'schema_version'='quantity-v4'));

create function private.quantity_input_v4_enabled() returns boolean
language sql stable set search_path=pg_catalog,private,pg_temp as $function$
  select coalesce((select enabled from private.quantity_input_v4_policy where singleton),false)
    and to_regprocedure('private.convert_recipe_product_quantity(numeric,text,text,jsonb)') is not null;
$function$;

-- Raw rational text is authoritative. The JSON number is only its transport
-- approximation; keeping numerator/denominator avoids saving display rounding.
create function private.parse_quantity_input_v4(p_input jsonb,p_amount numeric,p_unit text)
returns jsonb language plpgsql immutable set search_path=pg_catalog,private,pg_temp as $function$
declare v_raw text; v_num numeric; v_den numeric:=1; v_exact numeric;
begin
  if jsonb_typeof(p_input) is distinct from 'object'
    or p_input->>'schema_version' is distinct from 'quantity-v4'
    or (select count(*) from jsonb_object_keys(p_input)) not in (3,4)
    or exists(select 1 from jsonb_object_keys(p_input) k
      where k not in ('schema_version','raw_value','raw_unit','expected_batch_revision','expected_product_nutrition_version_id'))
    or jsonb_typeof(p_input->'raw_value') is distinct from 'string'
    or jsonb_typeof(p_input->'raw_unit') is distinct from 'string'
    or nullif(btrim(p_input->>'raw_unit'),'') is null or length(p_input->>'raw_unit')>24 then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  v_raw:=private.ingredient_unit_v4_normalize_text(p_input->>'raw_value');
  if length(v_raw)>64 or v_raw!~'^(\d+(\.\d*)?|\.\d+|\d+\s*/\s*\d+)$' then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if position('/' in v_raw)>0 then
    v_num:=btrim(split_part(v_raw,'/',1))::numeric;
    v_den:=btrim(split_part(v_raw,'/',2))::numeric;
  else
    v_den:=power(10::numeric,length(split_part(v_raw,'.',2)));
    v_num:=v_raw::numeric*v_den;
  end if;
  if v_den<=0 or v_num<=0 or p_amount is null or p_amount<=0
    or p_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_exact:=v_num/v_den;
  if p_input->>'raw_unit'=p_unit and abs(v_exact-p_amount)>greatest(1,abs(v_exact))*0.000000000001 then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if p_input ? 'expected_batch_revision' and (jsonb_typeof(p_input->'expected_batch_revision')<>'number'
    or (p_input->>'expected_batch_revision')::numeric<1
    or trunc((p_input->>'expected_batch_revision')::numeric)<>(p_input->>'expected_batch_revision')::numeric) then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if p_input ? 'expected_product_nutrition_version_id' and (jsonb_typeof(p_input->'expected_product_nutrition_version_id')<>'string'
    or p_input->>'expected_product_nutrition_version_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  return jsonb_build_object('schema_version','quantity-v4','raw_value',v_raw,'raw_unit',p_input->>'raw_unit',
    'numerator',trunc(v_num)::text,'denominator',trunc(v_den)::text,'amount',v_exact);
end;
$function$;

create function private.cooked_quantity_input_v4(p_batch public.leftover_dishes,p_amount numeric,p_unit text,p_input jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_raw jsonb; v_factor numeric:=1; v_display_factor numeric:=1; v_grams numeric; v_basis jsonb;
begin
  v_raw:=private.parse_quantity_input_v4(p_input,p_amount,p_unit);
  if p_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  if p_batch.weight_status='unrecoverable' then raise exception 'WEIGHT_UNRECOVERABLE' using errcode='55000'; end if;
  if p_unit not in ('g','kg','인분') or v_raw->>'raw_unit' not in ('g','kg','인분') then
    raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
  if p_unit='인분' or v_raw->>'raw_unit'='인분' then
    if p_batch.weight_status is distinct from 'known' or p_batch.cooking_servings is null or p_batch.cooking_servings<=0
      or p_batch.finished_weight_g is null or p_batch.finished_weight_g<=0 then
      raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
    if (p_input->>'expected_batch_revision')::bigint is distinct from p_batch.revision then
      raise exception 'CONFLICT' using errcode='40001'; end if;
    v_basis:=jsonb_build_object('batch_id',p_batch.id,'revision',p_batch.revision,'cooking_servings',p_batch.cooking_servings,
      'finished_weight_g',p_batch.finished_weight_g,'weight_source',p_batch.weight_source);
  end if;
  v_factor:=case v_raw->>'raw_unit' when 'kg' then 1000 when '인분' then p_batch.finished_weight_g/p_batch.cooking_servings else 1 end;
  v_display_factor:=case p_unit when 'kg' then 1000 when '인분' then p_batch.finished_weight_g/p_batch.cooking_servings else 1 end;
  v_grams:=(v_raw->>'amount')::numeric*v_factor;
  if abs(v_grams-p_amount*v_display_factor)>greatest(1,abs(v_grams))*0.000000000001 then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  return jsonb_build_object('amount',v_grams,'batch_basis',v_basis,
    'quality',case when v_raw->>'raw_unit'='인분' and p_batch.weight_source='estimated' then 'estimated' else 'direct' end);
end;
$function$;

-- Read only approved database rows. User JSON cannot assert source approval,
-- edible portion, physical count identity, freshness or an evidence version.
create function private.ingredient_quantity_v4_input(p_ingredient uuid,p_profile uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_profile public.ingredient_nutrition_profiles%rowtype;
  v_basis text; v_density jsonb; v_pieces jsonb; v_context jsonb; v_count integer;
begin
  select count(*) into v_count from public.ingredient_nutrition_profiles
  where ingredient_id=p_ingredient and (
    (p_profile is null and is_active and is_primary and review_status='approved')
    or (id=p_profile and ((is_active and review_status='approved') or (not is_active and review_status='superseded'))));
  if v_count<>1 then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_profile from public.ingredient_nutrition_profiles
  where ingredient_id=p_ingredient and (
    (p_profile is null and is_active and is_primary and review_status='approved')
    or (id=p_profile and ((is_active and review_status='approved') or (not is_active and review_status='superseded'))));
  if v_profile.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  select basis_unit into v_basis from public.nutrition_profiles
    where id=v_profile.nutrition_profile_id and ((is_active and review_status in ('approved','self_reported'))
      or (p_profile is not null and not is_active and review_status='superseded'));
  if v_basis not in ('g','ml') or v_basis is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'kind','density','ingredient_id',p_ingredient,'preparation_state',e.preparation_state,
    'edible_portion_basis',e.quantity_v4_metadata->>'edible_portion_basis',
    'quality',e.quantity_v4_metadata->>'quality','grams_per_ml',e.observed_weight_g/e.observed_volume_ml,
    'review_status',e.review_status,'is_active',e.is_active,
    'source',jsonb_build_object('id',s.id,'source_version',s.source_version,
      'review_status',s.review_status,'is_active',s.is_active,'freshness_status',s.freshness_status))),'[]')
  into v_density
  from public.ingredient_conversion_assignments a
  join public.measurement_source_evidence e on e.id=a.evidence_id and e.evidence_kind='volume_weight'
  join public.nutrition_sources s on s.id=e.source_id
  where a.ingredient_id=p_ingredient and a.preparation_state=v_profile.preparation_state
    and e.preparation_state=v_profile.preparation_state and a.is_active and a.review_status='approved'
    and e.is_active and e.review_status='approved' and s.is_active and s.review_status='approved'
    and s.freshness_status='current' and e.observed_volume_ml>0 and e.observed_weight_g>0;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'kind','piece','ingredient_id',p_ingredient,'preparation_state',e.preparation_state,
    'edible_portion_basis',e.quantity_v4_metadata->>'edible_portion_basis',
    'quality',e.quantity_v4_metadata->>'quality','physical_unit',e.quantity_v4_metadata->>'physical_unit',
    'size_code',e.size_code,'weight_g',p.weight_g,'observed_unit',e.source_observed_unit,
    'observed_amount',e.source_observed_amount,'observed_weight_g',e.observed_weight_g,
    'review_status',e.review_status,'is_active',e.is_active,
    'source',jsonb_build_object('id',s.id,'source_version',s.source_version,
      'review_status',s.review_status,'is_active',s.is_active,'freshness_status',s.freshness_status))),'[]')
  into v_pieces
  from public.piece_unit_weights p
  join public.measurement_source_evidence e on e.id=p.evidence_id and e.evidence_kind='piece_weight'
  join public.nutrition_sources s on s.id=e.source_id
  where p.ingredient_id=p_ingredient and p.preparation_state=v_profile.preparation_state
    and e.preparation_state=p.preparation_state and e.size_code=p.size_code
    and p.is_active and p.review_status='approved' and e.is_active and e.review_status='approved'
    and s.is_active and s.review_status='approved' and s.freshness_status='current';
  v_context:=jsonb_build_object('edible_portion_basis',v_profile.quantity_v4_metadata->>'edible_portion_basis',
    'densities',v_density,'pieces',v_pieces);
  return jsonb_build_object('ingredient_id',p_ingredient,'profile_id',v_profile.id,
    'preparation_state',v_profile.preparation_state,'size_code',v_profile.quantity_v4_metadata->>'size_code',
    'basis_unit',v_basis,'nutrition_profile_id',v_profile.nutrition_profile_id,'unit_context',v_context);
end;
$function$;

create function private.ingredient_quantity_v4_options(p_ingredient uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_input jsonb; v_default text; v_preferred text; v_unit text; v_units text[];
  v_choices jsonb:='[]'; v_result jsonb; v_physical jsonb;
begin
  if not private.quantity_input_v4_enabled() then return null; end if;
  v_input:=private.ingredient_quantity_v4_input(p_ingredient,null);
  -- Canonical default_unit is an input preference, never a density claim.
  -- Broad dairy/other categories include solids; no substring/name guessing.
  select default_unit into v_preferred from public.ingredients where id=p_ingredient;
  v_default:=case when v_preferred in ('ml','mL','l','L') then 'mL' else 'g' end;
  v_physical:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',1,'unit','mL'),v_input->>'basis_unit');
  v_units:=case when v_default='mL' then array['mL','L','g','kg','계량큰술','계량작은술','계량컵(200mL)']
    when v_input->>'basis_unit'='ml' or v_physical->>'status'='resolved' then array['g','kg','mL','L','계량큰술','계량작은술','계량컵(200mL)']
    else array['g','kg'] end;
  for v_unit in select distinct row->>'physical_unit' from jsonb_array_elements(v_input#>'{unit_context,pieces}') row loop
    v_physical:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',1,'unit',v_unit),'g');
    if v_physical->>'status'='resolved' then v_units:=array_append(v_units,v_unit); end if;
  end loop;
  if v_preferred=any(v_units) and v_preferred not in ('g','kg','ml','mL','l','L') then
    v_default:=v_preferred; v_units:=array_prepend(v_default,array_remove(v_units,v_default));
  end if;
  for v_unit in select unnest(v_units) loop
    v_result:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',1,'unit',v_unit),v_input->>'basis_unit');
    v_choices:=v_choices||jsonb_build_array(jsonb_build_object('unit',v_unit,
      'normalized',case when v_result->>'status'='resolved'
        then jsonb_build_object('amount',v_result->'amount','unit',v_result->'unit') else null end,
      'quality',coalesce(v_result->>'quality','unavailable'),'reason',v_result->>'reason'));
  end loop;
  return jsonb_build_object('policy_version','ingredient-units-v4','profile_id',v_input->'profile_id',
    'preparation_state',v_input->'preparation_state','default_unit',v_default,'choices',v_choices,
    'recommendation_reason',case when v_preferred is not null and v_preferred not in ('g','kg','ml','mL','l','L')
      and not(v_preferred=any(v_units)) then 'UNIT_EVIDENCE_REQUIRED' else null end);
exception when no_data_found then return null;
end;
$function$;

create function private.resolve_meal_log_ingredient_v4(p_ingredient uuid,p_profile uuid,p_amount numeric,p_unit text,p_raw_input jsonb default null)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_input jsonb; v_result jsonb; v_physical jsonb; v_nutrition jsonb;
  v_raw_amount numeric:=p_amount; v_raw_unit text:=p_unit; v_display_amount numeric:=p_amount;
  v_raw jsonb; v_axis text; v_per_unit jsonb; v_converted numeric; v_convertible boolean:=false; v_equivalent boolean:=false;
begin
  v_input:=private.ingredient_quantity_v4_input(p_ingredient,p_profile);
  if p_raw_input is not null then
    v_raw:=private.parse_quantity_input_v4(p_raw_input,p_amount,p_unit);
    v_raw_amount:=(v_raw->>'amount')::numeric; v_raw_unit:=v_raw->>'raw_unit';
  end if;
  if v_raw_unit=p_unit then v_display_amount:=v_raw_amount;
  else
    foreach v_axis in array array['g','ml'] loop
      v_physical:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',v_raw_amount,'unit',v_raw_unit),v_axis);
      v_per_unit:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',1,'unit',p_unit),v_axis);
      if v_physical->>'status'='resolved' and v_per_unit->>'status'='resolved' then
        v_convertible:=true; v_converted:=(v_physical->>'amount')::numeric/(v_per_unit->>'amount')::numeric;
        if abs(v_converted-p_amount)<=greatest(1,abs(v_converted))*0.000000000001 then
          v_display_amount:=v_converted; v_equivalent:=true; exit; end if;
      end if;
    end loop;
    if not v_equivalent then
      raise exception '%',case when v_convertible then 'VALIDATION_ERROR' else 'UNIT_CONVERSION_MISSING' end using errcode='22023';
    end if;
  end if;
  v_result:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',v_raw_amount,'unit',v_raw_unit),v_input->>'basis_unit');
  -- Unknown raw spoon/count definitions remain errors. Valid physical volume
  -- with unknown density remains a real quantity and unavailable nutrition.
  if v_raw_unit not in ('g','kg','ml','mL','l','L','계량큰술','계량작은술','계량컵(200mL)') then
    v_physical:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',v_raw_amount,'unit',v_raw_unit),'g');
    if v_physical->>'status'<>'resolved' then
      raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
  end if;
  if v_result->>'status'='resolved' then
    v_nutrition:=private.resolve_meal_log_profile_nutrition((v_input->>'nutrition_profile_id')::uuid,
      (v_result->>'amount')::numeric,v_result->>'unit',p_profile is not null);
  else v_nutrition:=private.compact_meal_log_nutrition('unavailable','{}',1); end if;
  return jsonb_build_object('result',v_result,'nutrition',v_nutrition,'display_amount',v_display_amount);
end;
$function$;

-- Existing catalog entry points retain actor/visibility/selection checks.
-- The API strips this additive projection unless the new contract is requested.
do $patch$
declare v_name text; v_def text; v_old text:=$old$'default_unit', ingredient.default_unit$old$;
begin
  foreach v_name in array array[
    'public.read_food_catalog_source(uuid,text,uuid)',
    'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'
  ] loop
    v_def:=pg_get_functiondef(v_name::regprocedure);
    if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
      raise exception 'QUANTITY_V4_CATALOG_BASELINE_MISMATCH: %',v_name; end if;
    execute replace(v_def,v_old,v_old||$new$,
      'quantity_options', private.ingredient_quantity_v4_options(ingredient.id)$new$);
  end loop;
end;
$patch$;

-- Keep the original writer's authority, lock ordering, receipts, reversal and
-- batch events. Only explicit v4 input changes normalization and stores metadata.
do $patch$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)'::regprocedure);
  v_old:='v_batch_nutrition jsonb;';
  v_new:='v_batch_nutrition jsonb; v_quantity_v4 jsonb; v_v4_resolution jsonb; v_v4_snapshot jsonb; v_v4_product jsonb;';
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_DECLARATION_MISMATCH'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$  perform public.set_account_generation_internal_writer_marker($old$;
  v_new:=$new$  if p_action<>'delete' and p_payload ? 'quantity_input' then
    if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;
    v_quantity_v4:=private.parse_quantity_input_v4(p_payload->'quantity_input',v_amount,v_unit);
    if (v_source_type<>'cooked_batch' and p_payload->'quantity_input' ? 'expected_batch_revision')
      or (v_source_type<>'food_product' and p_payload->'quantity_input' ? 'expected_product_nutrition_version_id') then
      raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if v_quantity_v4->>'raw_unit'=v_unit then v_amount:=(v_quantity_v4->>'amount')::numeric; end if;
    if v_source_type='cooked_batch' then
      select * into v_batch from public.leftover_dishes where id=v_source_id and user_id=p_owner_uuid;
      v_v4_resolution:=private.cooked_quantity_input_v4(v_batch,v_amount,v_unit,p_payload->'quantity_input');
      v_amount:=(v_v4_resolution->>'amount')::numeric; v_unit:='g'; v_v4_snapshot:=v_v4_resolution->'batch_basis';
    end if;
  end if;
  perform public.set_account_generation_internal_writer_marker($new$;
  -- There are two writer-marker calls; insert at the first (before mutation).
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_MARKER_MISMATCH'; end if;
  v_def:=overlay(v_def placing v_new from position(v_old in v_def) for length(v_old));
  v_old:=$old$      if v_same_quantity then
        perform private.resolve_meal_log_product_nutrition$old$;
  v_new:=$new$      if v_quantity_v4 is not null and (not v_same_source or p_payload->'quantity_input' ? 'expected_product_nutrition_version_id') and
        (p_payload#>>'{quantity_input,expected_product_nutrition_version_id}')::uuid is distinct from v_product_version then
        raise exception 'NUTRITION_VERSION_CONFLICT' using errcode='40001'; end if;
      if v_quantity_v4 is not null and not coalesce(v_same_quantity,false) then
        v_v4_product:=private.product_quantity_input_v4(v_product_version,v_amount,v_unit,p_payload->'quantity_input');
        v_amount:=(v_v4_product->>'amount')::numeric;
        v_evidence:=private.resolve_meal_log_profile_nutrition(v_product_profile,
          (v_v4_product->>'nutrition_amount')::numeric,v_v4_product->>'nutrition_unit',v_same_source);
      elsif v_same_quantity then
        perform private.resolve_meal_log_product_nutrition$new$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_PRODUCT_MISMATCH'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$      v_nutrition_amount:=v_amount; v_nutrition_unit:=v_unit;$old$;
  v_new:=$new$      if v_quantity_v4 is not null then
        v_v4_resolution:=private.resolve_meal_log_ingredient_v4(v_source_id,v_ingredient_profile,v_amount,v_unit,p_payload->'quantity_input');
        v_amount:=(v_v4_resolution->>'display_amount')::numeric;
        v_evidence:=v_v4_resolution->'nutrition'; v_conversion_evidence:=null;
      else
      v_nutrition_amount:=v_amount; v_nutrition_unit:=v_unit;$new$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_CONVERSION_MISMATCH'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$into v_evidence from public.ingredient_nutrition_profiles profile where profile.id=v_ingredient_profile;
      end if;$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_END_MISMATCH'; end if;
  v_def:=replace(v_def,v_old,replace(v_old,'      end if;','      end if; end if;'));
  v_old:=$old$    if v_source_type='cooked_batch' then
      v_event_id:=$old$;
  v_new:=$new$    if v_quantity_v4 is not null and not coalesce(v_same_quantity,false) then
      update public.meal_log_entries set quantity_input=case when v_v4_product is not null then v_v4_product->'snapshot' else (v_quantity_v4-'amount')||jsonb_build_object(
        'normalized',case when v_source_type='cooked_batch' then jsonb_build_object('amount',v_amount,'unit','g')
          when v_v4_resolution#>>'{result,status}'='resolved' then jsonb_build_object('amount',v_v4_resolution#>'{result,amount}','unit',v_v4_resolution#>'{result,unit}')
          else null end,
        'display_quantity',jsonb_build_object('amount',v_amount,'unit',v_unit),
        'quality',case when v_source_type='cooked_batch' then v_v4_resolution->>'quality'
          when v_source_type='food_product' then 'direct' else coalesce(v_v4_resolution#>>'{result,quality}','unavailable') end,
        'reason',v_v4_resolution#>>'{result,reason}',
        'evidence_ids',coalesce(v_v4_resolution#>'{result,evidence_ids}','[]'),
        'source_versions',coalesce((select jsonb_agg(s->>'source_version') from jsonb_array_elements(coalesce(v_v4_resolution#>'{result,sources}','[]')) s),'[]'),
        'batch_basis',v_v4_snapshot) end
      where id=p_entry_id returning * into v_entry;
    elsif p_action='patch' and not coalesce(v_same_quantity,false) then
      update public.meal_log_entries set quantity_input=null where id=p_entry_id returning * into v_entry;
    end if;
    if v_source_type='cooked_batch' then
      v_event_id:=$new$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_WRITER_EVENT_MISMATCH'; end if;
  execute replace(v_def,v_old,v_new);
end;
$patch$;

-- New overload on the same internal RPC path. The nine-argument v3 function is
-- untouched; no default argument or new broad RPC/grant is introduced.
create function public.preview_meal_log_nutrition(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_source_type text,p_source_id uuid,p_amount numeric,p_unit text,p_quantity_input jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_input jsonb; v_batch public.leftover_dishes%rowtype; v_amount numeric;
  v_product_version uuid; v_product_profile uuid; v_product jsonb;
begin
  perform public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;
  v_input:=private.parse_quantity_input_v4(p_quantity_input,p_amount,p_unit); v_amount:=p_amount;
  if p_source_type='ingredient' then
    if p_quantity_input ? 'expected_product_nutrition_version_id' or p_quantity_input ? 'expected_batch_revision' then
      raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    return private.resolve_meal_log_ingredient_v4(p_source_id,null,v_amount,p_unit,p_quantity_input)->'nutrition';
  elsif p_source_type='food_product' then
    select current_nutrition_version_id into v_product_version from public.food_products
      where id=p_source_id and deleted_at is null and moderation_status='visible'
        and (visibility='public' or owner_user_id=p_owner_uuid);
    if v_product_version is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    if (p_quantity_input->>'expected_product_nutrition_version_id')::uuid is distinct from v_product_version then
      raise exception 'NUTRITION_VERSION_CONFLICT' using errcode='40001'; end if;
    select nutrition_profile_id into v_product_profile from public.food_product_nutrition_versions where id=v_product_version and product_id=p_source_id;
    v_product:=private.product_quantity_input_v4(v_product_version,v_amount,p_unit,p_quantity_input);
    return private.resolve_meal_log_profile_nutrition(v_product_profile,
      (v_product->>'nutrition_amount')::numeric,v_product->>'nutrition_unit',false);
  elsif p_source_type='cooked_batch' then
    select * into v_batch from public.leftover_dishes where id=p_source_id and user_id=p_owner_uuid;
    v_product:=private.cooked_quantity_input_v4(v_batch,p_amount,p_unit,p_quantity_input);
    return public.preview_meal_log_nutrition(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,
      p_hmac_key_version,p_session_issued_at,p_source_type,p_source_id,(v_product->>'amount')::numeric,'g');
  end if;
  return public.preview_meal_log_nutrition(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,
    p_hmac_key_version,p_session_issued_at,p_source_type,p_source_id,v_amount,p_unit);
end;
$function$;
alter function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text,jsonb) owner to postgres;
revoke all on function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text,jsonb) to service_role;

-- Project stored metadata; never reconstruct it from today's evidence or batch.
do $patch$
declare v_def text; v_old text:=$old$'quantity',jsonb_build_object('amount',p_entry.actual_amount,'unit',p_entry.actual_unit),$old$;
begin
  v_def:=pg_get_functiondef('private.project_meal_log_entry(public.meal_log_entries)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_PROJECTION_BASELINE_MISMATCH'; end if;
  execute replace(v_def,v_old,v_old||$new$
    'quantity_input',p_entry.quantity_input,$new$);
end;
$patch$;

do $policy_projection$
declare v_def text; v_old text:=$old$'day_total',v_total)$old$;
begin
  v_def:=pg_get_functiondef('public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_DAY_BASELINE_MISMATCH'; end if;
  execute replace(v_def,v_old,$new$'day_total',v_total,'quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end)$new$);
end;
$policy_projection$;

do $recent_projection$
declare v_def text; v_old text:=$old$actual_amount last_amount,actual_unit last_unit,$old$;
begin
  v_def:=pg_get_functiondef('public.get_recent_meal_log_sources(uuid,timestamptz,text,integer,timestamptz,integer,date,uuid)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_RECENT_BASELINE_MISMATCH'; end if;
  execute replace(v_def,v_old,v_old||$new$quantity_input,
    case when source_type='food_product' then food_product_nutrition_version_id else ingredient_nutrition_profile_id end source_version,$new$);
end;
$recent_projection$;

do $permissions$
declare v_function regprocedure;
begin
  for v_function in select oid::regprocedure from pg_proc
    where pronamespace='private'::regnamespace and proname in (
      'quantity_input_v4_enabled','parse_quantity_input_v4','cooked_quantity_input_v4','ingredient_quantity_v4_input',
      'ingredient_quantity_v4_options','resolve_meal_log_ingredient_v4') loop
    execute format('alter function %s owner to postgres',v_function);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
  end loop;
end;
$permissions$;
notify pgrst,'reload schema';
commit;
