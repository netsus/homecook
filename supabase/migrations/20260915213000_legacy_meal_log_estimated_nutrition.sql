-- Estimate nutrition for legacy cooked batches when every quantified recipe
-- ingredient is already expressed as mass and a current nutrition snapshot exists.

begin;

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
  where batch.id = p_batch_id;

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
      where ingredient.ingredient_type = 'QUANT'
        and (
          ingredient.amount is null
          or ingredient.amount <= 0
          or ingredient.unit not in ('g', 'kg')
        )
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
end
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
    and new.cooked_batch_id is not null
    and new.actual_unit = 'g' then
    v_evidence := private.estimate_legacy_meal_log_nutrition(
      new.cooked_batch_id,
      new.actual_amount
    );
    if v_evidence ->> 'calculation_status' <> 'unavailable' then
      new.nutrition_evidence_json := v_evidence;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists fill_legacy_meal_log_nutrition
  on public.meal_log_entries;
create trigger fill_legacy_meal_log_nutrition
before insert or update of cooked_batch_id, actual_amount, actual_unit, nutrition_evidence_json
on public.meal_log_entries
for each row execute function private.fill_legacy_meal_log_nutrition();

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
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
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
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  if p_entry_id is null or p_idempotency_key is null
    or p_payload #>> '{source,type}' <> 'cooked_batch'
    or p_payload #>> '{quantity,unit}' <> 'g'
    or (p_payload #>> '{quantity,amount}') is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_amount := (p_payload #>> '{quantity,amount}')::numeric;
  if v_amount <= 0 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select entry.* into v_entry
  from public.meal_log_entries as entry
  where entry.id = p_entry_id
    and entry.owner_user_id = p_owner_uuid
    and entry.deleted_at is null
  for update;
  if v_entry.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_entry.revision is distinct from p_expected_revision then
    raise exception 'CONFLICT' using errcode = '40001';
  end if;
  if v_entry.source_type <> 'cooked_batch'
    or v_entry.cooked_batch_id is distinct from (p_payload #>> '{source,id}')::uuid then
    return jsonb_build_object('handled', false);
  end if;

  select batch.* into v_batch
  from public.leftover_dishes as batch
  where batch.id = v_entry.cooked_batch_id
    and batch.user_id = p_owner_uuid
  for share;
  if not (
    v_batch.recipe_content_snapshot_id is null
    and v_batch.weight_status is null
    and v_batch.batch_status is null
    and v_batch.status = 'leftover'
  ) then
    return jsonb_build_object('handled', false);
  end if;

  select column_row.* into v_column
  from public.meal_plan_columns as column_row
  where column_row.id = (p_payload ->> 'meal_plan_column_id')::uuid
    and column_row.user_id = p_owner_uuid
  for share;
  if v_column.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_claim := private.claim_cooked_batch_operation(
    p_owner_uuid,
    v_generation,
    'meal_log_patch',
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

  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid,
    true
  );
  update public.meal_log_entries
  set consumed_at = nullif(p_payload ->> 'consumed_at', '')::timestamptz,
      consumed_local_date = (p_payload ->> 'consumed_local_date')::date,
      timezone_name_snapshot = p_payload ->> 'timezone_name_snapshot',
      meal_plan_column_id = v_column.id,
      slot_name_snapshot = v_column.name,
      actual_amount = v_amount,
      actual_unit = 'g',
      nutrition_evidence_json = private.estimate_legacy_meal_log_nutrition(
        v_entry.cooked_batch_id,
        v_amount
      ),
      revision = revision + 1,
      updated_at = p_now
  where id = p_entry_id
  returning * into v_entry;
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
end
$function$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
security definer
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
    and v_path in (
      '/rpc/create_legacy_leftover_meal_log_entry',
      '/rpc/update_legacy_leftover_meal_log_entry'
    ) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_legacy_leftover_meal_log();
end
$function$;

alter function private.estimate_legacy_meal_log_nutrition(uuid,numeric) owner to postgres;
alter function private.fill_legacy_meal_log_nutrition() owner to postgres;
alter function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;

revoke all on function private.estimate_legacy_meal_log_nutrition(uuid,numeric) from public,anon,authenticated,service_role;
revoke all on function private.fill_legacy_meal_log_nutrition() from public,anon,authenticated,service_role;
revoke all on function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.update_legacy_leftover_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,jsonb,timestamptz) to service_role;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;

do $backfill$
declare
  v_cutover_attempt_id uuid;
begin
  select current_cutover_attempt_id into v_cutover_attempt_id
  from public.account_generation_capability_state
  where singleton and state = 'generation_active';
  if v_cutover_attempt_id is null then return; end if;

  perform public.set_account_generation_internal_writer_marker(v_cutover_attempt_id, true);
  update public.meal_log_entries as entry
  set nutrition_evidence_json = private.estimate_legacy_meal_log_nutrition(
    entry.cooked_batch_id,
    entry.actual_amount
  )
  from public.leftover_dishes as batch
  where entry.cooked_batch_id = batch.id
    and entry.deleted_at is null
    and entry.source_type = 'cooked_batch'
    and entry.actual_unit = 'g'
    and entry.nutrition_evidence_json ->> 'calculation_status' = 'unavailable'
    and batch.recipe_content_snapshot_id is null
    and batch.weight_status is null
    and batch.batch_status is null;
  perform public.set_account_generation_internal_writer_marker(v_cutover_attempt_id, false);
end
$backfill$;

commit;
