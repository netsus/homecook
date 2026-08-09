begin;
alter table public.recipes
  add column if not exists cook_count integer not null default 0;

alter table public.leftover_dishes
  add column if not exists finished_weight_g numeric,
  add column if not exists remaining_weight_g numeric,
  add column if not exists weight_status text,
  add column if not exists batch_status text,
  add column if not exists depleted_reason text,
  add column if not exists revision bigint,
  add column if not exists event_checksum text;

do $block$
begin
  if not exists (select 1 from pg_constraint where conname = 'leftover_dishes_cooked_batch_state_check') then
    alter table public.leftover_dishes add constraint leftover_dishes_cooked_batch_state_check check (
      recipe_content_snapshot_id is null
      or (
        cooking_servings > 0 and revision > 0
        and weight_status in ('known', 'missing', 'unrecoverable')
        and batch_status in ('available', 'depleted')
        and (
          (weight_status = 'known' and finished_weight_g > 0 and remaining_weight_g between 0 and finished_weight_g)
          or (weight_status in ('missing', 'unrecoverable') and finished_weight_g is null and remaining_weight_g is null)
        )
        and (
          (batch_status = 'available' and depleted_reason is null)
          or (batch_status = 'depleted' and depleted_reason in (
            'consumed', 'discarded', 'mixed',
            'consumed_unweighed', 'discarded_unweighed', 'mixed_unweighed'
          ))
        )
      )
    ) not valid;
  end if;
end
$block$;

create table if not exists public.cooked_batch_quantity_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  cooked_batch_id uuid not null references public.leftover_dishes(id) on delete restrict,
  event_type text not null check (event_type in (
    'consumed', 'discarded', 'adjustment', 'marked_unrecoverable',
    'closed_unweighed', 'reversal'
  )),
  delta_g numeric,
  reason text,
  meal_log_entry_id uuid,
  reverses_event_id uuid references public.cooked_batch_quantity_events(id) on delete restrict,
  operation_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint cooked_batch_quantity_events_owner_operation_unique unique (owner_user_id, operation_id, ordinal),
  constraint cooked_batch_quantity_events_shape_check check (
    (event_type in ('consumed', 'discarded') and delta_g < 0 and reason is not null and reverses_event_id is null)
    or (event_type = 'adjustment' and delta_g <> 0 and reason is not null and reverses_event_id is null)
    or (event_type in ('marked_unrecoverable', 'closed_unweighed') and delta_g is null and reason is not null and reverses_event_id is null)
    or (event_type = 'reversal' and reason is not null and reverses_event_id is not null)
  )
);

create unique index if not exists cooked_batch_quantity_events_direct_reversal_unique
  on public.cooked_batch_quantity_events (reverses_event_id)
  where event_type = 'reversal';
create index if not exists cooked_batch_quantity_events_batch_order_idx
  on public.cooked_batch_quantity_events (cooked_batch_id, created_at, id);
create index if not exists cooked_batches_owner_loggable_idx
  on public.leftover_dishes (user_id, cooked_at desc, id desc)
  where weight_status = 'known' and batch_status = 'available' and remaining_weight_g > 0;
create index if not exists cooked_batches_owner_leftovers_compat_idx
  on public.leftover_dishes (user_id, batch_status, depleted_reason, cooked_at desc, id desc)
  where recipe_content_snapshot_id is not null;
create index if not exists leftover_dishes_owner_legacy_leftover_idx
  on public.leftover_dishes (user_id, cooked_at desc, id desc)
  where recipe_content_snapshot_id is null and status = 'leftover';
create index if not exists leftover_dishes_owner_legacy_eaten_idx
  on public.leftover_dishes (user_id, auto_hide_at, eaten_at desc, id desc)
  where recipe_content_snapshot_id is null and status = 'eaten';
create index if not exists cooked_batches_owner_eaten_compat_idx
  on public.leftover_dishes (user_id, auto_hide_at, eaten_at desc, id desc)
  where recipe_content_snapshot_id is not null
    and batch_status = 'depleted'
    and depleted_reason in ('consumed','consumed_unweighed');

alter table public.cooked_batch_quantity_events enable row level security;
drop policy if exists cooked_batch_quantity_events_select_own on public.cooked_batch_quantity_events;
revoke select, insert, update, delete on public.cooked_batch_quantity_events
  from anon, authenticated, service_role;
drop policy if exists leftover_dishes_insert_own on public.leftover_dishes;
revoke insert on public.leftover_dishes from anon, authenticated, service_role;
revoke update on public.leftover_dishes from authenticated, service_role;
revoke delete on public.leftover_dishes from authenticated, service_role;
revoke update (status, eaten_at, auto_hide_at, stale_reviewed_at)
  on public.leftover_dishes from authenticated;
revoke select on public.leftover_dishes from authenticated;
grant select (
  id, user_id, recipe_id, status, cooked_at, cooking_servings, eaten_at,
  auto_hide_at, created_at, stale_reviewed_at, recipe_content_snapshot_id,
  finished_weight_g, remaining_weight_g, weight_status, batch_status,
  depleted_reason, revision
) on public.leftover_dishes to authenticated;

create or replace function private.guard_cooked_batch_legacy_projection_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if old.recipe_content_snapshot_id is not null and (
    old.status is distinct from new.status
    or old.eaten_at is distinct from new.eaten_at
    or old.auto_hide_at is distinct from new.auto_hide_at
  ) then
    if current_setting('homecook.cooked_batch_writer', true)
      is distinct from old.id::text then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_cooked_batch_legacy_projection_update
  on public.leftover_dishes;
create trigger guard_cooked_batch_legacy_projection_update
before update of status, eaten_at, auto_hide_at on public.leftover_dishes
for each row execute function private.guard_cooked_batch_legacy_projection_update();

create or replace function private.cleanup_cooked_batch_before_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if exists (
    select 1 from public.cooked_batch_quantity_events
    where cooked_batch_id = old.id
  ) then
    if nullif(current_setting('homecook.account_delete_user_id', true), '')::uuid
      is distinct from old.user_id then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;

    if to_regclass('public.meal_log_entries') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'meal_log_entries'
          and column_name = 'active_consumption_event_id'
      ) then
      execute $sql$
        update public.meal_log_entries
        set active_consumption_event_id = null
        where active_consumption_event_id in (
          select id from public.cooked_batch_quantity_events
          where cooked_batch_id = $1
        )
      $sql$ using old.id;
    end if;

    delete from public.cooked_batch_quantity_events
    where cooked_batch_id = old.id;
  end if;
  return old;
end;
$function$;

drop trigger if exists cleanup_cooked_batch_before_delete
  on public.leftover_dishes;
create trigger cleanup_cooked_batch_before_delete
before delete on public.leftover_dishes
for each row execute function private.cleanup_cooked_batch_before_delete();

create or replace function private.resolve_cooked_batch_nutrition(
  p_batch_id uuid,
  p_owner_uuid uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_batch public.leftover_dishes%rowtype;
  v_content public.recipe_content_snapshots%rowtype;
  v_snapshot public.recipe_nutrition_snapshots%rowtype;
  v_value record;
  v_status text;
  v_scalable numeric;
  v_fixed numeric;
  v_expected numeric;
  v_batch_amount numeric;
  v_values jsonb := '{}'::jsonb;
  v_core_code text;
  v_core_complete integer := 0;
  v_any_available integer := 0;
  v_allowed_nutrient_codes text[] := array[
    'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg',
    'sugars_g', 'saturated_fat_g', 'fiber_g'
  ];
  v_unavailable_values jsonb := '{
    "energy_kcal":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
    "carbohydrate_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
    "protein_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
    "fat_g":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null},
    "sodium_mg":{"amount":null,"known_amount":null,"status":"unavailable","display_mode":null}
  }'::jsonb;
