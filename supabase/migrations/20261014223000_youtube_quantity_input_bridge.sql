-- Inactive worker bridge. No source rows, past snapshots, runtime policy or
-- public RPC permissions are changed. The existing quantity policy is the
-- sole write authority; old worker outputs have no transport key.
-- DDL actor: the historical YouTube migration administrator (supabase_admin),
-- which may lease the restricted function owners. This is a separate worker
-- rollout, not part of the postgres-only C03/C01 deployment pipeline.
begin;

do $prior_catalog$
declare v_claims text:=current_setting('request.jwt.claims',true); v_fingerprint text;
begin
  perform set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true);
  v_fingerprint:=public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  if v_fingerprint is distinct from '81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9' then
    raise exception 'YouTube quantity bridge prior catalog drifted' using errcode='55000'; end if;
end;
$prior_catalog$;

-- Only mutation RPCs call this admission. Read-only stable hydration never
-- acquires a row lock, and the reviewed shared helper's ACL stays unchanged.
create function private.youtube_worker_quantity_write_admission_v4()
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,private,pg_temp as $function$
declare v_enabled boolean;
begin
  select enabled into v_enabled from private.quantity_input_v4_policy where singleton for share;
  return coalesce(v_enabled,false);
end;
$function$;
alter function private.youtube_worker_quantity_write_admission_v4() owner to postgres;
revoke all on function private.youtube_worker_quantity_write_admission_v4() from public,anon,authenticated,service_role;
grant execute on function private.youtube_worker_quantity_write_admission_v4() to youtube_extraction_worker_rpc_owner;

