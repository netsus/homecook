-- Keep existing scope and measured-batch behavior while repairing legacy entries.
-- This migration changes routines only; it does not rewrite stored meal records.
begin;

do $migration$
begin
  if to_regprocedure('private.verify_full_local_internal_scope_prelaunch_20260919()') is null then
    alter function private.verify_full_local_internal_scope()
      rename to verify_full_local_internal_scope_prelaunch_20260919;
  end if;

  if to_regprocedure('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)') is null then
    alter function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)
      rename to mutate_meal_log_entry_prelaunch_20260919;
    alter function public.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)
      set schema private;
  end if;
end;
$migration$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'recipe-future-propagation'
    and v_method = 'POST'
    and v_path in (
      '/rpc/read_recipe_snapshot_ui_mode',
      '/rpc/read_recipe_snapshot_entrypoint_context'
    ) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_prelaunch_20260919();
end;
$function$;

create or replace function private.estimate_legacy_meal_log_nutrition(
  p_batch_id uuid,
  p_amount_g numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_batch public.leftover_dishes%rowtype;
  v_snapshot public.recipe_nutrition_snapshots%rowtype;
  v_base_weight_g numeric;
  v_invalid_quantity_count bigint;
begin
  select batch.* into v_batch
  from public.leftover_dishes as batch
  where batch.id = p_batch_id
    and batch.recipe_content_snapshot_id is null
    and batch.weight_status is null
    and batch.batch_status is null;

  if v_batch.id is null or coalesce(p_amount_g, 0) <= 0 then
    return private.compact_meal_log_nutrition('unavailable', '{}'::jsonb, 1);
  end if;

  select snapshot.* into v_snapshot
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.recipe_id = v_batch.recipe_id
    and snapshot.is_current
  order by snapshot.calculated_at desc, snapshot.id desc
  limit 1;

  select
    sum(case ingredient.unit when 'kg' then ingredient.amount * 1000 else ingredient.amount end),
    count(*) filter (
      where ingredient.amount is null
        or ingredient.amount <= 0
        or ingredient.unit is null
        or ingredient.unit not in ('g', 'kg')
    )
  into v_base_weight_g, v_invalid_quantity_count
  from public.recipe_ingredients as ingredient
  where ingredient.recipe_id = v_batch.recipe_id
    and ingredient.ingredient_type = 'QUANT';

  if v_snapshot.id is null
    or coalesce(v_base_weight_g, 0) <= 0
    or coalesce(v_invalid_quantity_count, 0) > 0 then
    return private.compact_meal_log_nutrition('unavailable', '{}'::jsonb, 1);
  end if;

  return private.compact_meal_log_nutrition(
    v_snapshot.calculation_status,
    v_snapshot.nutrient_status_json,
    p_amount_g / v_base_weight_g
  );
end;
$function$;

create or replace function private.fill_legacy_meal_log_nutrition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_evidence jsonb;
begin
  if new.source_type = 'cooked_batch'
    and new.actual_unit = 'g'
    and exists (
      select 1 from public.leftover_dishes as batch
      where batch.id = new.cooked_batch_id
        and batch.user_id = new.owner_user_id
        and batch.recipe_content_snapshot_id is null
        and batch.weight_status is null
        and batch.batch_status is null
    ) then
    v_evidence := private.estimate_legacy_meal_log_nutrition(
      new.cooked_batch_id,
      new.actual_amount
    );
    if v_evidence ->> 'calculation_status' <> 'unavailable' then
      new.nutrition_evidence_json := v_evidence;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.mutate_meal_log_entry(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_action text,
  p_entry_id uuid,
  p_idempotency_key uuid,
  p_expected_revision bigint,
  p_payload jsonb,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_entry public.meal_log_entries%rowtype;
  v_batch public.leftover_dishes%rowtype;
  v_column public.meal_plan_columns%rowtype;
  v_claim jsonb;
  v_receipt uuid;
  v_amount numeric;
  v_result jsonb;
begin
  if p_action is null or p_action not in ('create', 'patch', 'delete')
    or p_entry_id is null or p_idempotency_key is null or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  -- The authority check also serializes account-owned mutations by owner.
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  if p_action in ('patch', 'delete') then
    -- Include soft-deleted entries so a successful DELETE can replay its receipt.
    select entry.* into v_entry
    from public.meal_log_entries as entry
    where entry.id = p_entry_id
      and entry.owner_user_id = p_owner_uuid
      and entry.account_generation = v_generation
    for update;

    if v_entry.source_type = 'cooked_batch' then
      select batch.* into v_batch
      from public.leftover_dishes as batch
      where batch.id = v_entry.cooked_batch_id
        and batch.user_id = p_owner_uuid
        and batch.recipe_content_snapshot_id is null
        and batch.weight_status is null
        and batch.batch_status is null
      for share;
    end if;
  end if;

  -- Keep the original modern-batch, product, ingredient and creation routines.
  -- They own quantity-event reversal/replay and their existing receipt behavior.
  if v_batch.id is null then
    return private.mutate_meal_log_entry_prelaunch_20260919(
      p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
      p_hmac_key_version, p_session_issued_at, p_action, p_entry_id,
      p_idempotency_key, p_expected_revision, p_payload, p_now
    );
  end if;

  v_claim := private.claim_cooked_batch_operation(
    p_owner_uuid,
    v_generation,
    'meal_log_' || p_action,
    p_idempotency_key,
    jsonb_build_object(
      'entry_id', p_entry_id,
      'expected_revision', p_expected_revision,
      'payload', p_payload
    ),
    p_now
  );
  if v_claim ? 'replay' then return v_claim -> 'replay'; end if;
  v_receipt := (v_claim ->> 'receipt_id')::uuid;

  if v_entry.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
    or v_entry.revision is distinct from p_expected_revision then
    raise exception 'CONFLICT' using errcode = '40001';
  end if;
  -- Legacy records never own measured quantity events. Do not hide malformed data.
  if v_entry.active_consumption_event_id is not null or exists (
    select 1 from public.cooked_batch_quantity_events as event
    where event.cooked_batch_id = v_batch.id
  ) then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  if p_action = 'patch' then
    if p_payload #>> '{source,type}' is distinct from 'cooked_batch'
      or (p_payload #>> '{source,id}')::uuid is distinct from v_batch.id
      or p_payload #>> '{quantity,unit}' is distinct from 'g'
      or p_payload #>> '{quantity,amount}' is null then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    v_amount := (p_payload #>> '{quantity,amount}')::numeric;
    if v_amount <= 0 or v_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

    select column_row.* into v_column
    from public.meal_plan_columns as column_row
    where column_row.id = (p_payload ->> 'meal_plan_column_id')::uuid
      and column_row.user_id = p_owner_uuid
    for share;
    if v_column.id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_payload ->> 'consumed_local_date' is null
      or not exists (
        select 1 from pg_timezone_names
        where name = p_payload ->> 'timezone_name_snapshot'
      ) then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;
    if p_payload ->> 'consumed_at' is not null
      and (((p_payload ->> 'consumed_at')::timestamptz
        at time zone (p_payload ->> 'timezone_name_snapshot'))::date
        is distinct from (p_payload ->> 'consumed_local_date')::date) then
      raise exception 'CONSUMED_DATE_TIMEZONE_MISMATCH' using errcode = '22023';
    end if;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  if p_action = 'delete' then
    update public.meal_log_entries
    set deleted_at = p_now,
        revision = revision + 1,
        updated_at = p_now
    where id = v_entry.id
    returning * into v_entry;
  else
    -- A historical entry can be corrected after the legacy batch was marked eaten.
    -- Its batch status, unknown remaining weight and quantity ledger stay untouched.
    update public.meal_log_entries
    set consumed_at = nullif(p_payload ->> 'consumed_at', '')::timestamptz,
        consumed_local_date = (p_payload ->> 'consumed_local_date')::date,
        timezone_name_snapshot = p_payload ->> 'timezone_name_snapshot',
        meal_plan_column_id = v_column.id,
        slot_name_snapshot = v_column.name,
        actual_amount = v_amount,
        actual_unit = 'g',
        nutrition_evidence_json = private.estimate_legacy_meal_log_nutrition(
          v_batch.id, v_amount
        ),
        revision = revision + 1,
        updated_at = p_now
    where id = v_entry.id
    returning * into v_entry;
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
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

-- Keep the previous deployed web version compatible during the rollout.
create or replace function public.update_legacy_leftover_meal_log_entry(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_entry_id uuid,
  p_idempotency_key uuid,
  p_expected_revision integer,
  p_payload jsonb,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select public.mutate_meal_log_entry(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at, 'patch', p_entry_id,
    p_idempotency_key, p_expected_revision::bigint, p_payload, p_now
  );
$function$;

alter function private.verify_full_local_internal_scope_prelaunch_20260919() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
alter function private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) owner to postgres;
alter function private.estimate_legacy_meal_log_nutrition(uuid,numeric) owner to postgres;
alter function private.fill_legacy_meal_log_nutrition() owner to postgres;
alter function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) owner to postgres;
alter function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) owner to postgres;

revoke all on function private.verify_full_local_internal_scope_prelaunch_20260919() from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function private.estimate_legacy_meal_log_nutrition(uuid,numeric) from public,anon,authenticated,service_role;
revoke all on function private.fill_legacy_meal_log_nutrition() from public,anon,authenticated,service_role;
revoke all on function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) to service_role;
grant execute on function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