begin
  select batch.* into v_batch
  from public.leftover_dishes as batch
  where batch.id = p_batch_id
    and batch.user_id = p_owner_uuid;
  if v_batch.id is null then
    return null;
  end if;
  if v_batch.recipe_content_snapshot_id is null then
    return null;
  end if;
  if v_batch.cooking_servings is null or v_batch.cooking_servings <= 0 then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  select content.* into v_content
  from public.recipe_content_snapshots as content
  where content.id = v_batch.recipe_content_snapshot_id;
  if v_content.id is null
    or v_content.recipe_id is distinct from v_batch.recipe_id
    or (
      v_content.owner_user_id is not null
      and v_content.owner_user_id is distinct from p_owner_uuid
    )
  then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  if v_content.recipe_nutrition_snapshot_id is null then
    return jsonb_build_object(
      'recipe_content_snapshot_id', v_content.id,
      'recipe_nutrition_snapshot_id', null,
      'basis', jsonb_build_object(
        'amount', v_batch.cooking_servings,
        'unit', 'serving'
      ),
      'base_servings', null,
      'values', v_unavailable_values,
      'calculation_status', 'unavailable',
      'calculation_quality', null,
      'reflected_ingredient_count', 0,
      'target_ingredient_count', 0,
      'missing_reasons', '[]'::jsonb,
      'warnings', '[]'::jsonb,
      'sources', '[]'::jsonb,
      'snapshot_id', null,
      'calculated_at', null
    );
  end if;

  select snapshot.* into v_snapshot
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.id = v_content.recipe_nutrition_snapshot_id;
  if v_snapshot.id is null
    or v_snapshot.recipe_id is distinct from v_batch.recipe_id
    or v_snapshot.owner_user_id is distinct from v_content.owner_user_id
    or v_snapshot.base_servings is null
    or v_snapshot.base_servings <= 0
    or jsonb_typeof(v_snapshot.scalable_values_json) <> 'object'
    or jsonb_typeof(v_snapshot.fixed_values_json) <> 'object'
    or jsonb_typeof(v_snapshot.nutrient_status_json) <> 'object'
    or jsonb_typeof(v_snapshot.warnings_json) <> 'array'
    or jsonb_typeof(v_snapshot.sources_json) <> 'array'
  then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  foreach v_core_code in array array[
    'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
  ]
  loop
    if not (v_snapshot.nutrient_status_json ? v_core_code) then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;
  end loop;

  for v_value in
    select key, value
    from jsonb_each(v_snapshot.nutrient_status_json)
  loop
    if v_value.key <> all(v_allowed_nutrient_codes)
      or jsonb_typeof(v_value.value) <> 'object'
    then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;
    v_status := v_value.value ->> 'status';
    if v_status = 'complete' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'number'
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'null'
        or v_value.value ->> 'display_mode' <> 'total'
      then
        raise exception 'CONFLICT' using errcode = '55000';
      end if;
      v_expected := (v_value.value ->> 'amount')::numeric;
    elsif v_status = 'partial' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'number'
        or v_value.value ->> 'display_mode' <> 'minimum'
      then
        raise exception 'CONFLICT' using errcode = '55000';
      end if;
      v_expected := (v_value.value ->> 'known_amount')::numeric;
    elsif v_status = 'unavailable' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'display_mode') <> 'null'
        or v_snapshot.scalable_values_json ? v_value.key
        or v_snapshot.fixed_values_json ? v_value.key
      then
        raise exception 'CONFLICT' using errcode = '55000';
      end if;
      v_values := v_values || jsonb_build_object(v_value.key, jsonb_build_object(
        'amount', null,
        'known_amount', null,
        'status', 'unavailable',
        'display_mode', null
      ));
      continue;
    else
      raise exception 'CONFLICT' using errcode = '55000';
    end if;

    if jsonb_typeof(v_snapshot.scalable_values_json -> v_value.key) <> 'number'
      or jsonb_typeof(v_snapshot.fixed_values_json -> v_value.key) <> 'number'
    then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;
    v_scalable := (v_snapshot.scalable_values_json ->> v_value.key)::numeric;
    v_fixed := (v_snapshot.fixed_values_json ->> v_value.key)::numeric;
    if v_scalable < 0
      or v_fixed < 0
      or v_expected < 0
      or abs(v_scalable + v_fixed - v_expected) > 0.000000001
    then
      raise exception 'CONFLICT' using errcode = '55000';
    end if;

    v_batch_amount :=
      v_scalable * v_batch.cooking_servings / v_snapshot.base_servings
      + v_fixed;
    v_any_available := v_any_available + 1;
    if v_status = 'complete' then
      v_values := v_values || jsonb_build_object(v_value.key, jsonb_build_object(
        'amount', v_batch_amount,
        'known_amount', null,
        'status', 'complete',
        'display_mode', 'total'
      ));
      if v_value.key = any(array[
        'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
      ]) then
        v_core_complete := v_core_complete + 1;
      end if;
    else
      v_values := v_values || jsonb_build_object(v_value.key, jsonb_build_object(
        'amount', null,
        'known_amount', v_batch_amount,
        'status', 'partial',
        'display_mode', 'minimum'
      ));
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_object_keys(v_snapshot.scalable_values_json) as vector_key
    where not (v_snapshot.nutrient_status_json ? vector_key)
  ) or exists (
    select 1
    from jsonb_object_keys(v_snapshot.fixed_values_json) as vector_key
    where not (v_snapshot.nutrient_status_json ? vector_key)
  ) or (
    v_snapshot.calculation_status = 'complete' and v_core_complete <> 5
  ) or (
    v_snapshot.calculation_status = 'partial'
    and (v_any_available = 0 or v_core_complete = 5)
  ) or (
    v_snapshot.calculation_status = 'unavailable' and v_any_available <> 0
  ) or (
    v_snapshot.calculation_status = 'unavailable'
    and v_snapshot.calculation_quality is not null
  ) or (
    v_snapshot.calculation_status <> 'unavailable'
    and v_snapshot.calculation_quality not in ('direct', 'estimated', 'mixed')
  ) then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'recipe_content_snapshot_id', v_content.id,
    'recipe_nutrition_snapshot_id', v_snapshot.id,
    'basis', jsonb_build_object(
      'amount', v_batch.cooking_servings,
      'unit', 'serving'
    ),
    'base_servings', v_snapshot.base_servings,
    'values', v_values,
    'calculation_status', v_snapshot.calculation_status,
    'calculation_quality', v_snapshot.calculation_quality,
    'reflected_ingredient_count', v_snapshot.reflected_ingredient_count,
    'target_ingredient_count', v_snapshot.target_ingredient_count,
    'missing_reasons', to_jsonb(v_snapshot.missing_reasons),
    'warnings', v_snapshot.warnings_json,
    'sources', v_snapshot.sources_json,
    'snapshot_id', v_snapshot.id,
    'calculated_at', v_snapshot.calculated_at
  );
exception
  when sqlstate '55000' then
    raise;
  when others then
    raise exception 'CONFLICT' using errcode = '55000';
end;
$function$;

create or replace function private.project_cooked_batch(
  p_batch_id uuid,
  p_owner_uuid uuid
) returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'id', batch.id,
    'recipe_id', batch.recipe_id,
    'recipe_title', coalesce(snapshot.title, recipe.title),
    'recipe_thumbnail_url', recipe.thumbnail_url,
    'status', case
      when batch.recipe_content_snapshot_id is null then batch.status::text
      when batch.batch_status = 'depleted' and batch.depleted_reason in ('consumed', 'consumed_unweighed') then 'eaten'
      else 'leftover'
    end,
    'cooked_at', batch.cooked_at,
    'cooking_servings', batch.cooking_servings,
    'finished_weight_g', batch.finished_weight_g,
    'remaining_weight_g', batch.remaining_weight_g,
    'weight_status', batch.weight_status,
    'batch_status', batch.batch_status,
    'depleted_reason', batch.depleted_reason,
    'revision', batch.revision,
    'nutrition_calculation_status', case
      when batch.recipe_content_snapshot_id is null then null
      else coalesce(
        private.resolve_cooked_batch_nutrition(batch.id, p_owner_uuid)
          ->> 'calculation_status',
        'unavailable'
      )
    end,
    'current_unweighed_closure_event_id', (
      select event.id
      from public.cooked_batch_quantity_events as event
      where event.cooked_batch_id = batch.id
        and event.event_type = 'closed_unweighed'
        and not exists (
          select 1 from public.cooked_batch_quantity_events as reversal
          where reversal.reverses_event_id = event.id
        )
        and not exists (
          select 1 from public.cooked_batch_quantity_events as later
          where later.cooked_batch_id = batch.id
            and (later.created_at, later.id) > (event.created_at, event.id)
        )
      order by event.created_at desc, event.id desc limit 1
    )
  )
  from public.leftover_dishes as batch
  join public.recipes as recipe on recipe.id = batch.recipe_id
  left join public.recipe_content_snapshots as snapshot
    on snapshot.id = batch.recipe_content_snapshot_id
  where batch.id = p_batch_id and batch.user_id = p_owner_uuid;