create function private.youtube_worker_quantity_input_v4(p_runtime jsonb,p_resolved jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_raw jsonb; v_input jsonb; v_result jsonb; v_versions jsonb; v_snapshot jsonb;
  v_amount numeric; v_literal text; v_axis text; v_from jsonb; v_to jsonb; v_converted numeric;
  v_hash text; v_owner_action text:=p_runtime->>'_quantity_owner_action'; v_key text;
begin
  if v_owner_action is null and (not private.quantity_input_v4_enabled() or not(p_runtime ? 'quantity_input')) then return null; end if;
  if v_owner_action is not null and v_owner_action not in ('context','edit') then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  -- Server-held source identity only. A missing reviewed predecessor supplies
  -- no density, count identity, state or size evidence.
  begin
    v_input:=private.ingredient_quantity_v4_input(nullif(p_resolved->>'ingredient_id','')::uuid,null);
  exception when no_data_found then
    v_input:=jsonb_build_object('ingredient_id',nullif(p_resolved->>'ingredient_id',''),'basis_unit','g');
  end;
  -- Ordering is part of a context stamp, not a new conversion policy.
  foreach v_key in array array['densities','pieces','volume_definitions'] loop
    if jsonb_typeof(v_input#>array['unit_context',v_key])='array' then
      v_input:=jsonb_set(v_input,array['unit_context',v_key],(select coalesce(jsonb_agg(row order by row->>'id'),'[]'::jsonb)
        from jsonb_array_elements(v_input#>array['unit_context',v_key]) row));
    end if;
  end loop;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('input',v_input,
    'profile_version',(select version from public.ingredient_nutrition_profiles where id=nullif(v_input->>'profile_id','')::uuid),
    'nutrition_profile_version',(select version from public.nutrition_profiles where id=nullif(v_input->>'nutrition_profile_id','')::uuid))::text,'UTF8'),'sha256'),'hex');
  if v_owner_action='context' then
    return jsonb_build_object('fingerprint',v_hash,'options',case when private.quantity_input_v4_enabled()
      and v_input ? 'profile_id' then private.ingredient_quantity_v4_options((v_input->>'ingredient_id')::uuid) else null end);
  end if;
  if v_owner_action='edit' then
    if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;
    if p_runtime->>'expected_context_fingerprint' is distinct from v_hash then
      raise exception 'QUANTITY_CONTEXT_CHANGED' using errcode='40001'; end if;
  else
    -- Worker source quality and identity were verified by the existing fenced
    -- RPC before this call. Model unit contexts never become evidence.
    if p_runtime ? 'unit_context' or p_resolved->>'quantity_state' is distinct from 'explicit'
      or p_resolved->>'resolution_status' is distinct from 'resolved'
      or p_resolved->>'quantity_source' not in ('text_explicit','visual_explicit')
      or p_resolved->'quantity_review_required' is distinct from 'false'::jsonb then return null; end if;
  end if;
  if jsonb_typeof(p_runtime->'quantity_input') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_runtime->'quantity_input'))<>3
    or p_runtime#>>'{quantity_input,raw_value}' is distinct from p_runtime->>'amount'
    or p_runtime#>>'{quantity_input,raw_unit}' is distinct from p_runtime->>'unit'
    or (v_owner_action is null and private.ingredient_unit_v4_normalize_text(p_runtime->>'unit') is distinct from p_resolved->>'unit') then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_amount:=(p_resolved->>'amount')::numeric;
  v_literal:=private.ingredient_unit_v4_normalize_text(p_runtime->>'amount');
  -- Repair the legacy leading-dot parser only in explicit worker v4 input.
  if v_owner_action is null and v_literal~'^\.\d+$' then
    if v_amount not in (v_literal::numeric,substr(v_literal,2)::numeric) then
      raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    v_amount:=v_literal::numeric;
  end if;
  v_raw:=private.parse_quantity_input_v4(p_runtime->'quantity_input',v_amount,
    case when v_owner_action='edit' then p_resolved->>'unit' else p_runtime->>'unit' end);
  if v_owner_action='edit' and v_raw->>'raw_unit'<>p_resolved->>'unit' then
    foreach v_axis in array array['g','ml'] loop
      v_from:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',v_raw->'amount','unit',v_raw->'raw_unit'),v_axis);
      v_to:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object('amount',1,'unit',p_resolved->>'unit'),v_axis);
      if v_from->>'status'='resolved' and v_to->>'status'='resolved' then
        v_converted:=(v_from->>'amount')::numeric/(v_to->>'amount')::numeric;
        if abs(v_converted-v_amount)>greatest(1,abs(v_converted))*0.000000000001 then
          raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        v_amount:=v_converted; exit;
      end if;
    end loop;
    if v_converted is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
  elsif v_owner_action='edit' then v_amount:=(v_raw->>'amount')::numeric; end if;
  v_result:=private.resolve_ingredient_quantity_v4(v_input||jsonb_build_object(
    'amount',v_raw->'amount','unit',v_raw->'raw_unit'),v_input->>'basis_unit');
  select coalesce(jsonb_agg(source->>'source_version'),'[]'::jsonb) into v_versions
  from jsonb_array_elements(coalesce(v_result->'sources','[]'::jsonb)) source;
  v_snapshot:=(v_raw-'amount')||jsonb_build_object(
    'display_quantity',jsonb_build_object('amount',v_amount,'unit',p_resolved->'unit'),
    'normalized',case when v_result->>'status'='resolved' then jsonb_build_object(
      'amount',v_result->'amount','unit',v_result->'unit') else 'null'::jsonb end,
    'quality',case when v_result->>'status'='resolved' then v_result->>'quality' else 'unavailable' end,
    'reason',case when v_result->>'status'='resolved' then null else v_result->>'reason' end,
    'evidence_ids',coalesce(v_result->'evidence_ids','[]'::jsonb),
    'source_versions',v_versions,'batch_basis',null);
  return jsonb_build_object('snapshot',v_snapshot,'context_fingerprint',v_hash);
