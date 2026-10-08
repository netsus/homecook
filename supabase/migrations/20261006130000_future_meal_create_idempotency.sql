begin;

-- Preserve the existing authoritative meal writer. A receipt and its source
-- action commit together, so response loss cannot create a second meal.
create function public.create_future_meal_idempotent(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,p_idempotency_key uuid,
  p_recipe_id uuid,p_plan_date date,p_column_id uuid,p_planned_servings integer,
  p_leftover_dish_id uuid default null,p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_authority jsonb;v_claim jsonb;v_result jsonb;v_leftover public.leftover_dishes%rowtype;
begin
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  if p_idempotency_key is null or p_recipe_id is null or p_plan_date is null or p_column_id is null
    or p_planned_servings is null or p_planned_servings<=0 or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  -- These private helpers operate on the generic owner/generation receipt table.
  -- The scope separates meal creation from cooked-batch operations and actions.
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,
    'future_meal_create',p_idempotency_key,jsonb_build_object('recipe_id',p_recipe_id,'plan_date',p_plan_date,
      'column_id',p_column_id,'planned_servings',p_planned_servings,'leftover_dish_id',p_leftover_dish_id),p_now);
  if v_claim ? 'replay' then return v_claim->'replay';end if;
  -- The route's legacy leftover eligibility rule remains enforced for keyed writes.
  if p_leftover_dish_id is not null then
    select * into v_leftover from public.leftover_dishes where id=p_leftover_dish_id for key share;
    if v_leftover.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';end if;
    if v_leftover.user_id is distinct from p_owner_uuid then raise exception 'FORBIDDEN' using errcode='42501';end if;
    if v_leftover.recipe_id is distinct from p_recipe_id then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
    if not coalesce(case when v_leftover.recipe_content_snapshot_id is null then v_leftover.status='leftover'
      else v_leftover.weight_status='known' and v_leftover.batch_status='available'
        and v_leftover.remaining_weight_g>0 and v_leftover.depleted_reason is null end,false) then
      raise exception 'CONFLICT' using errcode='55000';
    end if;
  end if;
  v_result:=public.write_future_meal_with_snapshot_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at,'create',null,p_recipe_id,p_plan_date,p_column_id,
    p_planned_servings,p_leftover_dish_id,p_now);
  if v_result->>'id' is null then raise exception 'CONFLICT' using errcode='55000';end if;
  perform private.finish_cooked_batch_operation((v_claim->>'receipt_id')::uuid,v_result,(v_result->>'id')::uuid,p_now);
  return v_result;
end;
$function$;
alter function public.create_future_meal_idempotent(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,date,uuid,integer,uuid,timestamptz) owner to postgres;
revoke all on function public.create_future_meal_idempotent(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,date,uuid,integer,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.create_future_meal_idempotent(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,date,uuid,integer,uuid,timestamptz) to service_role;

alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_meal_create_key_20261006;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='future-meal-write'
    and current_setting('request.method',true)='POST'
    and current_setting('request.path',true)='/rpc/create_future_meal_idempotent' then return;end if;
  perform private.verify_scope_pre_meal_create_key_20261006();
end;
$$;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope(),private.verify_scope_pre_meal_create_key_20261006() from public,anon,authenticated,service_role;
commit;