$function$;

create or replace function private.claim_cooked_batch_operation(
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_scope text,
  p_idempotency_key uuid,
  p_payload jsonb,
  p_now timestamptz
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_key_hash text := encode(extensions.digest(convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'), 'hex');
  v_payload_hash text := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  v_receipt public.mutation_idempotency_keys%rowtype;
begin
  insert into public.mutation_idempotency_keys (
    owner_uuid, account_generation, operation_scope, key_hash, payload_hash,
    state, attempt_token, lease_expires_at, created_at, updated_at
  ) values (
    p_owner_uuid, p_account_generation, p_scope, v_key_hash, v_payload_hash,
    'in_progress', extensions.gen_random_uuid(), p_now + interval '5 minutes', p_now, p_now
  ) on conflict (owner_uuid, account_generation, operation_scope, key_hash)
  do nothing returning * into v_receipt;
  if v_receipt.id is not null then
    return jsonb_build_object('receipt_id', v_receipt.id, 'payload_hash', v_payload_hash);
  end if;
  select receipt.* into v_receipt from public.mutation_idempotency_keys as receipt
  where receipt.owner_uuid = p_owner_uuid
    and receipt.account_generation = p_account_generation
    and receipt.operation_scope = p_scope and receipt.key_hash = v_key_hash
  for update;
  if v_receipt.payload_hash is distinct from v_payload_hash then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
  end if;
  if v_receipt.state = 'succeeded' and v_receipt.durable_result is not null then
    return jsonb_build_object('replay', v_receipt.durable_result);
  end if;
  raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
end;
$function$;

create or replace function private.finish_cooked_batch_operation(
  p_receipt_id uuid,
  p_result jsonb,
  p_reference uuid,
  p_now timestamptz
) returns void
language sql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  update public.mutation_idempotency_keys
  set state = 'succeeded', terminal_result = 'succeeded', durable_result = p_result,
      result_reference = p_reference, attempt_token = null, lease_expires_at = null,
      updated_at = p_now
  where id = p_receipt_id;
$function$;

create or replace function private.replay_cooked_batch(
  p_batch_id uuid,
  p_owner_uuid uuid,
  p_now timestamptz
) returns void
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_batch public.leftover_dishes%rowtype;
  v_remaining numeric;
  v_marked boolean;
  v_close_reason text;
  v_consumed boolean;
  v_discarded boolean;
  v_checksum text;
begin
  select batch.* into v_batch from public.leftover_dishes as batch
  where batch.id = p_batch_id and batch.user_id = p_owner_uuid for update;
  if v_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002'; end if;

  with active as (
    select event.* from public.cooked_batch_quantity_events as event
    where event.cooked_batch_id = p_batch_id and event.event_type <> 'reversal'
      and not exists (select 1 from public.cooked_batch_quantity_events as reversal where reversal.reverses_event_id = event.id)
  )
  select
    case when v_batch.finished_weight_g is null then null
      else v_batch.finished_weight_g + coalesce(sum(delta_g) filter (where event_type in ('consumed','discarded','adjustment')), 0) end,
    coalesce(bool_or(event_type = 'marked_unrecoverable'), false),
    (array_agg(reason order by created_at desc, id desc) filter (where event_type = 'closed_unweighed'))[1],
    coalesce(bool_or(event_type = 'consumed'), false),
    coalesce(bool_or(event_type = 'discarded'), false),
    encode(extensions.digest(convert_to(coalesce(string_agg(
      id::text || ':' || event_type || ':' || coalesce(delta_g::text, '') || ':' || coalesce(reason, '') || ':' || coalesce(reverses_event_id::text, ''),
      '|' order by created_at, id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_remaining, v_marked, v_close_reason, v_consumed, v_discarded, v_checksum
  from active;

  perform set_config('homecook.cooked_batch_writer', p_batch_id::text, true);
  update public.leftover_dishes set
    remaining_weight_g = case when v_marked or v_close_reason is not null then null else v_remaining end,
    weight_status = case when v_marked then 'unrecoverable' else weight_status end,
    batch_status = case when v_close_reason is not null or v_remaining = 0 then 'depleted' else 'available' end,
    depleted_reason = case
      when v_close_reason is not null then v_close_reason || '_unweighed'
      when v_remaining = 0 and v_consumed and v_discarded then 'mixed'
      when v_remaining = 0 and v_consumed then 'consumed'
      when v_remaining = 0 and v_discarded then 'discarded'
      else null end,
    event_checksum = v_checksum,
    revision = revision + 1,
    status = (case
      when (v_close_reason = 'consumed') or (v_remaining = 0 and v_consumed and not v_discarded) then 'eaten'
      else 'leftover' end)::public.leftover_dish_status_type,
    eaten_at = case when (v_close_reason = 'consumed') or (v_remaining = 0 and v_consumed and not v_discarded) then p_now else null end,
    auto_hide_at = case when (v_close_reason = 'consumed') or (v_remaining = 0 and v_consumed and not v_discarded) then p_now + interval '30 days' else null end
  where id = p_batch_id;
  perform set_config('homecook.cooked_batch_writer', '', true);
end;
$function$;

create or replace function private.assert_cooked_batch_cached_projection(
  p_batch_id uuid,
  p_owner_uuid uuid
) returns void
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_batch public.leftover_dishes%rowtype;
  v_remaining numeric;
  v_marked boolean;
  v_close_reason text;
  v_consumed boolean;
  v_discarded boolean;
  v_checksum text;
  v_event_count bigint;
  v_set_weight_count bigint;
  v_expected_revision bigint;
  v_expected_weight_status text;
  v_expected_batch_status text;
  v_expected_depleted_reason text;
  v_expected_status public.leftover_dish_status_type;
begin
  select batch.* into v_batch
  from public.leftover_dishes as batch
  where batch.id = p_batch_id and batch.user_id = p_owner_uuid
  for update;
  if v_batch.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  with active as (
    select event.*
    from public.cooked_batch_quantity_events as event
    where event.cooked_batch_id = p_batch_id
      and event.event_type <> 'reversal'
      and not exists (
        select 1 from public.cooked_batch_quantity_events as reversal
        where reversal.reverses_event_id = event.id
      )
  )
  select
    case when v_batch.finished_weight_g is null then null
      else v_batch.finished_weight_g + coalesce(sum(delta_g)
        filter (where event_type in ('consumed','discarded','adjustment')), 0) end,
    coalesce(bool_or(event_type = 'marked_unrecoverable'), false),
    (array_agg(reason order by created_at desc, id desc)
      filter (where event_type = 'closed_unweighed'))[1],
    coalesce(bool_or(event_type = 'consumed'), false),
    coalesce(bool_or(event_type = 'discarded'), false),
    encode(extensions.digest(convert_to(coalesce(string_agg(
      id::text || ':' || event_type || ':' || coalesce(delta_g::text, '') || ':' ||
        coalesce(reason, '') || ':' || coalesce(reverses_event_id::text, ''),
      '|' order by created_at, id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_remaining, v_marked, v_close_reason, v_consumed, v_discarded, v_checksum
  from active;

  select count(*) into v_event_count
  from public.cooked_batch_quantity_events
  where cooked_batch_id = p_batch_id;
  select count(*) into v_set_weight_count
  from public.mutation_idempotency_keys as receipt
  where receipt.owner_uuid = p_owner_uuid
    and receipt.operation_scope = 'cooked_batch_set_finished_weight'
    and receipt.state = 'succeeded'
    and receipt.result_reference = p_batch_id;

  v_expected_revision := 1 + v_event_count + v_set_weight_count;
  v_expected_weight_status := case
    when v_marked then 'unrecoverable'
    when v_batch.finished_weight_g is null then 'missing'
    else 'known'
  end;
  v_expected_batch_status := case
    when v_close_reason is not null or v_remaining = 0 then 'depleted'
    else 'available'
  end;
  v_expected_depleted_reason := case
    when v_close_reason is not null then v_close_reason || '_unweighed'
    when v_remaining = 0 and v_consumed and v_discarded then 'mixed'
    when v_remaining = 0 and v_consumed then 'consumed'
    when v_remaining = 0 and v_discarded then 'discarded'
    else null
  end;
  v_expected_status := (case
    when v_close_reason = 'consumed'
      or (v_remaining = 0 and v_consumed and not v_discarded) then 'eaten'
    else 'leftover'
  end)::public.leftover_dish_status_type;

  if v_batch.remaining_weight_g is distinct from
      (case when v_marked or v_close_reason is not null then null else v_remaining end)
    or v_batch.weight_status is distinct from v_expected_weight_status
    or v_batch.batch_status is distinct from v_expected_batch_status
    or v_batch.depleted_reason is distinct from v_expected_depleted_reason
    or v_batch.status is distinct from v_expected_status
    or v_batch.revision is distinct from v_expected_revision
    or v_batch.event_checksum is distinct from v_checksum then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
end;
$function$;

create or replace function private.project_cooked_batch_progress_activity(
  p_owner_uuid uuid,
  p_event_type text,
  p_source_id uuid,
  p_now timestamptz
) returns void
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_xp_kind text;
  v_xp integer;
  v_previous_total_xp integer;
  v_previous_level integer := 1;
  v_total_xp integer;
  v_last_event_at timestamptz;
  v_event_counts jsonb;
  v_level integer := 1;
begin
  if p_owner_uuid is null or p_source_id is null or p_now is null
    or p_event_type not in ('cooking_completed', 'leftover_eaten') then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-user-progress:' || p_owner_uuid::text, 0)
  );
  select coalesce(sum(greatest(event.xp_delta, 0)), 0)::integer
  into v_previous_total_xp
  from public.user_progress_events as event
  where event.user_id = p_owner_uuid;
  while 40 * v_previous_level * v_previous_level + 60 * v_previous_level
      <= v_previous_total_xp loop
    v_previous_level := v_previous_level + 1;
  end loop;
  v_xp_kind := case when exists (
    select 1 from public.user_progress_events
    where user_id = p_owner_uuid and event_type = p_event_type
  ) then 'repeat' else 'first' end;
  v_xp := case p_event_type
    when 'cooking_completed' then case v_xp_kind when 'first' then 60 else 45 end
    else case v_xp_kind when 'first' then 15 else 8 end
  end;

  insert into public.user_progress_events(
    user_id,event_type,source_key,source_table,source_id,xp_delta,occurred_at,
    source_meta_json
  ) values(
    p_owner_uuid,p_event_type,p_event_type || ':' || p_source_id,
    'leftover_dishes',p_source_id,v_xp,p_now,
    jsonb_build_object(
      'xp_kind',v_xp_kind,
      'level_curve_version','v2',
      'previous_level',v_previous_level
    )
  ) on conflict(user_id,event_type,source_key) do nothing;

  if p_event_type = 'leftover_eaten' then
    insert into public.user_growth_activity_events(
      user_id,activity_type,category,source_key,source_table,source_id,
      source_meta_json,occurred_at
    ) values(
      p_owner_uuid,'leftover_eaten','leftovers','leftover_eaten:' || p_source_id,
      'leftover_dishes',p_source_id,'{}'::jsonb,p_now
    ) on conflict(user_id,activity_type,source_key) do nothing;
  end if;

  select
    coalesce(sum(greatest(event.xp_delta, 0)), 0)::integer,
    max(event.occurred_at),
    jsonb_build_object(
      'cooking_completed', count(*) filter (where event.event_type='cooking_completed'),
      'shopping_completed', count(*) filter (where event.event_type='shopping_completed'),
      'recipe_saved_distinct_ever', count(distinct event.source_key)
        filter (where event.event_type='recipe_saved'),
      'custom_book_created', count(*) filter (where event.event_type='custom_book_created'),
      'planner_registered_first', count(*) filter (
        where event.event_type='planner_registered'
          and coalesce(event.source_meta_json->>'xp_kind','first') <> 'repeat'),
      'planner_registered_repeat', count(*) filter (
        where event.event_type='planner_registered'
          and event.source_meta_json->>'xp_kind' = 'repeat'),
      'leftover_eaten', count(*) filter (where event.event_type='leftover_eaten')
    )
  into v_total_xp, v_last_event_at, v_event_counts
  from public.user_progress_events as event
  where event.user_id = p_owner_uuid;

  while 40 * v_level * v_level + 60 * v_level <= v_total_xp loop
    v_level := v_level + 1;
  end loop;
  insert into public.user_progress_summary(
    user_id,total_xp,current_level,level_curve_version,event_counts,
    last_event_at,last_updated_at
  ) values(
    p_owner_uuid,v_total_xp,v_level,'v2',v_event_counts,v_last_event_at,p_now
  ) on conflict(user_id) do update set
    total_xp=excluded.total_xp,
    current_level=excluded.current_level,
    level_curve_version=excluded.level_curve_version,
    event_counts=excluded.event_counts,
    last_event_at=excluded.last_event_at,
    last_updated_at=excluded.last_updated_at;
end;
$function$;

create or replace function private.canonicalize_cooked_batch_progress_award()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_xp_kind text;
begin
  if new.event_type not in ('cooking_completed','leftover_eaten')
    or coalesce((new.source_meta_json ->> 'backfill')::boolean,false) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-user-progress:' || new.user_id::text,0)
  );
  v_xp_kind := case when exists(
    select 1 from public.user_progress_events as event
    where event.user_id=new.user_id and event.event_type=new.event_type
  ) then 'repeat' else 'first' end;
  new.xp_delta := case new.event_type
    when 'cooking_completed' then case v_xp_kind when 'first' then 60 else 45 end
    else case v_xp_kind when 'first' then 15 else 8 end
  end;
  new.source_meta_json := coalesce(new.source_meta_json,'{}'::jsonb)
    || jsonb_build_object('xp_kind',v_xp_kind,'level_curve_version','v2');
  return new;
end;
$function$;

drop trigger if exists canonicalize_cooked_batch_progress_award
  on public.user_progress_events;
create trigger canonicalize_cooked_batch_progress_award
before insert on public.user_progress_events
for each row execute function private.canonicalize_cooked_batch_progress_award();

create or replace function public.list_cooked_batches(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_availability text default 'loggable',
  p_limit integer default 20,
  p_cursor_cooked_at timestamptz default null,
  p_cursor_id uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_items jsonb; v_count integer;
begin
  perform public.assert_recipe_future_session_authority(p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash, p_hmac_key_version, p_session_issued_at);
  if p_availability not in ('loggable','all') or p_limit not between 1 and 50
    or ((p_cursor_cooked_at is null) <> (p_cursor_id is null)) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  with selected as (
    select batch.id, batch.cooked_at
    from public.leftover_dishes as batch
    where batch.user_id = p_owner_uuid
      and (p_availability = 'all' or (batch.weight_status = 'known' and batch.batch_status = 'available' and batch.remaining_weight_g > 0))
      and (p_cursor_cooked_at is null or (batch.cooked_at, batch.id) < (p_cursor_cooked_at, p_cursor_id))
    order by batch.cooked_at desc, batch.id desc limit p_limit + 1
  ), page as (
    select * from selected order by cooked_at desc, id desc limit p_limit
  )
  select coalesce(jsonb_agg(private.project_cooked_batch(id, p_owner_uuid) order by cooked_at desc, id desc), '[]'::jsonb),
         (select count(*) from selected)
    into v_items, v_count from page;
  return jsonb_build_object('items', v_items, 'has_next', v_count > p_limit);
end;
$function$;

create or replace function public.mutate_legacy_leftover_status(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_leftover_id uuid,
  p_action text,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_leftover public.leftover_dishes%rowtype;
  v_cutover_attempt_id uuid;
  v_transitioned boolean;
begin
  if p_owner_uuid is null or p_leftover_id is null
    or p_action not in ('eat', 'uneat', 'keep') or p_now is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );
  v_cutover_attempt_id := (v_authority ->> 'cutover_attempt_id')::uuid;

  select leftover.* into v_leftover
  from public.leftover_dishes as leftover
  where leftover.id = p_leftover_id
  for update;
  if v_leftover.id is null then
    return jsonb_build_object('error_code', 'RESOURCE_NOT_FOUND');
  end if;
  if v_leftover.user_id is distinct from p_owner_uuid then
    return jsonb_build_object('error_code', 'FORBIDDEN');
  end if;
  if p_action in ('eat', 'uneat')
    and v_leftover.recipe_content_snapshot_id is not null then
    return jsonb_build_object('error_code', 'CONFLICT');
  end if;
  if p_action = 'keep' and v_leftover.status is distinct from 'leftover' then
    return jsonb_build_object('error_code', 'CONFLICT');
  end if;

  v_transitioned := (p_action = 'eat' and v_leftover.status <> 'eaten')
    or (p_action = 'uneat' and v_leftover.status <> 'leftover')
    or (p_action = 'keep' and v_leftover.stale_reviewed_at is distinct from p_now);
  if v_transitioned then
    perform public.set_account_generation_internal_writer_marker(
      v_cutover_attempt_id,
      true
    );

    if v_transitioned and p_action = 'eat' then
      update public.leftover_dishes
      set status = 'eaten', eaten_at = p_now, auto_hide_at = p_now + interval '30 days'
      where id = p_leftover_id
      returning * into v_leftover;
    elsif v_transitioned and p_action = 'uneat' then
      update public.leftover_dishes
      set status = 'leftover', eaten_at = null, auto_hide_at = null
      where id = p_leftover_id
      returning * into v_leftover;
    elsif v_transitioned then
      update public.leftover_dishes
      set stale_reviewed_at = p_now
      where id = p_leftover_id
      returning * into v_leftover;
    end if;

    if v_transitioned and p_action = 'eat' then
      perform private.project_cooked_batch_progress_activity(
        p_owner_uuid,
        'leftover_eaten',
        p_leftover_id,
        p_now
      );
    end if;

    perform public.set_account_generation_internal_writer_marker(
      v_cutover_attempt_id,
      false
    );
  end if;

  return jsonb_build_object(
    'id', v_leftover.id,
    'status', v_leftover.status,
    'eaten_at', v_leftover.eaten_at,
    'auto_hide_at', v_leftover.auto_hide_at,
    'stale_reviewed_at', v_leftover.stale_reviewed_at,
    'transitioned', v_transitioned
  );
end;
$function$;

create or replace function private.validate_meal_leftover_cooked_batch_authority()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_leftover public.leftover_dishes%rowtype;
begin
  if new.leftover_dish_id is null then
    return new;
  end if;

  select leftover.* into v_leftover
  from public.leftover_dishes as leftover
  where leftover.id = new.leftover_dish_id
  for update;

  if v_leftover.id is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_leftover.user_id is distinct from new.user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not new.is_leftover or v_leftover.recipe_id is distinct from new.recipe_id then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  if not (
    (
      v_leftover.recipe_content_snapshot_id is null
      and v_leftover.status = 'leftover'
    )
    or (
      v_leftover.recipe_content_snapshot_id is not null
      and v_leftover.weight_status = 'known'
      and v_leftover.batch_status = 'available'
      and v_leftover.remaining_weight_g > 0
      and v_leftover.depleted_reason is null
    )
  ) then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  return new;
end;
$function$;

drop trigger if exists meal_leftover_cooked_batch_authority on public.meals;
create trigger meal_leftover_cooked_batch_authority
before insert or update of leftover_dish_id, recipe_id, user_id, is_leftover
on public.meals
for each row execute function private.validate_meal_leftover_cooked_batch_authority();

-- Snapshot associations protect the pinned inputs while a session is active.
-- Completion legitimately advances Meal revision/status, so terminal sessions
-- retain their original audit snapshot without revalidating it as current.
create or replace function private.validate_active_cooking_session_snapshot_v2_association()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_session_id uuid;
  v_session public.cooking_sessions%rowtype;
begin
  if TG_TABLE_NAME = 'cooking_sessions' then
    v_session_id := coalesce(new.id, old.id);
  else
    v_session_id := coalesce(new.session_id, old.session_id);
  end if;

  select * into v_session
  from public.cooking_sessions
  where id = v_session_id;

  if not found
    or v_session.contract_version <> 'snapshot_v2'
    or v_session.status <> 'in_progress' then
    return coalesce(new, old);
  end if;

  if v_session.session_kind = 'planner' then
    if not exists (
      select 1 from public.cooking_session_meals
      where session_id = v_session.id
    ) then
      raise exception 'planner sessions require at least one cooking_session_meals association'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.cooking_session_meals as session_meal
      join public.meals as meal on meal.id = session_meal.meal_id
      where session_meal.session_id = v_session.id
        and (
          session_meal.recipe_id is distinct from v_session.recipe_id
          or meal.recipe_id is distinct from v_session.recipe_id
          or meal.recipe_content_snapshot_id is distinct from v_session.recipe_content_snapshot_id
          or session_meal.meal_revision_snapshot is distinct from meal.revision
        )
    ) then
      raise exception 'planner session-meal recipe/content/revision mismatch'
        using errcode = '23514';
    end if;
  elsif v_session.session_kind = 'standalone' then
    if exists (
      select 1 from public.cooking_session_meals
      where session_id = v_session.id
    ) then
      raise exception 'standalone sessions require zero cooking_session_meals associations'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists validate_cooking_session_snapshot_v2_on_session
  on public.cooking_sessions;
create constraint trigger validate_cooking_session_snapshot_v2_on_session
after insert or update on public.cooking_sessions
deferrable initially deferred
for each row
execute function private.validate_active_cooking_session_snapshot_v2_association();

drop trigger if exists validate_cooking_session_snapshot_v2_on_session_meal
  on public.cooking_session_meals;
create constraint trigger validate_cooking_session_snapshot_v2_on_session_meal
after insert or update or delete on public.cooking_session_meals
deferrable initially deferred
for each row
execute function private.validate_active_cooking_session_snapshot_v2_association();

create or replace function public.complete_snapshot_v2_cooking_session(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_session_id uuid,
  p_idempotency_key uuid,
  p_consumed_pantry_item_ids uuid[],
  p_weight_action text,
  p_finished_weight_g numeric,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb; v_session public.cooking_sessions%rowtype; v_claim jsonb;
  v_receipt uuid; v_result jsonb; v_requested integer; v_found integer; v_matching integer;
  v_recipe_id uuid; v_meal record;
  v_meals integer := 0; v_expected_meals integer := 0;
  v_claims integer := 0; v_claims_deleted integer := 0;
  v_removed integer := 0; v_cook_count integer := 0;
  v_batch_id uuid := p_session_id;
begin
  if p_idempotency_key is null or p_consumed_pantry_item_ids is null
    or p_weight_action not in ('set_finished_weight','weigh_later')
    or (p_weight_action = 'set_finished_weight' and (p_finished_weight_g is null or p_finished_weight_g <= 0))
    or (p_weight_action = 'weigh_later' and p_finished_weight_g is not null)
    or cardinality(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[])) is distinct from
      (select count(distinct id) from unnest(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[])) as ids(id)) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_authority := public.assert_recipe_future_session_authority(p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash, p_hmac_key_version, p_session_issued_at);
  select session.recipe_id into v_recipe_id
  from public.cooking_sessions as session
  where session.id = p_session_id
    and session.user_id = p_owner_uuid
    and session.contract_version = 'snapshot_v2';
  if v_recipe_id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.lock_personal_recipe_ids(array[v_recipe_id]);
  for v_meal in
    select meal.id
    from public.cooking_session_meals as session_meal
    join public.meals as meal on meal.id = session_meal.meal_id
    where session_meal.session_id = p_session_id
    order by meal.id::text collate "C"
    for update of meal
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-meal:' || v_meal.id::text, 0)
    );
  end loop;
  select session.* into v_session from public.cooking_sessions as session
  where session.id = p_session_id and session.user_id = p_owner_uuid and session.contract_version = 'snapshot_v2'
  for update;
  if v_session.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_session.recipe_id is distinct from v_recipe_id then raise exception 'CONFLICT' using errcode = '55000'; end if;
  v_claim := private.claim_cooked_batch_operation(p_owner_uuid, (v_authority->>'account_generation')::bigint,
    'snapshot_v2_complete', p_idempotency_key, jsonb_build_object(
      'session_id', p_session_id, 'consumed_pantry_item_ids', to_jsonb(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[])),
      'weight_action', p_weight_action, 'finished_weight_g', p_finished_weight_g), p_now);
  if v_claim ? 'replay' then
    return v_claim->'replay';
  end if;
  v_receipt := (v_claim->>'receipt_id')::uuid;
  if v_session.status <> 'in_progress' then raise exception 'CONFLICT' using errcode = '55000'; end if;

  select count(*) into v_expected_meals
  from (
    select session_meal.meal_id
    from public.cooking_session_meals as session_meal
    where session_meal.session_id = p_session_id
    order by session_meal.meal_id
    for update
  ) as locked_session_meals;
  if (v_session.session_kind = 'planner' and v_expected_meals = 0)
    or (v_session.session_kind = 'standalone' and v_expected_meals <> 0)
    or exists (
      select 1
      from public.cooking_session_meals as session_meal
      join public.meals as meal on meal.id = session_meal.meal_id
      where session_meal.session_id = p_session_id
        and (
          meal.user_id is distinct from p_owner_uuid
          or meal.recipe_id is distinct from v_session.recipe_id
          or meal.recipe_content_snapshot_id is distinct from v_session.recipe_content_snapshot_id
          or meal.status is distinct from 'shopping_done'
          or meal.revision is distinct from session_meal.meal_revision_snapshot
        )
  ) then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  select count(*) into v_claims
  from (
    select claim.meal_id
    from public.cooking_session_meal_claims as claim
    where claim.session_id = p_session_id
    order by claim.meal_id
    for update
  ) as locked_session_claims;
  if v_claims <> v_expected_meals or exists (
    select 1
    from public.cooking_session_meal_claims as claim
    where claim.session_id = p_session_id
      and (
        claim.owner_user_id is distinct from p_owner_uuid
        or not exists (
          select 1
          from public.cooking_session_meals as session_meal
          where session_meal.session_id = p_session_id
            and session_meal.meal_id = claim.meal_id
        )
      )
  ) then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  v_requested := cardinality(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]));
  select count(*) into v_found
  from (
    select pantry.id
    from public.pantry_items as pantry
    where pantry.user_id = p_owner_uuid
      and pantry.id = any(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]))
    order by pantry.id
    for update
  ) as locked_owner_pantry;
  if v_found <> v_requested then raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002'; end if;
  select count(*) into v_matching
  from public.pantry_items as pantry
  where pantry.id = any(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]))
    and pantry.user_id = p_owner_uuid
    and exists (
      select 1 from public.recipe_content_snapshots as snapshot
      cross join lateral jsonb_array_elements(snapshot.ingredients_json) as ingredient
      where snapshot.id = v_session.recipe_content_snapshot_id and (
        (nullif(ingredient->>'food_product_id','') is not null
          and pantry.food_product_id = (ingredient->>'food_product_id')::uuid
          and pantry.food_product_nutrition_version_id = (ingredient->>'food_product_nutrition_version_id')::uuid)
        or (nullif(ingredient->>'food_product_id','') is null and (
          pantry.ingredient_id = (ingredient->>'ingredient_id')::uuid
          or exists (select 1 from public.food_product_ingredient_links as link
            where link.product_id = pantry.food_product_id
              and link.ingredient_id = (ingredient->>'ingredient_id')::uuid
              and link.relation = 'represents' and link.review_status = 'approved'
              and link.is_primary = true and link.is_active = true)
        ))
      )
    );
  if v_matching <> v_requested then raise exception 'VALIDATION_ERROR' using errcode = '22023'; end if;

  perform public.set_account_generation_internal_writer_marker((v_authority->>'cutover_attempt_id')::uuid, true);
  insert into public.leftover_dishes (
    id, user_id, recipe_id, recipe_content_snapshot_id, status, cooked_at, cooking_servings,
    finished_weight_g, remaining_weight_g, weight_status, batch_status, depleted_reason, revision, event_checksum
  ) values (
    v_batch_id, p_owner_uuid, v_session.recipe_id, v_session.recipe_content_snapshot_id, 'leftover', p_now, v_session.cooking_servings,
    p_finished_weight_g, p_finished_weight_g,
    case when p_weight_action='set_finished_weight' then 'known' else 'missing' end,
    'available', null, 1, encode(extensions.digest(convert_to('', 'UTF8'), 'sha256'), 'hex')
  );
  delete from public.pantry_items where user_id = p_owner_uuid and id = any(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]));
  get diagnostics v_removed = row_count;
  if v_removed <> v_requested then raise exception 'CONFLICT' using errcode = '55000'; end if;
  update public.cooking_session_meals set is_cooked = true, cooked_at = p_now where session_id = p_session_id;
  update public.meals set status = 'cook_done', cooked_at = p_now, updated_at = p_now
  where status = 'shopping_done'
    and id in (select meal_id from public.cooking_session_meals where session_id = p_session_id);
  get diagnostics v_meals = row_count;
  if v_meals <> v_expected_meals then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  delete from public.cooking_session_meal_claims
  where session_id = p_session_id and owner_user_id = p_owner_uuid;
  get diagnostics v_claims_deleted = row_count;
  if v_claims_deleted <> v_expected_meals then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  update public.cooking_sessions set status = 'completed', completed_at = p_now where id = p_session_id;
  update public.recipes set cook_count = coalesce(cook_count,0)+1 where id = v_session.recipe_id returning cook_count into v_cook_count;
  perform private.project_cooked_batch_progress_activity(
    p_owner_uuid,'cooking_completed',v_batch_id,p_now
  );
  perform public.set_account_generation_internal_writer_marker((v_authority->>'cutover_attempt_id')::uuid, false);

  v_result := jsonb_build_object('success',true,'data',jsonb_build_object(
    'session_id',p_session_id,'contract_version','snapshot_v2','mode',v_session.session_kind,'status','completed',
    'cooked_batch',private.project_cooked_batch(v_batch_id,p_owner_uuid),'meals_updated',v_meals,
    'pantry_removed',v_removed,'cook_count',v_cook_count),'error',null);
  perform private.finish_cooked_batch_operation(v_receipt,v_result,v_batch_id,p_now);
  return v_result;
