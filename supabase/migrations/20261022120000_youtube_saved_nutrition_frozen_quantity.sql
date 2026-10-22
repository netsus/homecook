begin;
set local lock_timeout = '5s';

-- Additive successor to 20261019130000. Only the saved canonical guard changes.
-- Exact frozen evidence is replayed by the existing server-owned quantity
-- resolver. A stale fingerprint, changed source or unresolved unit stays NULL.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.build_recipe_nutrition_input_guard(uuid)'::regprocedure);
  v_old text;
  v_new text;
begin
  if (select md5(prosrc) from pg_proc
      where oid = 'public.build_recipe_nutrition_input_guard(uuid)'::regprocedure)
      is distinct from '72b265f2042426524b29893bf44272ba' then
    raise exception 'SAVED_FROZEN_QUANTITY_PREIMAGE_DRIFT' using errcode = '55000';
  end if;

  v_old := $old$ v_item jsonb;v_index bigint;v_explicit boolean;v_safe boolean;v_raw jsonb;v_factor numeric;v_to numeric;v_normal numeric;$old$;
  v_new := $new$ v_item jsonb;v_index bigint;v_explicit boolean;v_safe boolean;v_raw jsonb;v_factor numeric;v_to numeric;v_normal numeric;
 v_replayed jsonb;v_context jsonb;v_raw_safe boolean;
 v_frozen_contract boolean:=coalesce((nullif(current_setting('request.headers',true),'')::jsonb->>'x-homecook-frozen-quantity-guard')='v1',false);$new$;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'SAVED_FROZEN_QUANTITY_DECLARATION_DRIFT' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$   -- Numeric is transported through JS Number, while the content hash below
   -- still commits to the exact frozen original numeric and complete metadata.
   v_item:=v_item||jsonb_build_object('id',v_saved.editable_content_json#>array['ingredients',(v_index-1)::text,'row_id'],
     'amount',case when coalesce(v_safe,false) then to_jsonb((v_item->>'amount')::double precision) else 'null'::jsonb end);$old$;
  v_new := $new$   v_raw_safe:=false;
   if v_frozen_contract and v_explicit and not coalesce(v_safe,false) and v_item ? 'quantity_input'
     and jsonb_typeof(v_item->'amount')='number'
     and jsonb_typeof(v_item->'quantity_context_fingerprint')='string'
     and v_item#>>'{quantity_input,quality}' in ('direct','estimated')
     and v_item#>'{quantity_input,reason}'='null'::jsonb
     and v_item#>'{quantity_input,batch_basis}'='null'::jsonb
     and jsonb_typeof(v_item#>'{quantity_input,normalized}')='object' then
     begin
       v_context:=private.youtube_worker_quantity_input_v4(
         jsonb_build_object('_quantity_owner_action','context'),
         jsonb_build_object('ingredient_id',v_item->>'ingredient_id'));
       if v_context->>'fingerprint'=v_item->>'quantity_context_fingerprint' then
         v_replayed:=private.youtube_worker_quantity_input_v4(
           jsonb_build_object('_quantity_owner_action','edit',
             'amount',v_item#>>'{quantity_input,raw_value}',
             'unit',v_item#>>'{quantity_input,raw_unit}',
             'quantity_input',jsonb_build_object('schema_version','quantity-v4',
               'raw_value',v_item#>>'{quantity_input,raw_value}',
               'raw_unit',v_item#>>'{quantity_input,raw_unit}'),
             'expected_context_fingerprint',v_context->>'fingerprint'),
           jsonb_build_object('ingredient_id',v_item->>'ingredient_id',
             'amount',v_item->'amount','unit',v_item->'unit'));
         if v_replayed->'snapshot'=v_item->'quantity_input'
           and v_replayed->>'context_fingerprint'=v_item->>'quantity_context_fingerprint' then
           v_raw:=private.parse_quantity_input_v4(jsonb_build_object('schema_version','quantity-v4',
             'raw_value',v_item#>>'{quantity_input,raw_value}',
             'raw_unit',v_item#>>'{quantity_input,raw_unit}'),
             (v_item->>'amount')::numeric,v_item->>'unit');
           v_safe:=true;
           v_raw_safe:=true;
         end if;
       end if;
     exception when sqlstate '22023' or sqlstate '40001' or sqlstate '55000' or sqlstate 'P0002' then
       v_safe:=false;
       v_raw_safe:=false;
     end;
   end if;
   -- The content hash still commits to the exact frozen original/display
   -- values; Number transport in the app uses the same binary-float view.
   if v_raw_safe then
     v_item:=v_item||jsonb_build_object('id',v_saved.editable_content_json#>array['ingredients',(v_index-1)::text,'row_id'],
       'amount',to_jsonb((v_raw->>'amount')::double precision),'unit',v_raw->'raw_unit');
   else
     -- Exact DB239 guard for every existing caller. The new app alone opts in
     -- to the replayed frozen input; no writer is disabled during DB-first rollout.
     v_item:=v_item||jsonb_build_object('id',v_saved.editable_content_json#>array['ingredients',(v_index-1)::text,'row_id'],
       'amount',case when coalesce(v_safe,false) then to_jsonb((v_item->>'amount')::double precision) else 'null'::jsonb end);
   end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'SAVED_FROZEN_QUANTITY_BODY_DRIFT' using errcode = '55000';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- Preserve v5's row-token rules. The frozen saved-recipe identity uses the
-- existing v4 quantity warning and UUID reason contract only.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.validate_recipe_nutrition_snapshot_payload(jsonb)'::regprocedure);
  v_old text := $old$p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4' and p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v5'$old$;
  v_new text := $new$p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4' and p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v5' and p_snapshot ->> 'calculation_version' is distinct from 'recipe-nutrition-v4-frozen-v1'$new$;
begin
  if (select md5(prosrc) from pg_proc
      where oid = 'public.validate_recipe_nutrition_snapshot_payload(jsonb)'::regprocedure)
      is distinct from '48ee60720c9cb1517b969c60285a7563' then
    raise exception 'SAVED_FROZEN_VALIDATOR_PREIMAGE_DRIFT' using errcode = '55000';
  end if;
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 2 then
    raise exception 'SAVED_FROZEN_VALIDATOR_BODY_DRIFT' using errcode = '55000';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- Keep the previous v4 snapshot immutable while the new app may publish the
-- same saved content using frozen-v1 after a verified quantity replay. The
-- authenticated writer still checks the complete current server guard.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure);
  v_old text;
  v_new text;
begin
  if (select md5(prosrc) from pg_proc
      where oid = 'public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure)
      is distinct from 'e30e2612ac67e955aee0a33b8f760225' then
    raise exception 'SAVED_FROZEN_WRITER_PREIMAGE_DRIFT' using errcode = '55000';
  end if;
  v_old := $old$or (case when v_actual_input_guard->>'quantity_policy_version'='quantity-v4' then 'recipe-nutrition-v4' else 'recipe-nutrition-v3' end)
       is distinct from p_snapshot->>'calculation_version'$old$;
  v_new := $new$or (case when v_actual_input_guard->>'quantity_policy_version'='quantity-v4' then
       case when coalesce((nullif(current_setting('request.headers',true),'')::jsonb->>'x-homecook-frozen-quantity-guard')='v1',false)
         and p_snapshot->>'calculation_version'='recipe-nutrition-v4-frozen-v1'
         and v_actual_input_guard ? 'canonical_saved_recipe'
         then 'recipe-nutrition-v4-frozen-v1' else 'recipe-nutrition-v4' end
       else 'recipe-nutrition-v3' end)
       is distinct from p_snapshot->>'calculation_version'$new$;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'SAVED_FROZEN_WRITER_BODY_DRIFT' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$if p_snapshot->>'calculation_version' in ('recipe-nutrition-v4','recipe-nutrition-v5') then$old$;
  v_new := $new$if p_snapshot->>'calculation_version' in ('recipe-nutrition-v4','recipe-nutrition-v5','recipe-nutrition-v4-frozen-v1') then$new$;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'SAVED_FROZEN_WRITER_QUANTITY_DRIFT' using errcode = '55000';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := $old$  v_snapshot_hex := md5(
    p_recipe_id::text || chr(31) || (p_snapshot ->> 'input_hash') || chr(31) ||
    (p_snapshot ->> 'calculation_version')
  );$old$;
  v_new := $new$  -- A legacy reader may finish publishing after the new reader has already
  -- produced frozen-v1 for this exact immutable saved content. Keep it current.
  if v_actual_input_guard ? 'canonical_saved_recipe'
    and p_snapshot->>'calculation_version'='recipe-nutrition-v4'
    and not coalesce((nullif(current_setting('request.headers',true),'')::jsonb->>'x-homecook-frozen-quantity-guard')='v1',false) then
    select id into v_snapshot_id from public.recipe_nutrition_snapshots
      where recipe_id=p_recipe_id and input_hash=p_snapshot->>'input_hash'
        and calculation_version='recipe-nutrition-v4-frozen-v1' and is_current
      for share;
    if v_snapshot_id is not null then
      return jsonb_build_object('snapshot_id',v_snapshot_id,'created',false,'is_current',true);
    end if;
  end if;
  v_snapshot_hex := md5(
    p_recipe_id::text || chr(31) || (p_snapshot ->> 'input_hash') || chr(31) ||
    (p_snapshot ->> 'calculation_version')
  );$new$;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'SAVED_FROZEN_WRITER_IDENTITY_DRIFT' using errcode = '55000';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

commit;
