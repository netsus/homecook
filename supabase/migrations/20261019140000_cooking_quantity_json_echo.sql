-- Compare the JSON number echo at the JavaScript transport boundary. Always
-- retain the locked database row, including its exact frozen quantity proof.
begin;

create function private.cooking_quantity_json_echo(p_value jsonb) returns jsonb
language plpgsql immutable strict parallel safe security invoker
set search_path=pg_catalog set extra_float_digits=3 as $function$
declare v_result jsonb;
begin
 case jsonb_typeof(p_value)
 when 'number' then
  -- float8 conversion rejects values outside its finite representable range.
  return to_jsonb((p_value #>> '{}')::double precision);
 when 'array' then
  select coalesce(jsonb_agg(private.cooking_quantity_json_echo(item.value) order by item.ordinality),'[]'::jsonb)
   into v_result from jsonb_array_elements(p_value) with ordinality item(value,ordinality);
  return v_result;
 when 'object' then
  select coalesce(jsonb_object_agg(item.key,private.cooking_quantity_json_echo(item.value)),'{}'::jsonb)
   into v_result from jsonb_each(p_value) item(key,value);
  return v_result;
 else return p_value;
 end case;
end;$function$;
alter function private.cooking_quantity_json_echo(jsonb) owner to postgres;
revoke all on function private.cooking_quantity_json_echo(jsonb) from public,anon,authenticated,service_role;

-- Preserve the established function OID, ACL, security, configuration and all
-- non-echo validation. Anchor counts fail closed against an unexpected source.
do $migration$
declare v_definition text;v_declaration text;v_comparison text;v_replacement text;
begin
 select pg_get_functiondef('public.save_cooking_execution_quantities(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz)'::regprocedure) into v_definition;
 v_declaration:='v_recipe_id uuid;v_claim jsonb;v_result jsonb;';
 v_comparison:=$anchor$if p_rows is distinct from (select jsonb_agg(case when change.row is null then original.row else
   (original.row-'quantity_input')||jsonb_build_object('amount',change.row->'amount','unit',change.row->'unit',
    'ingredient_type','QUANT','scalable',false,'display_text',null) end order by original.idx)
  from jsonb_array_elements(coalesce(v_execution.rows_json,v_snapshot.ingredients_json)) with ordinality original(row,idx)
  left join jsonb_array_elements(p_request_changes) change(row) on (change.row->>'row_index')::numeric=original.idx-1)
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;$anchor$;
 v_replacement:=$replacement$select jsonb_agg(case when change.row is null then original.row else
   (original.row-'quantity_input')||jsonb_build_object('amount',change.row->'amount','unit',change.row->'unit',
    'ingredient_type','QUANT','scalable',false,'display_text',null) end order by original.idx)
  into v_expected_rows
  from jsonb_array_elements(coalesce(v_execution.rows_json,v_snapshot.ingredients_json)) with ordinality original(row,idx)
  left join jsonb_array_elements(p_request_changes) change(row) on (change.row->>'row_index')::numeric=original.idx-1;
 if private.cooking_quantity_json_echo(p_rows) is distinct from private.cooking_quantity_json_echo(v_expected_rows)
 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
 -- Submitted JSON is only an echo. Validation and persistence below use the
 -- exact locked source plus the explicit requested changes, never that echo.
 p_rows:=v_expected_rows;$replacement$;
 if (length(v_definition)-length(replace(v_definition,v_declaration,'')))/length(v_declaration)<>1
  or (length(v_definition)-length(replace(v_definition,v_comparison,'')))/length(v_comparison)<>1
 then raise exception 'COOKING_QUANTITY_ECHO_SOURCE_MISMATCH';end if;
 execute replace(replace(v_definition,v_declaration,v_declaration||'v_expected_rows jsonb;'),v_comparison,v_replacement);
end;$migration$;

commit;