end;
$function$;

create or replace function private.apply_cooked_batch_event(
  p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamptz,
  p_batch_id uuid, p_idempotency_key uuid, p_expected_revision bigint,
  p_action text, p_delta_g numeric, p_reason text, p_reverses_event_id uuid,
  p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_batch public.leftover_dishes%rowtype; v_claim jsonb; v_receipt uuid;
  v_event uuid := extensions.gen_random_uuid(); v_result jsonb; v_target public.cooked_batch_quantity_events%rowtype;
begin
  if p_action in ('discarded','adjustment') and (
    p_delta_g is null or nullif(btrim(p_reason),'') is null
  ) then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  v_authority := public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  select batch.* into v_batch from public.leftover_dishes as batch
  where batch.id=p_batch_id and batch.user_id=p_owner_uuid and batch.recipe_content_snapshot_id is not null for update;
  if v_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  perform private.assert_cooked_batch_cached_projection(p_batch_id,p_owner_uuid);
  v_claim := private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,
    'cooked_batch_'||p_action,p_idempotency_key,jsonb_build_object('batch_id',p_batch_id,'expected_revision',p_expected_revision,
    'action',p_action,'delta_g',p_delta_g,'reason',p_reason,'reverses_event_id',p_reverses_event_id),p_now);
  if v_claim ? 'replay' then
    return v_claim->'replay';
  end if;
  v_receipt := (v_claim->>'receipt_id')::uuid;
  if v_batch.revision is distinct from p_expected_revision then raise exception 'CONFLICT' using errcode='40001'; end if;
  if p_action='marked_unrecoverable' then
    if v_batch.weight_status='unrecoverable' then raise exception 'WEIGHT_UNRECOVERABLE' using errcode='55000'; end if;
    if v_batch.weight_status<>'missing' or v_batch.batch_status<>'available' or exists(select 1 from public.cooked_batch_quantity_events where cooked_batch_id=p_batch_id) then raise exception 'CONFLICT' using errcode='55000'; end if;
  elsif p_action='discarded' then
    if v_batch.weight_status<>'known' or v_batch.batch_status<>'available' or p_delta_g>=0 or -p_delta_g>v_batch.remaining_weight_g then raise exception 'CONFLICT' using errcode='22003'; end if;
  elsif p_action='adjustment' then
    if v_batch.weight_status<>'known' or v_batch.batch_status<>'available' or p_delta_g=0
      or v_batch.remaining_weight_g+p_delta_g<=0 or v_batch.remaining_weight_g+p_delta_g>v_batch.finished_weight_g then raise exception 'BATCH_ADJUSTMENT_INVALID' using errcode='22003'; end if;
  elsif p_action='closed_unweighed' then
    if v_batch.weight_status not in ('missing','unrecoverable') or v_batch.batch_status<>'available' or p_reason not in ('consumed','discarded','mixed') then raise exception 'CONFLICT' using errcode='55000'; end if;
  elsif p_action='reversal' then
    select event.* into v_target from public.cooked_batch_quantity_events as event
    where event.id=p_reverses_event_id and event.cooked_batch_id=p_batch_id and event.owner_user_id=p_owner_uuid for update;
    if v_target.id is null or v_target.event_type<>'closed_unweighed' or exists(select 1 from public.cooked_batch_quantity_events where cooked_batch_id=p_batch_id and (created_at,id)>(v_target.created_at,v_target.id)) then raise exception 'CONFLICT' using errcode='55000'; end if;
  end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    true
  );
  insert into public.cooked_batch_quantity_events(id,owner_user_id,cooked_batch_id,event_type,delta_g,reason,reverses_event_id,operation_id,ordinal,payload_hash,created_at)
  values(v_event,p_owner_uuid,p_batch_id,p_action,p_delta_g,p_reason,p_reverses_event_id,p_idempotency_key,1,(v_claim->>'payload_hash'),p_now);
  perform private.replay_cooked_batch(p_batch_id,p_owner_uuid,p_now);
  if p_action = 'closed_unweighed' and p_reason = 'consumed' then
    perform private.project_cooked_batch_progress_activity(
      p_owner_uuid,'leftover_eaten',p_batch_id,p_now
    );
  end if;
  v_result:=jsonb_build_object('success',true,'data',jsonb_build_object('action',case p_action when 'marked_unrecoverable' then 'mark_unrecoverable' when 'discarded' then 'discard' when 'adjustment' then 'adjust' when 'closed_unweighed' then 'close' else 'cancel_current' end,'batch',private.project_cooked_batch(p_batch_id,p_owner_uuid),'event_id',v_event),'error',null);
  perform private.finish_cooked_batch_operation(v_receipt,v_result,v_event,p_now);
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    false
  );
  return v_result;
