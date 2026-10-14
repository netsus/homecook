-- Additive v4 preparation only. No v3 function, record, or exposed RPC changes.
begin;
create function private.ingredient_unit_v4_normalize_text(p_text text,p_observation boolean default false)
returns text language sql immutable parallel safe
set search_path=pg_catalog,pg_temp as $function$
  select case when p_observation then regexp_replace(btrim(p_text,chars),'^1['||chars||']*','')
    else btrim(p_text,chars) end
  from (select chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||
    chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279) as chars) whitespace;
$function$;
create function private.ingredient_unit_v4_evidence_approved(p_evidence jsonb)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog,private,pg_temp as $function$
  select coalesce(nullif(private.ingredient_unit_v4_normalize_text(p_evidence->>'id'),'') is not null
    and p_evidence->>'review_status'='approved' and p_evidence->'is_active'='true'::jsonb
    and nullif(private.ingredient_unit_v4_normalize_text(p_evidence#>>'{source,id}'),'') is not null
    and nullif(private.ingredient_unit_v4_normalize_text(p_evidence#>>'{source,source_version}'),'') is not null
    and p_evidence#>>'{source,review_status}'='approved'
    and p_evidence#>'{source,is_active}'='true'::jsonb
    and p_evidence#>>'{source,freshness_status}'='current',false);
$function$;
create function private.ingredient_unit_v4_measurement_matches(p_input jsonb,p_evidence jsonb)
returns boolean language sql immutable parallel safe
set search_path=pg_catalog,private,pg_temp as $function$
  select coalesce(private.ingredient_unit_v4_evidence_approved(p_evidence)
    and nullif(private.ingredient_unit_v4_normalize_text(p_input->>'ingredient_id'),'') is not null
    and nullif(private.ingredient_unit_v4_normalize_text(p_input->>'preparation_state'),'') is not null
    and p_input#>>'{unit_context,edible_portion_basis}' in ('edible','as_purchased')
    and p_evidence->>'ingredient_id'=p_input->>'ingredient_id'
    and p_evidence->>'preparation_state'=p_input->>'preparation_state'
    and p_evidence->>'edible_portion_basis'=p_input#>>'{unit_context,edible_portion_basis}'
    and p_evidence->>'quality' in ('measured','average'),false);
$function$;
create function private.resolve_ingredient_quantity_v4(p_input jsonb,p_target text)
returns jsonb language plpgsql immutable parallel safe
set search_path=pg_catalog,private,pg_temp as $function$
declare
  v_amount numeric; v_raw text; v_unit text; v_quality text:='direct';
  v_rows jsonb; v_count integer; v_evidence jsonb;
  v_ids jsonb:='[]'; v_sources jsonb:='[]';
begin
  if p_target is null or p_target not in ('g','ml') or jsonb_typeof(p_input->'amount') is distinct from 'number'
    or jsonb_typeof(p_input->'unit') is distinct from 'string' then
    return jsonb_build_object('status','unavailable','reason','INVALID_QUANTITY');
  end if;
  v_amount:=(p_input->>'amount')::numeric; v_raw:=private.ingredient_unit_v4_normalize_text(p_input->>'unit');
  if v_amount<=0 or v_raw='' then return jsonb_build_object('status','unavailable','reason','INVALID_QUANTITY'); end if;
  if v_raw in ('g','kg') then
    v_unit:='g'; if v_raw='kg' then v_amount:=v_amount*1000; end if;
  elsif v_raw in ('ml','mL','l','L') then
    v_unit:='ml'; if v_raw in ('l','L') then v_amount:=v_amount*1000; end if;
  elsif v_raw in ('계량큰술','계량작은술','계량컵(200mL)') then
    v_unit:='ml'; v_amount:=v_amount*case v_raw when '계량큰술' then 15 when '계량작은술' then 5 else 200 end;
  else
    v_rows:=p_input#>'{unit_context,volume_definitions}';
    if jsonb_typeof(v_rows) is distinct from 'array' then v_rows:='[]'; end if;
    select count(*),(jsonb_agg(row))[0] into v_count,v_evidence from jsonb_array_elements(v_rows) row
    where row->>'kind'='volume_definition' and row->>'raw_unit'=v_raw
      and private.ingredient_unit_v4_evidence_approved(row)
      and nullif(private.ingredient_unit_v4_normalize_text(p_input#>>'{unit_context,source_id}'),'') is not null
      and row#>>'{source,id}'=p_input#>>'{unit_context,source_id}';
    if v_count>1 then return jsonb_build_object('status','unavailable','reason','AMBIGUOUS_EVIDENCE'); end if;
    if v_count=1 then
      if jsonb_typeof(v_evidence->'volume_ml') is distinct from 'number' then
        return jsonb_build_object('status','unavailable','reason','UNIT_DEFINITION_CONFLICT'); end if;
      if (v_evidence->>'volume_ml')::numeric<=0 or (v_evidence->'reference_volume_ml' is not null
        and v_evidence->'reference_volume_ml'<>'null'::jsonb
        and v_evidence->'reference_volume_ml'<>v_evidence->'volume_ml') then
        return jsonb_build_object('status','unavailable','reason','UNIT_DEFINITION_CONFLICT'); end if;
      v_unit:='ml'; v_amount:=v_amount*(v_evidence->>'volume_ml')::numeric;
    else
      v_rows:=p_input#>'{unit_context,pieces}';
      if jsonb_typeof(v_rows) is distinct from 'array' then v_rows:='[]'; end if;
      select count(*),(jsonb_agg(row))[0] into v_count,v_evidence from jsonb_array_elements(v_rows) row
      where v_raw in ('개','알','쪽','통','장','대','줄기','모','줌','꼬집','밥숟가락','스푼','숟갈','밥숟갈','숟가락','왕큰술','piece','pieces')
        and row->>'kind'='piece' and row->>'physical_unit'=v_raw
        and nullif(private.ingredient_unit_v4_normalize_text(p_input->>'size_code'),'') is not null and row->>'size_code'=p_input->>'size_code'
        and row->'observed_amount'='1'::jsonb
        and private.ingredient_unit_v4_normalize_text(row->>'observed_unit',true)=v_raw
        and row->'observed_weight_g'=row->'weight_g'
        and jsonb_typeof(row->'weight_g')='number' and (row->>'weight_g')::numeric>0
        and private.ingredient_unit_v4_measurement_matches(p_input,row);
      if v_count>1 then return jsonb_build_object('status','unavailable','reason','AMBIGUOUS_EVIDENCE'); end if;
      if v_count=0 then
        return jsonb_build_object('status','unavailable','reason',case when v_raw in
          ('개','알','쪽','통','장','대','줄기','모','줌','꼬집','밥숟가락','스푼','숟갈','밥숟갈','숟가락','왕큰술','piece','pieces')
          then 'PIECE_IDENTITY_REQUIRED' else 'UNIT_DEFINITION_REQUIRED' end);
      end if;
      v_unit:='g'; v_amount:=v_amount*(v_evidence->>'weight_g')::numeric;
      if v_evidence->>'quality'='average' then v_quality:='estimated'; end if;
    end if;
    v_ids:=v_ids||jsonb_build_array(v_evidence->>'id'); v_sources:=v_sources||jsonb_build_array(v_evidence->'source');
  end if;
  if v_unit<>p_target then
    v_rows:=p_input#>'{unit_context,densities}';
    if jsonb_typeof(v_rows) is distinct from 'array' then v_rows:='[]'; end if;
    select count(*),(jsonb_agg(row))[0] into v_count,v_evidence from jsonb_array_elements(v_rows) row
    where row->>'kind'='density' and jsonb_typeof(row->'grams_per_ml')='number' and (row->>'grams_per_ml')::numeric>0
      and private.ingredient_unit_v4_measurement_matches(p_input,row);
    if v_count>1 then return jsonb_build_object('status','unavailable','reason','AMBIGUOUS_EVIDENCE'); end if;
    if v_count=0 then return jsonb_build_object('status','unavailable','reason','DENSITY_REQUIRED'); end if;
    v_amount:=case when p_target='g' then v_amount*(v_evidence->>'grams_per_ml')::numeric
      else v_amount/(v_evidence->>'grams_per_ml')::numeric end;
    if v_evidence->>'quality'='average' then v_quality:='estimated'; end if;
    v_ids:=v_ids||jsonb_build_array(v_evidence->>'id'); v_sources:=v_sources||jsonb_build_array(v_evidence->'source');
  end if;
  if v_amount::double precision<=0 then
    return jsonb_build_object('status','unavailable','reason','INVALID_QUANTITY'); end if;
  return jsonb_build_object('status','resolved','amount',v_amount,'unit',p_target,'quality',v_quality,
    'evidence_ids',v_ids,'sources',v_sources);
exception when numeric_value_out_of_range then
  return jsonb_build_object('status','unavailable','reason','INVALID_QUANTITY');
end;
$function$;
alter function private.ingredient_unit_v4_normalize_text(text,boolean) owner to postgres;
alter function private.ingredient_unit_v4_evidence_approved(jsonb) owner to postgres;
alter function private.ingredient_unit_v4_measurement_matches(jsonb,jsonb) owner to postgres;
alter function private.resolve_ingredient_quantity_v4(jsonb,text) owner to postgres;
revoke all on function private.ingredient_unit_v4_normalize_text(text,boolean),private.ingredient_unit_v4_evidence_approved(jsonb),
  private.ingredient_unit_v4_measurement_matches(jsonb,jsonb),private.resolve_ingredient_quantity_v4(jsonb,text)
  from public,anon,authenticated,service_role;
commit;
