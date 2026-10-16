-- C04 editor reads the current private policy under the existing entry authority.
-- Saved quantity_input remains readable after OFF and does not activate editing.
-- No new function, RPC, grants, tables, backfill or writer changes.
begin;
do $read_capability$
declare v_def text; v_old text;
begin
  v_def:=pg_get_functiondef('public.product_planner_entry_payload(uuid,uuid)'::regprocedure);
  v_old:=$old$'quantity_input', v_entry.quantity_input,$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_EDIT_PAYLOAD_PREIMAGE'; end if;
  execute replace(v_def,v_old,v_old||$new$'quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end,$new$);

  v_def:=pg_get_functiondef('public.list_product_planner_entries(uuid,date,date,uuid)'::regprocedure);
  v_old:=$old$'quantity_input',context.quantity_input,$old$;
  if position(v_old in v_def)=0 then raise exception 'QUANTITY_V4_EDIT_LIST_PREIMAGE'; end if;
  execute replace(v_def,v_old,v_old||$new$'quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end,$new$);
end;
$read_capability$;
commit;