end;
$function$;

create or replace function public.mutate_cooked_batch_weight(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_action text,p_finished_weight_g numeric,p_expected_revision bigint,p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_batch public.leftover_dishes%rowtype; v_claim jsonb; v_receipt uuid; v_result jsonb;
begin
  if p_action='mark_unrecoverable' then return private.apply_cooked_batch_event(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_batch_id,p_idempotency_key,p_expected_revision,'marked_unrecoverable',null,'unrecoverable',null,p_now); end if;
  if p_action<>'set_finished_weight' or p_finished_weight_g is null or p_finished_weight_g<=0 then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  select batch.* into v_batch from public.leftover_dishes as batch where batch.id=p_batch_id and batch.user_id=p_owner_uuid and batch.recipe_content_snapshot_id is not null for update;
  if v_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  perform private.assert_cooked_batch_cached_projection(p_batch_id,p_owner_uuid);
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,(v_authority->>'account_generation')::bigint,'cooked_batch_set_finished_weight',p_idempotency_key,jsonb_build_object('batch_id',p_batch_id,'expected_revision',p_expected_revision,'action',p_action,'finished_weight_g',p_finished_weight_g),p_now);
  if v_claim ? 'replay' then return v_claim->'replay'; end if; v_receipt:=(v_claim->>'receipt_id')::uuid;
  if v_batch.weight_status='unrecoverable' then raise exception 'WEIGHT_UNRECOVERABLE' using errcode='55000'; end if;
  if v_batch.revision is distinct from p_expected_revision
    or v_batch.weight_status<>'missing'
    or v_batch.batch_status<>'available'
    or v_batch.event_checksum is distinct from encode(
      extensions.digest(convert_to('', 'UTF8'), 'sha256'),
      'hex'
    )
    or exists(select 1 from public.cooked_batch_quantity_events where cooked_batch_id=p_batch_id)
  then raise exception 'CONFLICT' using errcode='55000'; end if;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    true
  );
  update public.leftover_dishes set finished_weight_g=p_finished_weight_g,remaining_weight_g=p_finished_weight_g,weight_status='known',revision=revision+1 where id=p_batch_id;
  v_result:=jsonb_build_object('success',true,'data',jsonb_build_object('action','set_finished_weight','batch',private.project_cooked_batch(p_batch_id,p_owner_uuid),'event_id',null),'error',null);
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_batch_id,p_now);
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    false
  );
  return v_result;
