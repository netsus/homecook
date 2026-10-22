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

commit;