end;
$function$;
alter function private.youtube_worker_quantity_input_v4(jsonb,jsonb) owner to postgres;
revoke all on function private.youtube_worker_quantity_input_v4(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.youtube_worker_quantity_input_v4(jsonb,jsonb) to youtube_extraction_worker_rpc_owner;

-- Replace only the row projection, after all existing actor/identity/lease/
-- permit/evidence/catalog checks. Preserve the restricted RPC owner and ACL.
do $membership$
begin
  if current_setting('server_version_num')::integer>=160000 then
    execute format('grant youtube_extraction_worker_rpc_owner to %I with inherit false, set true granted by %I',current_user,current_user);
  else execute format('grant youtube_extraction_worker_rpc_owner to %I',current_user); end if;
end;
$membership$;
grant create on schema public to youtube_extraction_worker_rpc_owner;
set local role youtube_extraction_worker_rpc_owner;
do $resolver$
declare v_def text:=pg_get_functiondef('public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure);
  v_old text:='    v_ingredients := v_ingredients || jsonb_build_array(v_ingredient_row);';
  v_new text:=$new$    if v_ingredient ?| array['_quantity_owner_action','expected_context_fingerprint'] then
      raise exception 'VALIDATION_ERROR' using errcode='22023';
    end if;
    if v_ingredient ? 'quantity_input' then
      if private.youtube_worker_quantity_write_admission_v4() then
        v_quantity_input := private.youtube_worker_quantity_input_v4(v_ingredient,v_ingredient_row);
      else v_quantity_input := null; end if;
      if v_quantity_input is not null then
        v_ingredient_row := v_ingredient_row||jsonb_build_object('quantity_input',v_quantity_input->'snapshot',
          'quantity_context_fingerprint',v_quantity_input->'context_fingerprint',
          'amount',v_quantity_input#>'{snapshot,display_quantity,amount}');
      end if;
    end if;
    v_ingredients := v_ingredients || jsonb_build_array(v_ingredient_row);$new$;
begin
  if strpos(v_def,'v_quantity_state text;')=0 or strpos(v_def,'v_quantity_input jsonb;')>0
    or (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1
    or (length(v_def)-length(replace(v_def,'  v_draft jsonb;','')))/length('  v_draft jsonb;')<>1 then
    raise exception 'YouTube quantity transport predecessor drifted' using errcode='55000'; end if;
  execute replace(replace(v_def,'  v_draft jsonb;',E'  v_draft jsonb;\n  v_quantity_input jsonb;'),v_old,v_new);
end;
$resolver$;
do $finalizer$
declare v_def text:=pg_get_functiondef('public.finalize_youtube_extraction_job(uuid,text,bigint,jsonb)'::regprocedure);
  v_old text:='  v_session_hash := encode(';
  v_new text:=$new$  if exists(select 1 from jsonb_array_elements(coalesce(v_draft_json->'ingredients','[]'::jsonb)) row
    where row ? 'quantity_input') and not private.youtube_worker_quantity_write_admission_v4() then
    raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000';
  end if;
  v_session_hash := encode($new$;
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity finalizer predecessor drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);
end;
$finalizer$;
reset role;
revoke create on schema public from youtube_extraction_worker_rpc_owner;
do $membership$
begin
  if current_setting('server_version_num')::integer>=160000 then
    execute format('revoke youtube_extraction_worker_rpc_owner from %I granted by %I',current_user,current_user);
  else execute format('revoke youtube_extraction_worker_rpc_owner from %I',current_user); end if;
end;
$membership$;

do $saved_content$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('private.build_youtube_saved_recipe_content_from_source(jsonb)'::regprocedure);
  v_old:=$old$'component_label', coalesce(item -> 'component_label','null'::jsonb)
    ) order by ordinality)$old$;
  v_new:=$new$'component_label', coalesce(item -> 'component_label','null'::jsonb)
    )||case when item ? 'quantity_input' then jsonb_build_object('quantity_input',item->'quantity_input')||case when item ? 'quantity_context_fingerprint' then jsonb_build_object('quantity_context_fingerprint',item->'quantity_context_fingerprint') else '{}'::jsonb end else '{}'::jsonb end
      order by ordinality)$new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube saved quantity builder predecessor drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);

end;
$saved_content$;

-- Preserve the exact legacy validator as an internal, actually called stage.
-- Its checks are not removed or loosened by the optional quantity contract.
do $legacy_validator$
declare v_def text:=pg_get_functiondef('private.validate_youtube_saved_recipe_editable_content(jsonb,jsonb)'::regprocedure);
begin
  execute replace(v_def,'FUNCTION private.validate_youtube_saved_recipe_editable_content(',
    'FUNCTION private.validate_youtube_saved_quantity_legacy(');
