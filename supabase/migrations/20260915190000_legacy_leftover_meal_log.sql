begin;

create or replace function public.create_legacy_leftover_meal_log_entry(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_entry_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_batch public.leftover_dishes%rowtype;
  v_column public.meal_plan_columns%rowtype;
  v_claim jsonb;
  v_receipt uuid;
  v_entry public.meal_log_entries%rowtype;
  v_amount numeric;
  v_result jsonb;
  v_title text;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  if p_entry_id is null or p_idempotency_key is null
    or p_payload #>> '{source,type}' <> 'cooked_batch'
    or p_payload #>> '{quantity,unit}' <> 'g'
    or (p_payload #>> '{quantity,amount}') is null
  then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_amount := (p_payload #>> '{quantity,amount}')::numeric;
  if v_amount <= 0 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select batch.* into v_batch
  from public.leftover_dishes batch
  where batch.id = (p_payload #>> '{source,id}')::uuid
    and batch.user_id = p_owner_uuid
  for update of batch;
  if v_batch.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (
    v_batch.recipe_content_snapshot_id is null
    and v_batch.weight_status is null
    and v_batch.batch_status is null
    and v_batch.status = 'leftover'
  ) then
    return jsonb_build_object('handled', false);
  end if;
  select coalesce(recipe.title, '이전 요리') into v_title
  from public.recipes recipe
  where recipe.id = v_batch.recipe_id;

  select * into v_column
  from public.meal_plan_columns
  where id = (p_payload ->> 'meal_plan_column_id')::uuid
    and user_id = p_owner_uuid
  for share;
  if v_column.id is null
    or not exists (
      select 1 from pg_timezone_names
      where name = p_payload ->> 'timezone_name_snapshot'
    )
  then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_claim := private.claim_cooked_batch_operation(
    p_owner_uuid,
    v_generation,
    'meal_log_create',
    p_idempotency_key,
    jsonb_build_object(
      'entry_id', null,
      'expected_revision', null,
      'payload', p_payload
    ),
    p_now
  );
  if v_claim ? 'replay' then return v_claim -> 'replay'; end if;
  v_receipt := (v_claim ->> 'receipt_id')::uuid;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid,
    true
  );
  insert into public.meal_log_entries (
    id, owner_user_id, account_generation, consumed_at,
    consumed_local_date, timezone_name_snapshot, meal_plan_column_id,
    slot_name_snapshot, source_type, cooked_batch_id, actual_amount,
    actual_unit, display_name_snapshot, display_brand_snapshot,
    nutrition_evidence_json, created_at, updated_at
  ) values (
    p_entry_id, p_owner_uuid, v_generation,
    nullif(p_payload ->> 'consumed_at', '')::timestamptz,
    (p_payload ->> 'consumed_local_date')::date,
    p_payload ->> 'timezone_name_snapshot', v_column.id, v_column.name,
    'cooked_batch', v_batch.id, v_amount, 'g', v_title, null,
    jsonb_build_object(
      'calculation_status', 'unavailable',
      'calories_kcal', null,
      'carbohydrate_g', null,
      'protein_g', null,
      'fat_g', null,
      'sodium_mg', null
    ),
    p_now, p_now
  ) returning * into v_entry;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid,
    false
  );

  v_result := jsonb_build_object(
    'success', true,
    'data', jsonb_build_object('entry', private.project_meal_log_entry(v_entry)),
    'error', null
  );
  perform private.finish_cooked_batch_operation(v_receipt, v_result, p_entry_id, p_now);
  return v_result;
end;
$function$;

do $migration$
begin
  if to_regprocedure(
    'private.verify_full_local_internal_scope_pre_legacy_leftover_meal_log()'
  ) is null then
    alter function private.verify_full_local_internal_scope()
      rename to verify_full_local_internal_scope_pre_legacy_leftover_meal_log;
  end if;
end
$migration$;

create or replace function private.verify_full_local_internal_scope()
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'snapshot-v2-session'
    and v_method = 'POST'
    and v_path = '/rpc/create_legacy_leftover_meal_log_entry'
  then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_legacy_leftover_meal_log();
end;
$function$;

alter function public.create_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,jsonb,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope_pre_legacy_leftover_meal_log() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function public.create_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.create_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,jsonb,timestamptz) to service_role;
revoke all on function private.verify_full_local_internal_scope_pre_legacy_leftover_meal_log() from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;

commit;