end;
$function$;

create or replace function public.discard_cooked_batch(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_discarded_g numeric,p_reason text,p_expected_revision bigint,p_now timestamptz default clock_timestamp()
) returns jsonb
language sql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.apply_cooked_batch_event(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_batch_id,p_idempotency_key,p_expected_revision,'discarded',-p_discarded_g,p_reason,null,p_now);
$function$;

create or replace function public.adjust_cooked_batch(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_delta_g numeric,p_reason text,p_expected_revision bigint,p_now timestamptz default clock_timestamp()
) returns jsonb
language sql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.apply_cooked_batch_event(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_batch_id,p_idempotency_key,p_expected_revision,'adjustment',p_delta_g,p_reason,null,p_now);
$function$;

create or replace function public.close_unweighed_cooked_batch(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_batch_id uuid,p_idempotency_key uuid,p_action text,p_closure_reason text,p_reverses_event_id uuid,p_expected_revision bigint,p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if p_action='close' and p_closure_reason in ('consumed','discarded','mixed') and p_reverses_event_id is null then
    return private.apply_cooked_batch_event(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_batch_id,p_idempotency_key,p_expected_revision,'closed_unweighed',null,p_closure_reason,null,p_now);
  elsif p_action='cancel_current' and p_closure_reason is null and p_reverses_event_id is not null then
    return private.apply_cooked_batch_event(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_batch_id,p_idempotency_key,p_expected_revision,'reversal',null,'cancel_current',p_reverses_event_id,p_now);
  end if;
  raise exception 'VALIDATION_ERROR' using errcode='22023';
end;
$function$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  v_scope := v_headers ->> 'x-homecook-internal-scope';

  if not (
    v_method in ('GET', 'POST', 'PUT', 'DELETE')
    and (
      (
        v_scope = 'auth-flow'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/insert_auth_flow_attempt',
          '/rpc/read_auth_flow_attempt',
          '/rpc/terminal_auth_flow_attempt',
          '/rpc/expire_and_count_remote_auth_flows'
        )
      )
      or (
        v_scope in ('auth-callback', 'auth-refresh')
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/record_hybrid_remote_session_authority',
          '/rpc/record_full_local_session_authority',
          '/rpc/record_full_local_session_authority_v2',
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/bootstrap_legacy_auth_callback_identity'
        )
      )
      or (
        v_scope = 'request-authority'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/assert_hybrid_remote_session_authority',
          '/rpc/assert_full_local_session_authority',
          '/rpc/assert_and_renew_full_local_session_authority_v2'
        )
      )
      or (
        v_scope = 'session-logout'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/revoke_hybrid_remote_session_authority',
          '/rpc/revoke_full_local_session_authority'
        )
      )
      or (
        v_scope = 'account-lifecycle'
        and v_method = 'POST'
        and v_path in (
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/initiate_account_generation_delete',
          '/rpc/replay_account_generation_delete',
          '/rpc/resolve_account_cutover_quarantine',
          '/rpc/delete_user_private_data_with_generation_receipt',
          '/rpc/start_legacy_external_write_attempt',
          '/rpc/finalize_legacy_external_write_attempt',
          '/operational_events'
        )
      )
      or (
        v_scope = 'admin-data'
        and (
          (
            v_method = 'GET'
            and v_path in (
              '/admin_audit_logs',
              '/admin_members',
              '/meals',
              '/operational_events',
              '/pantry_items',
              '/recipe_books',
              '/shopping_lists',
              '/users'
            )
          )
          or (
            v_method = 'POST'
            and v_path in ('/admin_audit_logs', '/operational_events')
          )
        )
      )
      or (
        v_scope in ('not-found-feedback', 'operational-event')
        and v_method = 'POST'
        and v_path = '/rpc/record_internal_operational_event'
      )
      or (
        v_scope = 'recipe-image'
        and v_method = 'POST'
        and v_path in (
          '/rpc/cancel_recipe_image_upload',
          '/rpc/compensate_recipe_image_upload',
          '/rpc/finalize_recipe_image_upload',
          '/rpc/read_recipe_image_projections',
          '/rpc/reserve_recipe_image_upload',
          '/operational_events'
        )
      )
      or (
        v_scope = 'recipe-future-propagation'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/rpc/preview_recipe_future_plan_impact',
              '/rpc/write_personal_recipe_core',
              '/rpc/write_recipe_future_plan_change'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/ingredient_conversion_assignments',
              '/ingredient_nutrition_profiles'
            )
          )
        )
      )
      or (
        v_scope = 'snapshot-v2-session'
        and v_method = 'POST'
        and v_path in (
          '/rpc/start_snapshot_v2_cooking_session',
          '/rpc/read_snapshot_v2_cook_mode',
          '/rpc/cancel_snapshot_v2_cooking_session',
          '/rpc/complete_snapshot_v2_cooking_session',
          '/rpc/mutate_legacy_leftover_status',
          '/rpc/list_cooked_batches',
          '/rpc/mutate_cooked_batch_weight',
          '/rpc/discard_cooked_batch',
          '/rpc/adjust_cooked_batch',
          '/rpc/close_unweighed_cooked_batch'
        )
      )
      or (
        v_scope = 'future-meal-write'
        and v_method = 'POST'
        and v_path = '/rpc/write_future_meal_with_snapshot_authority'
      )
      or (
        v_scope = 'shopping-create'
        and v_method = 'POST'
        and v_path = '/rpc/create_shopping_list_with_snapshot_authority'
      )
      or (
        v_scope = 'youtube-ingredient-registration'
        and v_method = 'POST'
        and v_path = '/rpc/register_youtube_ingredient'
      )
    )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