end;
$legacy_validator$;
alter function private.validate_youtube_saved_quantity_legacy(jsonb,jsonb) owner to postgres;
revoke all on function private.validate_youtube_saved_quantity_legacy(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function private.validate_youtube_saved_recipe_editable_content(p_content jsonb,p_source_snapshot jsonb)
returns jsonb language plpgsql stable
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_base jsonb; v_content jsonb; v_items jsonb:='[]'; v_item jsonb; v_client jsonb; v_source jsonb; v_current jsonb;
  v_trusted jsonb; v_quantity jsonb; v_context jsonb; v_runtime jsonb; v_existing jsonb; v_origin jsonb;
  v_index bigint; v_id text; v_same boolean; v_replay boolean:=false;
begin
  if jsonb_typeof(p_content->'ingredients') is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_content->'ingredients') row
    where jsonb_typeof(row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(row) key
      where key not in ('row_id','source_draft_ingredient_id','standard_name','quantity_mode','amount','unit','display_text','component_label',
        'quantity_input','quantity_context_fingerprint'))) then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_base:=jsonb_set(p_content,'{ingredients}',coalesce((select jsonb_agg(row-'quantity_input'-'quantity_context_fingerprint' order by ordinality)
    from jsonb_array_elements(p_content->'ingredients') with ordinality rows(row,ordinality)),'[]'));
  -- JavaScript's JSON number is a transport view of the stored numeric.
  -- Restore only the exact same binary float view, never an epsilon range.
  -- Explicit new raw text still determines its own canonical quantity below.
  v_existing:=coalesce(p_source_snapshot->'_quantity_current_content','{}');
  v_items:='[]';
  for v_item in select row from jsonb_array_elements(v_base->'ingredients') row loop
    v_current:=null; v_source:=null;
    select row into v_current from jsonb_array_elements(coalesce(v_existing->'ingredients','[]')) row
      where row->>'row_id'=v_item->>'row_id';
    if v_current is null then
      select row into v_source from jsonb_array_elements(coalesce(p_source_snapshot#>'{draft_json,ingredients}','[]')) row
        where row->>'draft_ingredient_id'=v_item->>'source_draft_ingredient_id';
      v_current:=v_source;
    end if;
    if v_current ? 'quantity_input' and v_current->>'standard_name'=btrim(v_item->>'standard_name')
      and v_current->'unit'=v_item->'unit' and v_item->>'quantity_mode'='quantity'
      and (v_source is not null or v_current->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id')
      and (v_current->>'amount')::double precision=(v_item->>'amount')::double precision then
      v_item:=jsonb_set(v_item,'{amount}',v_current->'amount');
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  v_base:=jsonb_set(v_base,'{ingredients}',v_items); v_items:='[]';
  v_content:=private.validate_youtube_saved_quantity_legacy(v_base,p_source_snapshot);
  v_existing:=coalesce(p_source_snapshot->'_quantity_current_content','{}');
  for v_item,v_index in select row,ordinality from jsonb_array_elements(v_content->'ingredients') with ordinality rows(row,ordinality) loop
    v_client:=p_content->'ingredients'->(v_index::integer-1);
    v_source:=null; v_current:=null; v_trusted:=null; v_quantity:=null; v_context:=null; v_replay:=false;
    select row into v_source from jsonb_array_elements(coalesce(p_source_snapshot#>'{draft_json,ingredients}','[]')) row
      where row->>'draft_ingredient_id'=v_item->>'source_draft_ingredient_id';
    select row into v_current from jsonb_array_elements(coalesce(v_existing->'ingredients','[]')) row
      where row->>'row_id'=v_item->>'row_id';
    v_same:=v_current is not null and v_current->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id'
      and v_current->>'standard_name'=v_item->>'standard_name' and v_current->'amount'=v_item->'amount'
      and v_current->'unit'=v_item->'unit' and v_current->'quantity_mode'=v_item->'quantity_mode';
    if v_same and v_current ? 'quantity_input' then v_trusted:=v_current;
    elsif v_current is null and v_source ? 'quantity_input'
      and v_source->>'standard_name'=v_item->>'standard_name' and v_source->'amount'=v_item->'amount'
      and v_source->'unit'=v_item->'unit' and v_item->>'quantity_mode'='quantity' then
      v_trusted:=jsonb_build_object('quantity_input',v_source->'quantity_input');
      if v_source ? 'quantity_context_fingerprint' then
        v_trusted:=v_trusted||jsonb_build_object('quantity_context_fingerprint',v_source->'quantity_context_fingerprint'); end if;
    end if;
    -- A receipt is server-held history, not new conversion authority. Exact
    -- raw/tuple echoes can normalize to that original result before replay.
    if v_client#>>'{quantity_input,expected_context_fingerprint}' is not null then
      select row into v_origin from jsonb_array_elements(coalesce(p_source_snapshot#>'{_quantity_replay_content,ingredients}','[]')) row
        where row->>'row_id'=v_item->>'row_id' and row->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id'
          and row->>'standard_name'=v_item->>'standard_name' and row->'amount'=v_item->'amount' and row->'unit'=v_item->'unit'
          and row->'quantity_mode'=v_item->'quantity_mode'
          and row#>>'{quantity_input,raw_value}'=v_client#>>'{quantity_input,raw_value}'
          and row#>>'{quantity_input,raw_unit}'=v_client#>>'{quantity_input,raw_unit}'
          and row->>'quantity_context_fingerprint'=v_client#>>'{quantity_input,expected_context_fingerprint}';
      if v_origin is not null then v_trusted:=v_origin; v_replay:=true; end if;
    end if;
    if v_client ? 'quantity_input' then
      if v_client->'quantity_input'='null'::jsonb then
        if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;
        -- Explicit clear is different from an older editor's missing key.
        v_trusted:=null;
      elsif v_client#>>'{quantity_input,expected_context_fingerprint}' is not null then
        if jsonb_typeof(v_client->'quantity_input') is distinct from 'object'
          or (select count(*) from jsonb_object_keys(v_client->'quantity_input'))<>4 then
          raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        if not v_replay and v_same and v_trusted is not null
          and v_trusted#>>'{quantity_input,raw_value}'=v_client#>>'{quantity_input,raw_value}'
          and v_trusted#>>'{quantity_input,raw_unit}'=v_client#>>'{quantity_input,raw_unit}'
          and v_trusted->>'quantity_context_fingerprint'=v_client#>>'{quantity_input,expected_context_fingerprint}' then
          v_replay:=true; -- unchanged quantity, including an OFF title edit
        end if;
        if not v_replay then
          if v_item->>'quantity_mode'<>'quantity' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
          v_id:=case when v_source->>'standard_name'=v_item->>'standard_name' and v_source->>'resolution_status'='resolved'
            then nullif(v_source->>'ingredient_id','') else null end;
          v_runtime:=jsonb_build_object('_quantity_owner_action','edit','amount',v_client#>>'{quantity_input,raw_value}',
            'unit',v_client#>>'{quantity_input,raw_unit}','quantity_input',(v_client->'quantity_input')-'expected_context_fingerprint',
            'expected_context_fingerprint',v_client#>>'{quantity_input,expected_context_fingerprint}');
          v_context:=private.youtube_worker_quantity_input_v4(v_runtime,jsonb_build_object('ingredient_id',v_id,'amount',v_item->'amount','unit',v_item->'unit'));
          v_trusted:=jsonb_build_object('quantity_input',v_context->'snapshot','quantity_context_fingerprint',v_context->'context_fingerprint');
          v_item:=jsonb_set(v_item,'{amount}',v_context#>'{snapshot,display_quantity,amount}');
        end if;
      elsif v_trusted is null or v_client->'quantity_input' is distinct from v_trusted->'quantity_input' then
        raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    elsif v_current ? 'quantity_input' and not v_same then
      raise exception '%',case when private.quantity_input_v4_enabled() then 'QUANTITY_INPUT_REQUIRED' else 'UNIT_POLICY_INACTIVE' end using errcode='55000';
    end if;
    if v_client ? 'quantity_context_fingerprint' and (v_trusted is null
      or v_client->'quantity_context_fingerprint' is distinct from v_trusted->'quantity_context_fingerprint') then
      raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if v_trusted is not null then
      v_item:=v_item||jsonb_build_object('quantity_input',v_trusted->'quantity_input');
      if v_trusted ? 'quantity_context_fingerprint' then v_item:=v_item||jsonb_build_object(
        'quantity_context_fingerprint',v_trusted->'quantity_context_fingerprint'); end if;
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  return jsonb_set(v_content,'{ingredients}',v_items);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'VALIDATION_ERROR' using errcode='22023';
end;
$function$;

do $owner_read_and_write$
declare v_def text; v_old text; v_new text;
begin
  v_def:=pg_get_functiondef('private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results)'::regprocedure);
  v_old:=$old$'content', p_result.editable_content_json,$old$;
  v_new:=$new$'content', p_result.editable_content_json,$new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity owner projection drifted' using errcode='55000'; end if;
  -- Add only the requested contract's data. The web reader removes these
  -- fields for a legacy request; stored source metadata is never recomputed.
  v_old:=$old$  );$old$;
  v_new:=$new$  )||case when private.quantity_input_v4_enabled() or exists(
    select 1 from jsonb_array_elements(p_result.editable_content_json->'ingredients') row where row ? 'quantity_input') then
    jsonb_build_object('quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end,
      'quantity_contexts',coalesce((select jsonb_object_agg(row->>'row_id',private.youtube_worker_quantity_input_v4(
        jsonb_build_object('_quantity_owner_action','context'),jsonb_build_object('ingredient_id',(
          select case when count(*)=1 then max(source_item->>'ingredient_id') else null end
          from jsonb_array_elements(coalesce(p_result.source_snapshot_json#>'{draft_json,ingredients}','[]')) source_item
          where source_item->>'draft_ingredient_id'=row->>'source_draft_ingredient_id'
            and source_item->>'standard_name'=row->>'standard_name' and source_item->>'resolution_status'='resolved'))))
        from jsonb_array_elements(p_result.editable_content_json->'ingredients') row),'{}'::jsonb)) else '{}'::jsonb end;$new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity owner projection return drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);

  v_def:=pg_get_functiondef('public.write_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,uuid,timestamptz)'::regprocedure);
  v_old:=$old$private.validate_youtube_saved_recipe_editable_content(p_editable_content, v_result.source_snapshot_json)$old$;
  v_new:=$new$private.validate_youtube_saved_recipe_editable_content(p_editable_content,
        v_result.source_snapshot_json||jsonb_build_object('_quantity_current_content',v_result.editable_content_json,
          '_quantity_replay_content',(select receipt.durable_result#>'{data,content}' from private.youtube_saved_recipe_result_mutations receipt
            where receipt.owner_user_id=p_owner_uuid and receipt.account_generation=v_generation
              and receipt.operation=p_action and receipt.idempotency_key=p_idempotency_key)))$new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity create replay context drifted' using errcode='55000'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$private.validate_youtube_saved_recipe_editable_content(p_editable_content,v_result.source_snapshot_json)$old$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity update context drifted' using errcode='55000'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$  insert into private.youtube_saved_recipe_result_mutations($old$;
  v_new:=$new$  -- A successful receipt returned above is durable. Only a fresh
  -- quantity edit/clear must wait for policy OFF through transaction end.
  if exists(select 1 from jsonb_array_elements(p_editable_content->'ingredients') client_row
    where client_row ? 'quantity_input' and (
      client_row->'quantity_input'='null'::jsonb or (
        client_row->'quantity_input' ? 'expected_context_fingerprint' and not exists(
          select 1 from jsonb_array_elements(coalesce(v_result.editable_content_json->'ingredients','[]'::jsonb)) current_row
          join jsonb_array_elements(v_content->'ingredients') normalized_row on normalized_row->'row_id'=current_row->'row_id'
          where current_row->'row_id'=client_row->'row_id'
            and current_row->'source_draft_ingredient_id' is not distinct from normalized_row->'source_draft_ingredient_id'
            and current_row->'standard_name'=normalized_row->'standard_name'
            and current_row->'amount'=normalized_row->'amount' and current_row->'unit'=normalized_row->'unit'
            and current_row->'quantity_mode'=normalized_row->'quantity_mode'
            and current_row->'quantity_input' is not distinct from normalized_row->'quantity_input'
            and current_row->'quantity_context_fingerprint' is not distinct from normalized_row->'quantity_context_fingerprint')))) then
    perform private.require_recipe_quantity_writes_v4();
  end if;
  insert into private.youtube_saved_recipe_result_mutations($new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube quantity mutation admission predecessor drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);
end;
$owner_read_and_write$;

do $saved_snapshot$
declare v_def text:=pg_get_functiondef('public.build_recipe_content_snapshot_input(uuid)'::regprocedure);
  v_old text:=$old$  ) order by ordinality), '[]'::jsonb)
    into v_ingredients$old$;
  v_new text:=$new$  )||case when item ? 'quantity_input' then jsonb_build_object('quantity_input',item->'quantity_input')||case when item ? 'quantity_context_fingerprint' then jsonb_build_object('quantity_context_fingerprint',item->'quantity_context_fingerprint') else '{}'::jsonb end else '{}'::jsonb end
    order by ordinality), '[]'::jsonb)
    into v_ingredients$new$;
begin
  if strpos(v_def,'build_recipe_content_snapshot_before_yt_saved_20261012')=0
    or (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'YouTube saved snapshot quantity predecessor drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);
end;
$saved_snapshot$;

-- Bind the newly privileged adapter's source and execution context to the
-- existing reviewed dependency contract, with exact additional identities.
do $dependency_contract$
declare v_def text:=pg_get_functiondef('private.youtube_extraction_shared_dependency_contract_v1()'::regprocedure);
  v_old text:='''public.match_ingredient_name_exact(text)''';
  v_new text:=$new$'public.match_ingredient_name_exact(text)',
        'private.youtube_worker_quantity_input_v4(jsonb,jsonb)',
        'private.youtube_worker_quantity_write_admission_v4()'$new$;
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1
    or strpos(v_def,'private.youtube_worker_quantity_input_v4(jsonb,jsonb)')>0 then
    raise exception 'YouTube quantity dependency contract drifted' using errcode='55000'; end if;
  execute replace(v_def,v_old,v_new);
end;
$dependency_contract$;

-- The resolver body participates in the existing fixed catalog guard. These
-- constants were computed offline from the exact before/post source in the
-- original restricted owner + empty search_path, not learned during rollout.
do $membership$
begin
  if current_setting('server_version_num')::integer>=160000 then
    execute format('grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',current_user,current_user);
  else execute format('grant youtube_extraction_credential_manager_rpc_owner to %I',current_user); end if;
end;
$membership$;
grant create on schema public,private to youtube_extraction_credential_manager_rpc_owner;
set local role youtube_extraction_credential_manager_rpc_owner;
do $catalog_attestation$
declare v_signature regprocedure; v_def text;
  v_before constant text:='81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9';
  v_after constant text:='de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05';
begin
  foreach v_signature in array array['public.read_youtube_extraction_enqueue_readiness()'::regprocedure,
    'private.assert_youtube_extraction_catalog_ready()'::regprocedure] loop
    v_def:=pg_get_functiondef(v_signature);
    if (length(v_def)-length(replace(v_def,v_before,'')))/length(v_before)<>1 or strpos(v_def,v_after)>0 then
      raise exception 'YouTube quantity catalog attestation source drifted' using errcode='55000'; end if;
    execute replace(v_def,v_before,v_after);
  end loop;
end;
$catalog_attestation$;
reset role;
revoke create on schema public,private from youtube_extraction_credential_manager_rpc_owner;
do $membership$
begin
  if current_setting('server_version_num')::integer>=160000 then
    execute format('revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',current_user,current_user);
  else execute format('revoke youtube_extraction_credential_manager_rpc_owner from %I',current_user); end if;
end;
$membership$;
do $post_catalog$
declare v_claims text:=current_setting('request.jwt.claims',true); v_fingerprint text;
begin
  perform set_config('request.jwt.claims','{"role":"youtube_extraction_worker"}',true);
  v_fingerprint:=public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  if v_fingerprint is distinct from 'de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05' then
    raise exception 'YouTube quantity bridge post catalog drifted' using errcode='55000'; end if;
end;
$post_catalog$;
notify pgrst,'reload schema';
commit;