alter function private.resolve_cooked_batch_nutrition(uuid,uuid) owner to postgres;
alter function private.project_cooked_batch(uuid,uuid) owner to postgres;
alter function private.guard_cooked_batch_legacy_projection_update() owner to postgres;
alter function private.cleanup_cooked_batch_before_delete() owner to postgres;
alter function private.claim_cooked_batch_operation(uuid,bigint,text,uuid,jsonb,timestamptz) owner to postgres;
alter function private.finish_cooked_batch_operation(uuid,jsonb,uuid,timestamptz) owner to postgres;
alter function private.replay_cooked_batch(uuid,uuid,timestamptz) owner to postgres;
alter function private.assert_cooked_batch_cached_projection(uuid,uuid) owner to postgres;
alter function private.project_cooked_batch_progress_activity(uuid,text,uuid,timestamptz) owner to postgres;
alter function private.canonicalize_cooked_batch_progress_award() owner to postgres;
alter function private.validate_meal_leftover_cooked_batch_authority() owner to postgres;
alter function private.validate_active_cooking_session_snapshot_v2_association() owner to postgres;
alter function private.apply_cooked_batch_event(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,text,numeric,text,uuid,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
alter function public.mutate_legacy_leftover_status(uuid,timestamptz,text,integer,timestamptz,uuid,text,timestamptz) owner to postgres;
alter function public.list_cooked_batches(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid) owner to postgres;
alter function public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz) owner to postgres;
alter function public.mutate_cooked_batch_weight(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,timestamptz) owner to postgres;
alter function public.discard_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) owner to postgres;
alter function public.adjust_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) owner to postgres;
alter function public.close_unweighed_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,text,uuid,bigint,timestamptz) owner to postgres;

revoke all on function private.guard_cooked_batch_legacy_projection_update()
  from public, anon, authenticated, service_role;
revoke all on function private.canonicalize_cooked_batch_progress_award()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_cooked_batch_before_delete()
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_cooked_batch_nutrition(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.project_cooked_batch(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_cooked_batch_operation(uuid,bigint,text,uuid,jsonb,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.finish_cooked_batch_operation(uuid,jsonb,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.replay_cooked_batch(uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_cooked_batch_cached_projection(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.project_cooked_batch_progress_activity(uuid,text,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.validate_meal_leftover_cooked_batch_authority()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_active_cooking_session_snapshot_v2_association()
  from public, anon, authenticated, service_role;
revoke all on function private.apply_cooked_batch_event(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,bigint,text,numeric,text,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

revoke all on function public.mutate_legacy_leftover_status(uuid,timestamptz,text,integer,timestamptz,uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.mutate_legacy_leftover_status(uuid,timestamptz,text,integer,timestamptz,uuid,text,timestamptz)
  to service_role;

revoke all on function public.list_cooked_batches(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz) from public,anon,authenticated;
revoke all on function public.mutate_cooked_batch_weight(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.discard_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.adjust_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.close_unweighed_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,text,uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.list_cooked_batches(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid) to service_role;
grant execute on function public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz) to service_role;
grant execute on function public.mutate_cooked_batch_weight(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,numeric,bigint,timestamptz) to service_role;
grant execute on function public.discard_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) to service_role;
grant execute on function public.adjust_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,numeric,text,bigint,timestamptz) to service_role;
grant execute on function public.close_unweighed_cooked_batch(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,text,text,uuid,bigint,timestamptz) to service_role;

commit;
