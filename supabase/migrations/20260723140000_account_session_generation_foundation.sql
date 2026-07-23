-- Additive account/session generation authority. This migration dark-ships
-- the durable state only; production remains in legacy capability mode.

begin;

create table public.user_account_generation_watermarks (
  owner_uuid uuid primary key,
  last_account_generation bigint not null check (last_account_generation > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_account_lifecycles (
  owner_uuid uuid not null,
  account_generation bigint not null check (account_generation > 0),
  auth_identity_created_at_snapshot timestamptz,
  origin text not null check (origin in (
    'runtime',
    'cutover_active',
    'cutover_recovery_approved',
    'cutover_legacy_deleted',
    'cutover_auth_without_profile_quarantined',
    'cutover_public_without_auth_quarantined',
    'cutover_personal_owner_quarantined',
    'cutover_orphan_cleanup'
  )),
  cutover_evidence_hash text,
  status text not null check (status in (
    'active',
    'quarantined',
    'deleting',
    'cleanup_pending',
    'complete'
  )),
  activated_at timestamptz,
  quarantine_reason text,
  resolved_at timestamptz,
  required_cleanup_generation bigint not null default 0
    check (required_cleanup_generation >= 0),
  completed_cleanup_generation bigint not null default 0
    check (
      completed_cleanup_generation >= 0
      and completed_cleanup_generation <= required_cleanup_generation
    ),
  personal_db_deleted_at timestamptz,
  auth_identity_deleted_at timestamptz,
  deletion_idempotency_key_hash text,
  deletion_payload_hash text,
  deletion_session_key_hash text,
  deletion_hmac_key_version integer
    check (deletion_hmac_key_version is null or deletion_hmac_key_version > 0),
  deletion_result_json jsonb,
  deletion_started_at timestamptz,
  resolution_idempotency_key_hash text,
  resolution_payload_hash text,
  resolution_session_key_hash text,
  resolution_hmac_key_version integer
    check (
      resolution_hmac_key_version is null
      or resolution_hmac_key_version > 0
    ),
  resolution_action text
    check (resolution_action is null or resolution_action in ('activate', 'delete')),
  resolution_result_json jsonb,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_uuid, account_generation),
  check (
    auth_identity_created_at_snapshot is not null
    or (
      (
        status = 'quarantined'
        and origin in (
          'cutover_public_without_auth_quarantined',
          'cutover_personal_owner_quarantined'
        )
      )
      or (
        status = 'cleanup_pending'
        and origin = 'cutover_orphan_cleanup'
      )
    )
  )
);

create unique index user_account_lifecycles_one_active_owner_idx
  on public.user_account_lifecycles (owner_uuid)
  where status = 'active';

create table public.user_session_generation_bindings (
  session_key_hash text not null,
  hmac_key_version integer not null check (hmac_key_version > 0),
  owner_uuid uuid not null,
  expected_account_generation bigint not null
    check (expected_account_generation > 0),
  auth_identity_created_at_snapshot timestamptz not null,
  bound_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (hmac_key_version, session_key_hash),
  foreign key (owner_uuid, expected_account_generation)
    references public.user_account_lifecycles (owner_uuid, account_generation)
    on delete restrict
);

create table public.account_generation_cutover_attempts (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  capability_revision bigint not null check (capability_revision > 0),
  staged_auth_count bigint check (staged_auth_count >= 0),
  staged_auth_digest text,
  staged_public_count bigint check (staged_public_count >= 0),
  staged_public_digest text,
  staged_personal_owner_count bigint check (staged_personal_owner_count >= 0),
  staged_personal_owner_digest text,
  final_auth_count bigint check (final_auth_count >= 0),
  final_auth_digest text,
  final_public_count bigint check (final_public_count >= 0),
  final_public_digest text,
  final_personal_owner_count bigint check (final_personal_owner_count >= 0),
  final_personal_owner_digest text,
  auth_barrier_type text,
  auth_barrier_evidence jsonb,
  result_json jsonb,
  error_json jsonb,
  started_at timestamptz not null default now(),
  aborted_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.account_generation_capability_state (
  singleton boolean primary key default true check (singleton),
  state text not null check (state in (
    'legacy',
    'cutover_maintenance',
    'generation_active'
  )),
  revision bigint not null check (revision > 0),
  current_cutover_attempt_id uuid
    references public.account_generation_cutover_attempts (id)
    on delete restrict,
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.account_generation_cutover_staging (
  attempt_id uuid not null
    references public.account_generation_cutover_attempts (id)
    on delete cascade,
  owner_uuid uuid not null,
  auth_identity_created_at_snapshot timestamptz,
  proposed_account_generation bigint check (proposed_account_generation > 0),
  proposed_action text not null,
  classification text not null check (classification in (
    'active_candidate',
    'legacy_deleted_confirmed',
    'incomplete_bootstrap_recovery_approved',
    'auth_without_profile_quarantined',
    'public_without_auth_quarantined',
    'personal_owner_without_identity_quarantined',
    'approved_orphan_cleanup',
    'classification_unresolved'
  )),
  evidence_type text,
  evidence_hash text,
  validation_state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, owner_uuid)
);

create table public.legacy_account_delete_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  receipt_hash text not null unique,
  owner_uuid uuid not null,
  auth_identity_created_at_snapshot timestamptz not null,
  deleted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.legacy_external_write_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid not null,
  object_path text not null,
  attempt_token_hash text not null unique,
  state text not null check (state in (
    'started',
    'finalized',
    'cleanup_pending',
    'terminal'
  )),
  deadline_at timestamptz not null,
  lease_expires_at timestamptz not null,
  finalized_at timestamptz,
  terminal_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.auth_identity_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid not null,
  account_generation bigint not null check (account_generation > 0),
  auth_identity_created_at_snapshot timestamptz not null,
  state text not null check (state in (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'dead_letter'
  )),
  terminal_result text check (terminal_result in (
    'deleted',
    'already_absent',
    'identity_replaced'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_uuid, account_generation),
  check (
    (state = 'succeeded' and terminal_result is not null)
    or (state <> 'succeeded' and terminal_result is null)
  )
);

-- An account delete must not be blocked by an immutable audit actor FK. The
-- audit row remains durable while the deleted identity is anonymized.
do $admin_audit_fk$
declare
  v_constraint_name name;
begin
  if to_regclass('public.admin_audit_logs') is null then
    return;
  end if;

  select constraint_row.conname
    into v_constraint_name
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_attribute as attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
   and attribute_row.attnum = any(constraint_row.conkey)
  where constraint_row.conrelid = 'public.admin_audit_logs'::regclass
    and constraint_row.contype = 'f'
    and attribute_row.attname = 'actor_admin_user_id'
  limit 1;

  alter table public.admin_audit_logs
    alter column actor_admin_user_id drop not null;

  if v_constraint_name is not null then
    execute format(
      'alter table public.admin_audit_logs drop constraint %I',
      v_constraint_name
    );
  end if;

  alter table public.admin_audit_logs
    add constraint admin_audit_logs_actor_admin_user_id_fkey
    foreign key (actor_admin_user_id)
    references auth.users(id)
    on delete set null;
end;
$admin_audit_fk$;

create or replace function public.protect_account_generation_watermark()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'account generation watermarks cannot be deleted'
      using errcode = '42501';
  end if;

  if new.owner_uuid is distinct from old.owner_uuid
    or new.created_at is distinct from old.created_at
    or new.last_account_generation <> old.last_account_generation + 1 then
    raise exception 'account generation watermarks must advance by exactly one'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger protect_account_generation_watermark
before update or delete on public.user_account_generation_watermarks
for each row execute function public.protect_account_generation_watermark();

create or replace function public.protect_legacy_account_delete_receipt()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'legacy account delete receipts are immutable'
    using errcode = '42501';
end;
$function$;

create trigger protect_legacy_account_delete_receipt
before update or delete on public.legacy_account_delete_receipts
for each row execute function public.protect_legacy_account_delete_receipt();

revoke all on function public.protect_account_generation_watermark() from public;
revoke all on function public.protect_account_generation_watermark()
  from anon, authenticated, service_role;
revoke all on function public.protect_legacy_account_delete_receipt() from public;
revoke all on function public.protect_legacy_account_delete_receipt()
  from anon, authenticated, service_role;

alter table public.user_account_generation_watermarks enable row level security;
alter table public.user_account_lifecycles enable row level security;
alter table public.user_session_generation_bindings enable row level security;
alter table public.account_generation_capability_state enable row level security;
alter table public.account_generation_cutover_attempts enable row level security;
alter table public.account_generation_cutover_staging enable row level security;
alter table public.legacy_account_delete_receipts enable row level security;
alter table public.legacy_external_write_attempts enable row level security;
alter table public.auth_identity_deletion_outbox enable row level security;

revoke all on table public.user_account_generation_watermarks
  from public, anon, authenticated, service_role;
revoke all on table public.user_account_lifecycles
  from public, anon, authenticated, service_role;
revoke all on table public.user_session_generation_bindings
  from public, anon, authenticated, service_role;
revoke all on table public.account_generation_capability_state
  from public, anon, authenticated, service_role;
revoke all on table public.account_generation_cutover_attempts
  from public, anon, authenticated, service_role;
revoke all on table public.account_generation_cutover_staging
  from public, anon, authenticated, service_role;
revoke all on table public.legacy_account_delete_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.legacy_external_write_attempts
  from public, anon, authenticated, service_role;
revoke all on table public.auth_identity_deletion_outbox
  from public, anon, authenticated, service_role;

insert into public.account_generation_capability_state (
  singleton,
  state,
  revision
) values (
  true,
  'legacy',
  1
);

create or replace function public.protect_account_generation_capability_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'account generation capability singleton cannot be deleted'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    raise exception 'account generation capability singleton already exists'
      using errcode = '23505';
  end if;

  if new.singleton is distinct from old.singleton
    or new.revision <> old.revision + 1 then
    raise exception 'account generation capability revision must advance by exactly one'
      using errcode = '23514';
  end if;

  if old.state = 'generation_active'
    and new.state is distinct from 'generation_active' then
    raise exception 'generation-active capability cannot return to a legacy authority'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger protect_account_generation_capability_state
before insert or update or delete on public.account_generation_capability_state
for each row execute function public.protect_account_generation_capability_state();

revoke all on function public.protect_account_generation_capability_state()
  from public, anon, authenticated, service_role;

create or replace function public.assert_legacy_account_generation_write()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_state text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation mutation guard requires READ COMMITTED'
      using errcode = '25001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_state is null or v_state <> 'legacy' then
    raise exception 'legacy account mutation authority is unavailable'
      using errcode = '55000';
  end if;
end;
$function$;

revoke execute on function public.assert_legacy_account_generation_write()
  from public, anon, authenticated, service_role;

create or replace function public.enforce_legacy_personal_mutation_fence()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_changed_columns text[];
  v_capability_state text;
  v_current_attempt_id uuid;
  v_internal_writer_txid text;
begin
  -- Public recipe view telemetry is not account-owned state.
  if tg_table_name = 'recipes' and tg_op = 'UPDATE' then
    select coalesce(array_agg(new_pair.key order by new_pair.key), '{}'::text[])
      into v_changed_columns
    from jsonb_each(v_new) as new_pair
    where (v_old -> new_pair.key) is distinct from new_pair.value;

    if v_changed_columns <@ array['view_count']::text[] then
      return new;
    end if;
  end if;

  -- Owner-neutral shared catalog rows remain outside account generation.
  if tg_table_name = 'food_products'
    and coalesce(v_new ->> 'owner_user_id', v_old ->> 'owner_user_id') is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_table_name in (
      'food_product_nutrition_versions',
      'nutrition_profiles'
    )
    and coalesce(v_new ->> 'created_by', v_old ->> 'created_by') is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select
    capability.state,
    capability.current_cutover_attempt_id
    into
      v_capability_state,
      v_current_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton;

  if v_capability_state = 'generation_active' then
    select attempt.result_json ->> '_internal_generation_writer_txid'
      into v_internal_writer_txid
    from public.account_generation_cutover_attempts as attempt
    where attempt.id = v_current_attempt_id;

    if v_internal_writer_txid is not distinct from
      pg_catalog.txid_current()::text then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  end if;

  perform public.assert_legacy_account_generation_write();
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke execute on function public.enforce_legacy_personal_mutation_fence()
  from public, anon, authenticated, service_role;

do $personal_mutation_fences$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'cooking_session_meals',
    'cooking_sessions',
    'food_product_nutrition_versions',
    'food_product_reports',
    'food_products',
    'ingredient_synonyms',
    'ingredients',
    'leftover_dishes',
    'meal_plan_columns',
    'meals',
    'nutrition_profiles',
    'pantry_items',
    'product_planner_entries',
    'recipe_book_items',
    'recipe_books',
    'recipe_ingredients',
    'recipe_likes',
    'recipe_steps',
    'recipes',
    'shopping_list_items',
    'shopping_list_recipes',
    'shopping_lists',
    'user_achievement_awards',
    'user_badge_awards',
    'user_growth_activity_events',
    'user_progress_events',
    'user_progress_notifications',
    'user_progress_summary',
    'user_quest_progress',
    'users'
  ]
  loop
    if to_regclass('public.' || v_table_name) is null then
      continue;
    end if;

    execute format(
      'create trigger account_generation_legacy_mutation_fence '
      || 'before insert or update or delete on public.%I '
      || 'for each row execute function '
      || 'public.enforce_legacy_personal_mutation_fence()',
      v_table_name
    );
  end loop;
end;
$personal_mutation_fences$;

create schema account_generation_storage_guard;
revoke all on schema account_generation_storage_guard from public;
grant usage on schema account_generation_storage_guard to authenticated;

create or replace function account_generation_storage_guard.allows_legacy_recipe_image_write()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform public.assert_legacy_account_generation_write();
  return true;
end;
$function$;

revoke execute
  on function account_generation_storage_guard.allows_legacy_recipe_image_write()
  from public, anon, service_role;
grant execute
  on function account_generation_storage_guard.allows_legacy_recipe_image_write()
  to authenticated;

do $recipe_image_storage_policies$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists recipe_images_insert_own on storage.objects;
  create policy recipe_images_insert_own
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'recipe-images'
      and (storage.foldername(name))[1] = auth.uid()::text
      and account_generation_storage_guard.allows_legacy_recipe_image_write()
    );

  drop policy if exists recipe_images_update_own on storage.objects;
  create policy recipe_images_update_own
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'recipe-images'
      and (storage.foldername(name))[1] = auth.uid()::text
      and account_generation_storage_guard.allows_legacy_recipe_image_write()
    )
    with check (
      bucket_id = 'recipe-images'
      and (storage.foldername(name))[1] = auth.uid()::text
      and account_generation_storage_guard.allows_legacy_recipe_image_write()
    );

  drop policy if exists recipe_images_delete_own on storage.objects;
  create policy recipe_images_delete_own
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'recipe-images'
      and (storage.foldername(name))[1] = auth.uid()::text
      and account_generation_storage_guard.allows_legacy_recipe_image_write()
    );
end;
$recipe_image_storage_policies$;

create or replace function public.get_account_generation_capability()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
begin
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton;

  if v_capability.state is null then
    raise exception 'account generation capability state is unavailable'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'state', v_capability.state,
    'revision', v_capability.revision,
    'current_cutover_attempt_id', v_capability.current_cutover_attempt_id,
    'activated_at', v_capability.activated_at
  );
end;
$function$;

revoke execute on function public.get_account_generation_capability()
  from public, anon, authenticated;
grant execute on function public.get_account_generation_capability()
  to service_role;

create or replace function public.delete_user_private_data_with_generation_receipt(
  p_user_id uuid,
  p_auth_identity_created_at timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_cleanup_result jsonb;
  v_deleted_at timestamptz;
  v_receipt_id uuid;
  v_receipt_salt uuid;
  v_receipt_hash text;
begin
  if p_user_id is null or p_auth_identity_created_at is null then
    raise exception 'verified legacy delete identity fields are required'
      using errcode = '22023';
  end if;

  perform public.assert_legacy_account_generation_write();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_user_id::text,
      0
    )
  );

  -- Preserve audit history without retaining direct account identifiers.
  if to_regclass('public.admin_members') is not null then
    execute 'delete from public.admin_members where user_id = $1'
      using p_user_id;
    execute 'update public.admin_members set granted_by = null where granted_by = $1'
      using p_user_id;
  end if;

  if to_regclass('public.admin_audit_logs') is not null then
    execute
      'update public.admin_audit_logs '
      || 'set actor_admin_user_id = null '
      || 'where actor_admin_user_id = $1'
      using p_user_id;
  end if;

  if to_regclass('public.operational_events') is not null then
    execute
      'update public.operational_events '
      || 'set actor_user_id = case when actor_user_id = $1 then null else actor_user_id end, '
      || 'target_user_id = case when target_user_id = $1 then null else target_user_id end, '
      || 'metadata_json = coalesce(metadata_json, ''{}''::jsonb) '
      || '  - array[''user_id'', ''owner_uuid'', ''actor_user_id'', '
      || '          ''target_user_id'', ''account_id'']::text[] '
      || 'where actor_user_id = $1 '
      || '   or target_user_id = $1 '
      || '   or metadata_json ->> ''user_id'' = $1::text '
      || '   or metadata_json ->> ''owner_uuid'' = $1::text '
      || '   or metadata_json ->> ''actor_user_id'' = $1::text '
      || '   or metadata_json ->> ''target_user_id'' = $1::text '
      || '   or metadata_json ->> ''account_id'' = $1::text'
      using p_user_id;
  end if;

  v_cleanup_result := public.delete_user_private_data(p_user_id);
  v_deleted_at := clock_timestamp();
  v_receipt_id := gen_random_uuid();
  v_receipt_salt := gen_random_uuid();
  v_receipt_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(
        p_user_id::text
        || ':'
        || p_auth_identity_created_at::text
        || ':'
        || v_deleted_at::text
        || ':'
        || v_receipt_id::text
        || ':'
        || v_receipt_salt::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.legacy_account_delete_receipts (
    receipt_id,
    receipt_hash,
    owner_uuid,
    auth_identity_created_at_snapshot,
    deleted_at
  ) values (
    v_receipt_id,
    v_receipt_hash,
    p_user_id,
    p_auth_identity_created_at,
    v_deleted_at
  );

  return v_cleanup_result;
end;
$function$;

revoke execute
  on function public.delete_user_private_data_with_generation_receipt(
    uuid,
    timestamp with time zone
  )
  from public, anon, authenticated;
grant execute
  on function public.delete_user_private_data_with_generation_receipt(
    uuid,
    timestamp with time zone
  )
  to service_role;
revoke execute on function public.delete_user_private_data(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_user_private_data(uuid)
  to service_role;

create or replace function public.begin_account_generation_cutover(
  p_attempt_id uuid,
  p_expected_capability_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_next_revision bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation cutover requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_attempt_id is null
    or p_expected_capability_revision is null
    or p_expected_capability_revision <= 0 then
    raise exception 'cutover attempt and expected revision are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  if v_capability.state = 'generation_active' then
    raise exception 'generation-active capability cannot begin another cutover'
      using errcode = '23514';
  end if;
  if v_capability.state is distinct from 'legacy'
    or v_capability.revision is distinct from p_expected_capability_revision
    or v_capability.current_cutover_attempt_id is not null then
    raise exception 'cutover capability compare-and-swap failed'
      using errcode = '40001';
  end if;

  v_next_revision := v_capability.revision + 1;
  insert into public.account_generation_cutover_attempts (
    id,
    state,
    capability_revision
  ) values (
    p_attempt_id,
    'staging',
    v_next_revision
  );

  update public.account_generation_capability_state
  set
    state = 'cutover_maintenance',
    revision = v_next_revision,
    current_cutover_attempt_id = p_attempt_id,
    activated_at = null
  where singleton;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'state', 'cutover_maintenance',
    'revision', v_next_revision
  );
end;
$function$;

create or replace function public.stage_account_generation_cutover_owner(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_proposed_account_generation bigint,
  p_proposed_action text,
  p_classification text,
  p_evidence_type text,
  p_evidence_hash text,
  p_validation_state text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_attempt_state text;
  v_expected_action text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation cutover staging requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_attempt_id is null
    or p_owner_uuid is null
    or p_expected_capability_revision is null
    or p_proposed_account_generation is null
    or p_proposed_account_generation <= 0 then
    raise exception 'cutover staging authority fields are required'
      using errcode = '22023';
  end if;

  v_expected_action := case
    when p_classification in (
      'active_candidate',
      'incomplete_bootstrap_recovery_approved'
    ) then 'activate'
    when p_classification in (
      'legacy_deleted_confirmed',
      'approved_orphan_cleanup'
    ) then 'cleanup'
    when p_classification in (
      'auth_without_profile_quarantined',
      'public_without_auth_quarantined',
      'personal_owner_without_identity_quarantined'
    ) then 'quarantine'
    when p_classification = 'classification_unresolved' then 'unresolved'
    else null
  end;

  if v_expected_action is null
    or p_proposed_action is distinct from v_expected_action
    or p_validation_state not in ('validated', 'unresolved')
    or (
      p_classification = 'classification_unresolved'
      and p_validation_state <> 'unresolved'
    )
    or (
      p_classification <> 'classification_unresolved'
      and p_validation_state <> 'validated'
    ) then
    raise exception 'cutover staging must have one classification-consistent action'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  select attempt.state
    into v_attempt_state
  from public.account_generation_cutover_attempts as attempt
  where attempt.id = p_attempt_id
  for update;

  if v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.revision is distinct from p_expected_capability_revision
    or v_capability.current_cutover_attempt_id is distinct from p_attempt_id
    or v_attempt_state is distinct from 'staging' then
    raise exception 'cutover staging compare-and-swap failed'
      using errcode = '40001';
  end if;

  insert into public.account_generation_cutover_staging (
    attempt_id,
    owner_uuid,
    auth_identity_created_at_snapshot,
    proposed_account_generation,
    proposed_action,
    classification,
    evidence_type,
    evidence_hash,
    validation_state
  ) values (
    p_attempt_id,
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_proposed_account_generation,
    p_proposed_action,
    p_classification,
    p_evidence_type,
    p_evidence_hash,
    p_validation_state
  );

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'owner_uuid', p_owner_uuid,
    'proposed_action', p_proposed_action,
    'classification', p_classification,
    'validation_state', p_validation_state
  );
end;
$function$;

create or replace function public.set_account_generation_cutover_snapshot(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_staged_auth_count bigint,
  p_staged_auth_digest text,
  p_staged_public_count bigint,
  p_staged_public_digest text,
  p_staged_personal_owner_count bigint,
  p_staged_personal_owner_digest text,
  p_auth_barrier_type text,
  p_auth_barrier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_staging_count bigint;
  v_live_auth_count bigint;
  v_live_auth_digest text;
  v_live_public_count bigint;
  v_live_public_digest text;
  v_live_personal_owner_digest text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation cutover snapshot requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_staged_auth_count is null
    or p_staged_auth_count < 0
    or nullif(p_staged_auth_digest, '') is null
    or p_staged_public_count is null
    or p_staged_public_count < 0
    or nullif(p_staged_public_digest, '') is null
    or p_staged_personal_owner_count is null
    or p_staged_personal_owner_count < 0
    or nullif(p_staged_personal_owner_digest, '') is null
    or p_auth_barrier_type not in ('auth_table_lock', 'provider_barrier')
    or p_auth_barrier_evidence is null
    or p_auth_barrier_evidence ->> 'verified' is distinct from 'true'
    or p_auth_barrier_evidence ->> 'storage_terminal'
      is distinct from 'true'
    or p_auth_barrier_evidence ->> 'owner_signal_union_zero'
      is distinct from 'true' then
    raise exception 'complete verified cutover population snapshot is required'
      using errcode = '22023';
  end if;

  if to_regclass('public.recipe_image_objects') is null
    or to_regclass('public.storage_object_deletion_outbox') is null then
    raise exception 'account generation joint activation gate is unavailable'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  select count(*)
    into v_staging_count
  from public.account_generation_cutover_staging as staging
  where staging.attempt_id = p_attempt_id;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              auth_user.id::text
                || ':'
                || to_char(
                  auth_user.created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
              E'\n'
              order by auth_user.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_auth_count, v_live_auth_digest
  from auth.users as auth_user;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(app_user.id::text, E'\n' order by app_user.id),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_public_count, v_live_public_digest
  from public.users as app_user;

  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          string_agg(staging.owner_uuid::text, E'\n' order by staging.owner_uuid),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
    into v_live_personal_owner_digest
  from public.account_generation_cutover_staging as staging
  where staging.attempt_id = p_attempt_id;

  if v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.revision is distinct from p_expected_capability_revision
    or v_capability.current_cutover_attempt_id is distinct from p_attempt_id
    or v_live_auth_count is distinct from p_staged_auth_count
    or v_live_auth_digest is distinct from p_staged_auth_digest
    or v_live_public_count is distinct from p_staged_public_count
    or v_live_public_digest is distinct from p_staged_public_digest
    or v_staging_count is distinct from p_staged_personal_owner_count
    or v_live_personal_owner_digest
      is distinct from p_staged_personal_owner_digest then
    raise exception 'cutover snapshot compare-and-swap failed'
      using errcode = '40001';
  end if;

  update public.account_generation_cutover_attempts
  set
    state = 'staged',
    staged_auth_count = p_staged_auth_count,
    staged_auth_digest = p_staged_auth_digest,
    staged_public_count = p_staged_public_count,
    staged_public_digest = p_staged_public_digest,
    staged_personal_owner_count = p_staged_personal_owner_count,
    staged_personal_owner_digest = p_staged_personal_owner_digest,
    auth_barrier_type = p_auth_barrier_type,
    auth_barrier_evidence = p_auth_barrier_evidence,
    updated_at = now()
  where id = p_attempt_id
    and state = 'staging'
    and capability_revision = p_expected_capability_revision;

  if not found then
    raise exception 'cutover attempt snapshot compare-and-swap failed'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'state', 'staged',
    'staged_personal_owner_count', p_staged_personal_owner_count
  );
end;
$function$;

create or replace function public.promote_account_generation_cutover(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_final_auth_count bigint,
  p_final_auth_digest text,
  p_final_public_count bigint,
  p_final_public_digest text,
  p_final_personal_owner_count bigint,
  p_final_personal_owner_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_attempt public.account_generation_cutover_attempts%rowtype;
  v_staging public.account_generation_cutover_staging%rowtype;
  v_origin text;
  v_status text;
  v_unresolved_count bigint;
  v_canonical_count bigint;
  v_live_auth_count bigint;
  v_live_auth_digest text;
  v_live_public_count bigint;
  v_live_public_digest text;
  v_live_personal_owner_count bigint;
  v_live_personal_owner_digest text;
  v_promoted_count bigint := 0;
  v_now timestamptz := clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation cutover promote requires READ COMMITTED'
      using errcode = '25001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  select attempt.*
    into v_attempt
  from public.account_generation_cutover_attempts as attempt
  where attempt.id = p_attempt_id
  for update;

  if v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.revision is distinct from p_expected_capability_revision
    or v_capability.current_cutover_attempt_id is distinct from p_attempt_id
    or v_attempt.state is distinct from 'staged'
    or v_attempt.capability_revision
      is distinct from p_expected_capability_revision then
    raise exception 'cutover promote compare-and-swap failed'
      using errcode = '40001';
  end if;

  if v_attempt.auth_barrier_type = 'auth_table_lock' then
    lock table auth.users in share row exclusive mode;
  elsif v_attempt.auth_barrier_type = 'provider_barrier' then
    if v_attempt.auth_barrier_evidence ->> 'verified' is distinct from 'true' then
      raise exception 'verified provider auth barrier is required'
        using errcode = '42501';
    end if;
  else
    raise exception 'authoritative auth barrier is unavailable'
      using errcode = '42501';
  end if;

  if to_regclass('public.recipe_image_objects') is null
    or to_regclass('public.storage_object_deletion_outbox') is null
    or v_attempt.auth_barrier_evidence ->> 'verified' is distinct from 'true'
    or v_attempt.auth_barrier_evidence ->> 'storage_terminal'
      is distinct from 'true'
    or v_attempt.auth_barrier_evidence ->> 'owner_signal_union_zero'
      is distinct from 'true' then
    raise exception 'account generation joint activation gate is unavailable'
      using errcode = '55000';
  end if;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              auth_user.id::text
                || ':'
                || to_char(
                  auth_user.created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
              E'\n'
              order by auth_user.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_auth_count, v_live_auth_digest
  from auth.users as auth_user;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(app_user.id::text, E'\n' order by app_user.id),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_public_count, v_live_public_digest
  from public.users as app_user;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(staging.owner_uuid::text, E'\n' order by staging.owner_uuid),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_personal_owner_count, v_live_personal_owner_digest
  from public.account_generation_cutover_staging as staging
  where staging.attempt_id = p_attempt_id;

  if v_attempt.staged_auth_count is distinct from p_final_auth_count
    or v_attempt.staged_auth_digest is distinct from p_final_auth_digest
    or v_attempt.staged_public_count is distinct from p_final_public_count
    or v_attempt.staged_public_digest is distinct from p_final_public_digest
    or v_attempt.staged_personal_owner_count
      is distinct from p_final_personal_owner_count
    or v_attempt.staged_personal_owner_digest
      is distinct from p_final_personal_owner_digest
    or v_live_auth_count is distinct from p_final_auth_count
    or v_live_auth_digest is distinct from p_final_auth_digest
    or v_live_public_count is distinct from p_final_public_count
    or v_live_public_digest is distinct from p_final_public_digest
    or v_live_personal_owner_count
      is distinct from p_final_personal_owner_count
    or v_live_personal_owner_digest
      is distinct from p_final_personal_owner_digest then
    raise exception 'authoritative cutover population digest changed'
      using errcode = '40001';
  end if;

  select count(*)
    into v_unresolved_count
  from public.account_generation_cutover_staging as staging
  where staging.attempt_id = p_attempt_id
    and (
      staging.classification = 'classification_unresolved'
      or staging.validation_state <> 'validated'
    );

  if v_unresolved_count <> 0 then
    raise exception 'cutover classification remains unresolved'
      using errcode = '55000';
  end if;

  select
    (select count(*) from public.user_account_generation_watermarks)
    + (select count(*) from public.user_account_lifecycles)
    into v_canonical_count;

  if v_canonical_count <> 0 then
    raise exception 'canonical account generation authority must be empty before promote'
      using errcode = '55000';
  end if;

  for v_staging in
    select staging.*
    from public.account_generation_cutover_staging as staging
    where staging.attempt_id = p_attempt_id
    order by staging.owner_uuid
  loop
    v_origin := case v_staging.classification
      when 'active_candidate' then 'cutover_active'
      when 'incomplete_bootstrap_recovery_approved'
        then 'cutover_recovery_approved'
      when 'legacy_deleted_confirmed' then 'cutover_legacy_deleted'
      when 'auth_without_profile_quarantined'
        then 'cutover_auth_without_profile_quarantined'
      when 'public_without_auth_quarantined'
        then 'cutover_public_without_auth_quarantined'
      when 'personal_owner_without_identity_quarantined'
        then 'cutover_personal_owner_quarantined'
      when 'approved_orphan_cleanup' then 'cutover_orphan_cleanup'
    end;
    v_status := case v_staging.proposed_action
      when 'activate' then 'active'
      when 'cleanup' then 'cleanup_pending'
      when 'quarantine' then 'quarantined'
    end;

    if v_origin is null or v_status is null then
      raise exception 'cutover staging action cannot be promoted'
        using errcode = '23514';
    end if;

    insert into public.user_account_generation_watermarks (
      owner_uuid,
      last_account_generation
    ) values (
      v_staging.owner_uuid,
      v_staging.proposed_account_generation
    );

    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      origin,
      cutover_evidence_hash,
      status,
      activated_at,
      quarantine_reason,
      required_cleanup_generation
    ) values (
      v_staging.owner_uuid,
      v_staging.proposed_account_generation,
      v_staging.auth_identity_created_at_snapshot,
      v_origin,
      v_staging.evidence_hash,
      v_status,
      case when v_status = 'active' then v_now else null end,
      case when v_status = 'quarantined'
        then v_staging.classification
        else null
      end,
      case when v_status = 'cleanup_pending' then 1 else 0 end
    );

    if v_status = 'cleanup_pending'
      and v_staging.auth_identity_created_at_snapshot is not null then
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state
      ) values (
        v_staging.owner_uuid,
        v_staging.proposed_account_generation,
        v_staging.auth_identity_created_at_snapshot,
        'pending'
      );
    end if;

    v_promoted_count := v_promoted_count + 1;
  end loop;

  update public.account_generation_cutover_attempts
  set
    state = 'promoted',
    final_auth_count = p_final_auth_count,
    final_auth_digest = p_final_auth_digest,
    final_public_count = p_final_public_count,
    final_public_digest = p_final_public_digest,
    final_personal_owner_count = p_final_personal_owner_count,
    final_personal_owner_digest = p_final_personal_owner_digest,
    result_json = jsonb_build_object(
      'promoted_owner_count', v_promoted_count,
      'capability_revision', p_expected_capability_revision + 1
    ),
    promoted_at = v_now,
    updated_at = v_now
  where id = p_attempt_id;

  update public.account_generation_capability_state
  set
    state = 'generation_active',
    revision = revision + 1,
    activated_at = v_now
  where singleton;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'state', 'generation_active',
    'revision', p_expected_capability_revision + 1,
    'promoted_owner_count', v_promoted_count
  );
end;
$function$;

create or replace function public.abort_account_generation_cutover(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_canonical_count bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation cutover abort requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if nullif(p_reason, '') is null then
    raise exception 'cutover abort reason is required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  if v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.revision is distinct from p_expected_capability_revision
    or v_capability.current_cutover_attempt_id is distinct from p_attempt_id then
    raise exception 'cutover abort compare-and-swap failed'
      using errcode = '40001';
  end if;

  select
    (select count(*) from public.user_account_generation_watermarks)
    + (select count(*) from public.user_account_lifecycles)
    into v_canonical_count;
  if v_canonical_count <> 0 then
    raise exception 'cutover with canonical authority cannot be aborted'
      using errcode = '23514';
  end if;

  delete from public.account_generation_cutover_staging
  where attempt_id = p_attempt_id;
  delete from public.legacy_external_write_attempts;

  update public.account_generation_cutover_attempts
  set
    state = 'aborted',
    error_json = jsonb_build_object('reason', p_reason),
    aborted_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = p_attempt_id
    and state in ('staging', 'staged');
  if not found then
    raise exception 'cutover attempt cannot be aborted'
      using errcode = '40001';
  end if;

  update public.account_generation_capability_state
  set
    state = 'legacy',
    revision = revision + 1,
    current_cutover_attempt_id = null,
    activated_at = null
  where singleton;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'state', 'legacy',
    'revision', p_expected_capability_revision + 1
  );
end;
$function$;

revoke execute
  on function public.begin_account_generation_cutover(uuid, bigint)
  from public, anon, authenticated;
revoke execute
  on function public.stage_account_generation_cutover_owner(
    uuid,
    bigint,
    uuid,
    timestamp with time zone,
    bigint,
    text,
    text,
    text,
    text,
    text
  )
  from public, anon, authenticated;
revoke execute
  on function public.set_account_generation_cutover_snapshot(
    uuid,
    bigint,
    bigint,
    text,
    bigint,
    text,
    bigint,
    text,
    text,
    jsonb
  )
  from public, anon, authenticated;
revoke execute
  on function public.promote_account_generation_cutover(
    uuid,
    bigint,
    bigint,
    text,
    bigint,
    text,
    bigint,
    text
  )
  from public, anon, authenticated;
revoke execute
  on function public.abort_account_generation_cutover(uuid, bigint, text)
  from public, anon, authenticated;
grant execute
  on function public.begin_account_generation_cutover(uuid, bigint)
  to service_role;
grant execute
  on function public.stage_account_generation_cutover_owner(
    uuid,
    bigint,
    uuid,
    timestamp with time zone,
    bigint,
    text,
    text,
    text,
    text,
    text
  )
  to service_role;
grant execute
  on function public.set_account_generation_cutover_snapshot(
    uuid,
    bigint,
    bigint,
    text,
    bigint,
    text,
    bigint,
    text,
    text,
    jsonb
  )
  to service_role;
grant execute
  on function public.promote_account_generation_cutover(
    uuid,
    bigint,
    bigint,
    text,
    bigint,
    text,
    bigint,
    text
  )
  to service_role;
grant execute
  on function public.abort_account_generation_cutover(uuid, bigint, text)
  to service_role;

create or replace function public.start_legacy_external_write_attempt(
  p_owner_uuid uuid,
  p_object_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_attempt_token uuid;
  v_attempt_token_hash text;
  v_now timestamptz;
  v_deadline timestamptz;
  v_attempt_id uuid;
begin
  if p_owner_uuid is null
    or nullif(pg_catalog.btrim(p_object_path), '') is null then
    raise exception 'external write owner and object path are required'
      using errcode = '22023';
  end if;

  perform public.assert_legacy_account_generation_write();

  v_attempt_token := gen_random_uuid();
  v_attempt_token_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(v_attempt_token::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_now := clock_timestamp();
  v_deadline := v_now + interval '120 seconds';

  insert into public.legacy_external_write_attempts (
    owner_uuid,
    object_path,
    attempt_token_hash,
    state,
    deadline_at,
    lease_expires_at,
    created_at,
    updated_at
  ) values (
    p_owner_uuid,
    p_object_path,
    v_attempt_token_hash,
    'started',
    v_deadline,
    v_deadline,
    v_now,
    v_now
  )
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'attempt_token', v_attempt_token,
    'state', 'started',
    'deadline_at', v_deadline,
    'lease_expires_at', v_deadline
  );
end;
$function$;

create or replace function public.finalize_legacy_external_write_attempt(
  p_attempt_token uuid,
  p_outcome text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_attempt_token_hash text;
  v_capability_state text;
  v_attempt public.legacy_external_write_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_state text;
begin
  if p_attempt_token is null
    or p_outcome not in ('succeeded', 'failed') then
    raise exception 'external write token and outcome are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  v_attempt_token_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_attempt_token::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select attempt.*
    into v_attempt
  from public.legacy_external_write_attempts as attempt
  where attempt.attempt_token_hash = v_attempt_token_hash
  for update;

  if v_attempt.id is null then
    raise exception 'external write attempt token is unknown'
      using errcode = 'P0002';
  end if;
  if v_attempt.state in ('finalized', 'cleanup_pending', 'terminal') then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_token', p_attempt_token,
      'state', v_attempt.state,
      'deadline_at', v_attempt.deadline_at
    );
  end if;

  v_next_state := case
    when p_outcome = 'succeeded'
      and v_capability_state = 'legacy'
      and v_now <= v_attempt.deadline_at
      then 'finalized'
    else 'cleanup_pending'
  end;

  update public.legacy_external_write_attempts
  set
    state = v_next_state,
    finalized_at = case when v_next_state = 'finalized' then v_now else null end,
    last_error = case
      when p_outcome = 'failed' then 'external_write_failed'
      when v_capability_state <> 'legacy' then 'capability_changed_before_attach'
      when v_now > v_attempt.deadline_at then 'external_write_deadline_expired'
      else null
    end,
    updated_at = v_now
  where id = v_attempt.id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_token', p_attempt_token,
    'state', v_next_state,
    'deadline_at', v_attempt.deadline_at
  );
end;
$function$;

create or replace function public.cleanup_legacy_external_write_attempt(
  p_attempt_token uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_attempt_token_hash text;
  v_attempt public.legacy_external_write_attempts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_attempt_token is null or nullif(p_reason, '') is null then
    raise exception 'external cleanup token and reason are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  v_attempt_token_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_attempt_token::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select attempt.*
    into v_attempt
  from public.legacy_external_write_attempts as attempt
  where attempt.attempt_token_hash = v_attempt_token_hash
  for update;

  if v_attempt.id is null then
    raise exception 'external write attempt token is unknown'
      using errcode = 'P0002';
  end if;
  if v_attempt.state = 'finalized' then
    raise exception 'attached external write cannot enter cleanup'
      using errcode = '55000';
  end if;
  if v_attempt.state = 'terminal' then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'attempt_token', p_attempt_token,
      'state', 'terminal',
      'terminal_at', v_attempt.terminal_at
    );
  end if;

  update public.legacy_external_write_attempts
  set
    state = 'terminal',
    terminal_at = v_now,
    last_error = p_reason,
    updated_at = v_now
  where id = v_attempt.id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_token', p_attempt_token,
    'state', 'terminal',
    'terminal_at', v_now
  );
end;
$function$;

revoke execute
  on function public.start_legacy_external_write_attempt(uuid, text)
  from public, anon, authenticated;
revoke execute
  on function public.finalize_legacy_external_write_attempt(uuid, text)
  from public, anon, authenticated;
revoke execute
  on function public.cleanup_legacy_external_write_attempt(uuid, text)
  from public, anon, authenticated;
grant execute
  on function public.start_legacy_external_write_attempt(uuid, text)
  to service_role;
grant execute
  on function public.finalize_legacy_external_write_attempt(uuid, text)
  to service_role;
grant execute
  on function public.cleanup_legacy_external_write_attempt(uuid, text)
  to service_role;

-- F0 installs the auth identity consumer state machine but deliberately grants
-- no runtime principal. #3 may grant the exact scheduler principal only after
-- Storage terminal and owner-signal union-zero checks exist.
create or replace function public.claim_auth_identity_deletion_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_now timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_outbox public.auth_identity_deletion_outbox%rowtype;
begin
  if p_outbox_id is null or p_lease_token is null or p_now is null then
    raise exception 'auth deletion claim CAS fields are required'
      using errcode = '22023';
  end if;

  select outbox.*
    into v_outbox
  from public.auth_identity_deletion_outbox as outbox
  where outbox.id = p_outbox_id
  for update;

  if v_outbox.id is null
    or not (
      (
        v_outbox.state in ('pending', 'failed')
        and v_outbox.next_attempt_at <= p_now
      )
      or (
        v_outbox.state = 'processing'
        and v_outbox.lease_expires_at <= p_now
      )
    ) then
    raise exception 'auth deletion outbox claim compare-and-swap failed'
      using errcode = '40001';
  end if;

  update public.auth_identity_deletion_outbox
  set
    state = 'processing',
    attempts = attempts + 1,
    lease_token = p_lease_token,
    lease_expires_at = p_now + interval '120 seconds',
    updated_at = p_now
  where id = p_outbox_id
  returning * into v_outbox;

  return jsonb_build_object(
    'id', v_outbox.id,
    'owner_uuid', v_outbox.owner_uuid,
    'account_generation', v_outbox.account_generation,
    'auth_identity_created_at_snapshot',
      v_outbox.auth_identity_created_at_snapshot,
    'state', v_outbox.state,
    'attempts', v_outbox.attempts,
    'lease_token', v_outbox.lease_token,
    'lease_expires_at', v_outbox.lease_expires_at
  );
end;
$function$;

create or replace function public.finalize_auth_identity_deletion_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_expected_attempts integer,
  p_terminal_result text,
  p_error text,
  p_now timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_outbox public.auth_identity_deletion_outbox%rowtype;
  v_next_state text;
begin
  if p_outbox_id is null
    or p_lease_token is null
    or p_expected_attempts is null
    or p_expected_attempts <= 0
    or p_now is null
    or (
      p_terminal_result is null
      and nullif(p_error, '') is null
    )
    or (
      p_terminal_result is not null
      and p_terminal_result not in (
        'deleted',
        'already_absent',
        'identity_replaced'
      )
    ) then
    raise exception 'auth deletion finalize CAS fields are invalid'
      using errcode = '22023';
  end if;

  select outbox.*
    into v_outbox
  from public.auth_identity_deletion_outbox as outbox
  where outbox.id = p_outbox_id
  for update;

  if v_outbox.id is null
    or v_outbox.state <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or v_outbox.attempts is distinct from p_expected_attempts
    or v_outbox.lease_expires_at < p_now then
    raise exception 'auth deletion outbox finalize compare-and-swap failed'
      using errcode = '40001';
  end if;

  v_next_state := case
    when p_terminal_result is not null then 'succeeded'
    when v_outbox.attempts >= 10 then 'dead_letter'
    else 'failed'
  end;

  update public.auth_identity_deletion_outbox
  set
    state = v_next_state,
    terminal_result = p_terminal_result,
    lease_token = null,
    lease_expires_at = null,
    next_attempt_at = case
      when v_next_state = 'failed' then p_now + interval '5 minutes'
      else next_attempt_at
    end,
    last_error = p_error,
    updated_at = p_now
  where id = p_outbox_id
  returning * into v_outbox;

  return jsonb_build_object(
    'id', v_outbox.id,
    'state', v_outbox.state,
    'terminal_result', v_outbox.terminal_result,
    'attempts', v_outbox.attempts,
    'next_attempt_at', v_outbox.next_attempt_at
  );
end;
$function$;

revoke execute
  on function public.claim_auth_identity_deletion_outbox(
    uuid,
    uuid,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
revoke execute
  on function public.finalize_auth_identity_deletion_outbox(
    uuid,
    uuid,
    integer,
    text,
    text,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;

create or replace function public.bind_user_session_generation(
  p_owner_uuid uuid,
  p_expected_account_generation bigint,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_auth_identity_created_at_snapshot timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'session generation binding requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_expected_account_generation is null
    or p_expected_account_generation <= 0
    or p_session_key_hash is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_auth_identity_created_at_snapshot is null then
    raise exception 'verified session generation binding fields are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'generation session binding is not active'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
    and lifecycle.account_generation = p_expected_account_generation
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status <> 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'account generation lifecycle does not match the verified identity'
      using errcode = '55000';
  end if;

  insert into public.user_session_generation_bindings (
    session_key_hash,
    hmac_key_version,
    owner_uuid,
    expected_account_generation,
    auth_identity_created_at_snapshot
  ) values (
    p_session_key_hash,
    p_hmac_key_version,
    p_owner_uuid,
    p_expected_account_generation,
    p_auth_identity_created_at_snapshot
  )
  on conflict (hmac_key_version, session_key_hash) do nothing;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for update;

  if v_binding.owner_uuid is distinct from p_owner_uuid
    or v_binding.expected_account_generation
      is distinct from p_expected_account_generation
    or v_binding.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot
    or v_binding.revoked_at is not null then
    raise exception 'session generation binding conflicts with durable authority'
      using errcode = '23505';
  end if;

  return jsonb_build_object(
    'owner_uuid', v_binding.owner_uuid,
    'expected_account_generation', v_binding.expected_account_generation,
    'hmac_key_version', v_binding.hmac_key_version,
    'auth_identity_created_at_snapshot',
      v_binding.auth_identity_created_at_snapshot,
    'bound_at', v_binding.bound_at,
    'revoked_at', v_binding.revoked_at
  );
end;
$function$;

create or replace function public.revoke_user_session_generation_binding(
  p_owner_uuid uuid,
  p_expected_account_generation bigint,
  p_session_key_hash text,
  p_hmac_key_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_binding public.user_session_generation_bindings%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'session generation revocation requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_expected_account_generation is null
    or p_expected_account_generation <= 0
    or p_session_key_hash is null
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0 then
    raise exception 'verified session generation revocation fields are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'generation session revocation is not active'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  update public.user_session_generation_bindings
  set revoked_at = coalesce(revoked_at, now())
  where owner_uuid = p_owner_uuid
    and expected_account_generation = p_expected_account_generation
    and session_key_hash = p_session_key_hash
    and hmac_key_version = p_hmac_key_version
  returning * into v_binding;

  if v_binding.owner_uuid is null then
    raise exception 'session generation binding was not found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'owner_uuid', v_binding.owner_uuid,
    'expected_account_generation', v_binding.expected_account_generation,
    'hmac_key_version', v_binding.hmac_key_version,
    'revoked_at', v_binding.revoked_at
  );
end;
$function$;

revoke execute
  on function public.bind_user_session_generation(
    uuid,
    bigint,
    text,
    integer,
    timestamp with time zone
  )
  from public, anon, authenticated;
revoke execute
  on function public.revoke_user_session_generation_binding(
    uuid,
    bigint,
    text,
    integer
  )
  from public, anon, authenticated;
grant execute
  on function public.bind_user_session_generation(
    uuid,
    bigint,
    text,
    integer,
    timestamp with time zone
  )
  to service_role;
grant execute
  on function public.revoke_user_session_generation_binding(
    uuid,
    bigint,
    text,
    integer
  )
  to service_role;

create or replace function public.set_account_generation_internal_writer_marker(
  p_cutover_attempt_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_existing_txid text;
  v_current_txid text := pg_catalog.txid_current()::text;
begin
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id
      is distinct from p_cutover_attempt_id then
    raise exception 'generation writer capability marker is unavailable'
      using errcode = '55000';
  end if;

  select attempt.result_json ->> '_internal_generation_writer_txid'
    into v_existing_txid
  from public.account_generation_cutover_attempts as attempt
  where attempt.id = p_cutover_attempt_id
  for update;

  if p_enabled then
    if v_existing_txid is not null
      and v_existing_txid is distinct from v_current_txid then
      raise exception 'generation writer marker is held by another transaction'
        using errcode = '40001';
    end if;

    update public.account_generation_cutover_attempts
    set result_json = jsonb_set(
      coalesce(result_json, '{}'::jsonb),
      '{_internal_generation_writer_txid}',
      to_jsonb(v_current_txid),
      true
    )
    where id = p_cutover_attempt_id;
  else
    if v_existing_txid is distinct from v_current_txid then
      raise exception 'generation writer marker compare-and-swap failed'
        using errcode = '40001';
    end if;

    update public.account_generation_cutover_attempts
    set result_json = coalesce(result_json, '{}'::jsonb)
      - '_internal_generation_writer_txid'
    where id = p_cutover_attempt_id;
  end if;
end;
$function$;

revoke execute
  on function public.set_account_generation_internal_writer_marker(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.initiate_account_generation_delete(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_key_hash text;
  v_result jsonb := jsonb_build_object(
    'deletion_status',
    'cleanup_pending'
  );
  v_now timestamptz := clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation delete requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'verified generation delete authority fields are required'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_lifecycle.deletion_idempotency_key_hash is not null then
    if v_lifecycle.deletion_idempotency_key_hash = v_key_hash then
      if v_lifecycle.deletion_payload_hash is distinct from p_payload_hash
        or v_lifecycle.deletion_session_key_hash
          is distinct from p_session_key_hash
        or v_lifecycle.deletion_hmac_key_version
          is distinct from p_hmac_key_version then
        raise exception 'IDEMPOTENCY_KEY_REUSED'
          using errcode = '23505';
      end if;
      return v_lifecycle.deletion_result_json;
    end if;
  end if;

  if v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  elsif v_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status in ('cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_lifecycle.status <> 'active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.owner_uuid = p_owner_uuid
    and binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
  for update;

  if v_binding.owner_uuid is null
    or v_binding.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot
    or v_binding.revoked_at is not null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
  if v_binding.expected_account_generation
    is distinct from v_lifecycle.account_generation then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    true
  );

  update public.user_account_lifecycles
  set
    status = 'deleting',
    deletion_idempotency_key_hash = v_key_hash,
    deletion_payload_hash = p_payload_hash,
    deletion_session_key_hash = p_session_key_hash,
    deletion_hmac_key_version = p_hmac_key_version,
    deletion_started_at = v_now,
    revision = revision + 1,
    updated_at = v_now
  where owner_uuid = p_owner_uuid
    and account_generation = v_lifecycle.account_generation;

  update public.user_session_generation_bindings
  set revoked_at = coalesce(revoked_at, v_now)
  where owner_uuid = p_owner_uuid
    and expected_account_generation = v_lifecycle.account_generation;

  perform public.delete_user_private_data(p_owner_uuid);

  insert into public.auth_identity_deletion_outbox (
    owner_uuid,
    account_generation,
    auth_identity_created_at_snapshot,
    state
  ) values (
    p_owner_uuid,
    v_lifecycle.account_generation,
    p_auth_identity_created_at_snapshot,
    'pending'
  )
  on conflict (owner_uuid, account_generation) do nothing;

  update public.user_account_lifecycles
  set
    status = 'cleanup_pending',
    personal_db_deleted_at = v_now,
    deletion_result_json = v_result,
    revision = revision + 1,
    updated_at = v_now
  where owner_uuid = p_owner_uuid
    and account_generation = v_lifecycle.account_generation;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    false
  );
  return v_result;
end;
$function$;

create or replace function public.replay_account_generation_delete(
  p_owner_uuid uuid,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_key_hash text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation delete replay requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'verified generation delete replay fields are required'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for key share;

  if v_lifecycle.owner_uuid is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;
  if v_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status not in ('cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;
  if v_lifecycle.deletion_idempotency_key_hash is null
    or v_lifecycle.deletion_result_json is null then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  end if;
  if v_lifecycle.deletion_idempotency_key_hash is distinct from v_key_hash then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  end if;
  if v_lifecycle.deletion_payload_hash is distinct from p_payload_hash then
    raise exception 'IDEMPOTENCY_KEY_REUSED'
      using errcode = '23505';
  end if;
  if v_lifecycle.deletion_session_key_hash
      is distinct from p_session_key_hash
    or v_lifecycle.deletion_hmac_key_version
      is distinct from p_hmac_key_version then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for key share;

  if v_binding.owner_uuid is null
    or v_binding.owner_uuid is distinct from p_owner_uuid
    or v_binding.expected_account_generation
      is distinct from v_lifecycle.account_generation
    or v_binding.auth_identity_created_at_snapshot
      is distinct from v_lifecycle.auth_identity_created_at_snapshot
    or v_binding.revoked_at is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  return v_lifecycle.deletion_result_json;
end;
$function$;

create or replace function public.resolve_account_cutover_quarantine(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_action text,
  p_nickname text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_auth_user jsonb;
  v_provider text;
  v_social_id text;
  v_email text;
  v_key_hash text;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account quarantine resolution requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_action not in ('activate', 'delete')
    or (
      p_action = 'activate'
      and (
        nullif(pg_catalog.btrim(p_nickname), '') is null
        or pg_catalog.char_length(p_nickname) > 30
      )
    ) then
    raise exception 'verified quarantine resolution fields are required'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_lifecycle.resolution_idempotency_key_hash is not null then
    if v_lifecycle.resolution_idempotency_key_hash = v_key_hash then
      if v_lifecycle.resolution_payload_hash is distinct from p_payload_hash
        or v_lifecycle.resolution_session_key_hash
          is distinct from p_session_key_hash
        or v_lifecycle.resolution_hmac_key_version
          is distinct from p_hmac_key_version
        or v_lifecycle.resolution_action is distinct from p_action then
        raise exception 'IDEMPOTENCY_KEY_REUSED'
          using errcode = '23505';
      end if;
      return v_lifecycle.resolution_result_json;
    end if;
  end if;

  if v_lifecycle.status = 'active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  elsif v_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status in ('cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_lifecycle.status <> 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  select to_jsonb(auth_user)
    into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
    and auth_user.created_at = p_auth_identity_created_at_snapshot
  for share;

  if v_auth_user is null then
    raise exception 'ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED'
      using errcode = '55000';
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    true
  );

  if p_action = 'activate' then
    v_provider := v_auth_user -> 'raw_app_meta_data' ->> 'provider';
    v_social_id := coalesce(
      v_auth_user -> 'raw_user_meta_data' ->> 'sub',
      v_auth_user -> 'raw_user_meta_data' ->> 'provider_id'
    );
    v_email := v_auth_user ->> 'email';
    if v_provider not in ('kakao', 'naver', 'google')
      or nullif(v_social_id, '') is null then
      raise exception 'ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED'
        using errcode = '55000';
    end if;

    insert into public.users (
      id,
      nickname,
      email,
      social_provider,
      social_id
    ) values (
      p_owner_uuid,
      pg_catalog.btrim(p_nickname),
      v_email,
      v_provider::public.social_provider_type,
      v_social_id
    );

    v_result := jsonb_build_object(
      'resolution_status', 'active',
      'account_generation', v_lifecycle.account_generation
    );
    update public.user_account_lifecycles
    set
      status = 'active',
      activated_at = v_now,
      resolved_at = v_now,
      resolution_idempotency_key_hash = v_key_hash,
      resolution_payload_hash = p_payload_hash,
      resolution_session_key_hash = p_session_key_hash,
      resolution_hmac_key_version = p_hmac_key_version,
      resolution_action = p_action,
      resolution_result_json = v_result,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;

    perform public.bind_user_session_generation(
      p_owner_uuid,
      v_lifecycle.account_generation,
      p_session_key_hash,
      p_hmac_key_version,
      p_auth_identity_created_at_snapshot
    );
  else
    v_result := jsonb_build_object(
      'deletion_status', 'cleanup_pending'
    );
    update public.user_account_lifecycles
    set
      status = 'deleting',
      resolution_idempotency_key_hash = v_key_hash,
      resolution_payload_hash = p_payload_hash,
      resolution_session_key_hash = p_session_key_hash,
      resolution_hmac_key_version = p_hmac_key_version,
      resolution_action = p_action,
      deletion_started_at = v_now,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;

    update public.user_session_generation_bindings
    set revoked_at = coalesce(revoked_at, v_now)
    where owner_uuid = p_owner_uuid
      and expected_account_generation = v_lifecycle.account_generation;

    perform public.delete_user_private_data(p_owner_uuid);
    insert into public.auth_identity_deletion_outbox (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      state
    ) values (
      p_owner_uuid,
      v_lifecycle.account_generation,
      p_auth_identity_created_at_snapshot,
      'pending'
    )
    on conflict (owner_uuid, account_generation) do nothing;

    update public.user_account_lifecycles
    set
      status = 'cleanup_pending',
      personal_db_deleted_at = v_now,
      resolution_result_json = v_result,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    false
  );
  return v_result;
end;
$function$;

create or replace function public.bootstrap_account_generation_identity(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_latest_lifecycle public.user_account_lifecycles%rowtype;
  v_watermark public.user_account_generation_watermarks%rowtype;
  v_auth_user auth.users%rowtype;
  v_account_generation bigint;
  v_create_generation boolean := false;
  v_profile_missing boolean;
  v_provider text;
  v_social_id text;
  v_nickname text;
  v_profile_image_url text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation identity bootstrap requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_session_issued_at is null then
    raise exception 'verified account generation bootstrap fields are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null
    or v_capability.activated_at is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select auth_user.*
    into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
    and auth_user.created_at = p_auth_identity_created_at_snapshot
  for share;

  if v_auth_user.id is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select lifecycle.*
    into v_latest_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  select watermark.*
    into v_watermark
  from public.user_account_generation_watermarks as watermark
  where watermark.owner_uuid = p_owner_uuid
  for update;

  if v_latest_lifecycle.owner_uuid is null then
    if p_auth_identity_created_at_snapshot <= v_capability.activated_at
      or p_session_issued_at <= v_capability.activated_at then
      raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
        using errcode = '55000';
    end if;
    v_create_generation := true;
  elsif v_latest_lifecycle.status = 'active' then
    if v_latest_lifecycle.auth_identity_created_at_snapshot
        is distinct from p_auth_identity_created_at_snapshot
      or p_session_issued_at <= v_capability.activated_at then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    v_account_generation := v_latest_lifecycle.account_generation;
  elsif v_latest_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'cleanup_pending' then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'complete' then
    if v_latest_lifecycle.personal_db_deleted_at is null
      or v_latest_lifecycle.auth_identity_deleted_at is null
      or p_auth_identity_created_at_snapshot
        <= greatest(
          v_latest_lifecycle.personal_db_deleted_at,
          v_latest_lifecycle.auth_identity_deleted_at
        )
      or p_session_issued_at
        <= greatest(
          v_latest_lifecycle.personal_db_deleted_at,
          v_latest_lifecycle.auth_identity_deleted_at
        ) then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    v_create_generation := true;
  else
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  if v_create_generation then
    if v_watermark.owner_uuid is null then
      v_account_generation := 1;
      insert into public.user_account_generation_watermarks (
        owner_uuid,
        last_account_generation
      ) values (
        p_owner_uuid,
        v_account_generation
      );
    else
      v_account_generation := v_watermark.last_account_generation + 1;
      update public.user_account_generation_watermarks
      set last_account_generation = v_account_generation
      where owner_uuid = p_owner_uuid;
    end if;

    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      origin,
      status,
      activated_at
    ) values (
      p_owner_uuid,
      v_account_generation,
      p_auth_identity_created_at_snapshot,
      'runtime',
      'active',
      clock_timestamp()
    );
  end if;

  select not exists (
    select 1
    from public.users as app_user
    where app_user.id = p_owner_uuid
      and app_user.deleted_at is null
  )
    into v_profile_missing;

  if v_profile_missing then
    v_provider := coalesce(
      v_auth_user.raw_app_meta_data ->> 'provider',
      v_auth_user.raw_user_meta_data ->> 'provider'
    );
    v_social_id := coalesce(
      nullif(v_auth_user.raw_user_meta_data ->> 'sub', ''),
      nullif(v_auth_user.raw_user_meta_data ->> 'provider_id', ''),
      p_owner_uuid::text
    );
    v_nickname := left(
      coalesce(
        nullif(pg_catalog.btrim(v_auth_user.raw_user_meta_data ->> 'nickname'), ''),
        '무먹러'
      ),
      30
    );
    v_profile_image_url := coalesce(
      nullif(v_auth_user.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(v_auth_user.raw_user_meta_data ->> 'picture', '')
    );

    if v_provider not in ('kakao', 'naver', 'google') then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;

    perform public.set_account_generation_internal_writer_marker(
      v_capability.current_cutover_attempt_id,
      true
    );
    insert into public.users (
      id,
      nickname,
      email,
      profile_image_url,
      social_provider,
      social_id,
      settings_json,
      created_at,
      updated_at,
      deleted_at
    ) values (
      p_owner_uuid,
      v_nickname,
      v_auth_user.email,
      v_profile_image_url,
      v_provider::public.social_provider_type,
      v_social_id,
      '{}'::jsonb,
      clock_timestamp(),
      clock_timestamp(),
      null
    );
    perform public.set_account_generation_internal_writer_marker(
      v_capability.current_cutover_attempt_id,
      false
    );
  end if;

  perform public.bind_user_session_generation(
    p_owner_uuid,
    v_account_generation,
    p_session_key_hash,
    p_hmac_key_version,
    p_auth_identity_created_at_snapshot
  );

  select app_user.nickname
    into v_nickname
  from public.users as app_user
  where app_user.id = p_owner_uuid
    and app_user.deleted_at is null;

  if v_nickname is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'account_generation', v_account_generation,
    'nickname', v_nickname
  );
end;
$function$;

revoke execute
  on function public.initiate_account_generation_delete(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text
  )
  from public, anon, authenticated;
revoke execute
  on function public.bootstrap_account_generation_identity(
    uuid,
    timestamp with time zone,
    text,
    integer,
    timestamp with time zone
  )
  from public, anon, authenticated;
revoke execute
  on function public.replay_account_generation_delete(
    uuid,
    text,
    integer,
    uuid,
    text
  )
  from public, anon, authenticated;
revoke execute
  on function public.resolve_account_cutover_quarantine(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text,
    text,
    text
  )
  from public, anon, authenticated;
grant execute
  on function public.initiate_account_generation_delete(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text
  )
  to service_role;
grant execute
  on function public.replay_account_generation_delete(
    uuid,
    text,
    integer,
    uuid,
    text
  )
  to service_role;
grant execute
  on function public.resolve_account_cutover_quarantine(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text,
    text,
    text
  )
  to service_role;
grant execute
  on function public.bootstrap_account_generation_identity(
    uuid,
    timestamp with time zone,
    text,
    integer,
    timestamp with time zone
  )
  to service_role;

do $role$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'homecook_auth_hook_guard_owner'
  ) then
    execute 'create role homecook_auth_hook_guard_owner nologin nosuperuser '
      || 'nocreatedb nocreaterole noinherit noreplication nobypassrls';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'homecook_auth_hook_guard_owner'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'homecook auth hook guard owner has unsafe attributes'
      using errcode = '42501';
  end if;
end;
$role$;

create schema account_generation_auth_hook;
revoke all on schema account_generation_auth_hook from public;
grant usage on schema account_generation_auth_hook
  to homecook_auth_hook_guard_owner, supabase_auth_admin;

grant select on table public.account_generation_capability_state
  to homecook_auth_hook_guard_owner;
revoke insert, update, delete, truncate, references, trigger
  on table public.account_generation_capability_state
  from homecook_auth_hook_guard_owner;

create policy account_generation_auth_hook_capability_select
on public.account_generation_capability_state
for select
to homecook_auth_hook_guard_owner
using (singleton);

create or replace function account_generation_auth_hook.assert_identity_creation_allowed()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_state text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation auth hook requires READ COMMITTED'
      using errcode = '25001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_state
  from public.account_generation_capability_state as capability
  where capability.singleton;

  if v_state is null then
    raise exception 'account generation capability state is unavailable'
      using errcode = '55000';
  end if;

  if v_state = 'cutover_maintenance' then
    raise exception 'account lifecycle maintenance is active'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function account_generation_auth_hook.before_user_created(event jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, account_generation_auth_hook, pg_temp
as $function$
begin
  if event is null or jsonb_typeof(event) <> 'object' then
    raise exception 'before-user-created hook event must be an object'
      using errcode = '22023';
  end if;

  perform account_generation_auth_hook.assert_identity_creation_allowed();
  return '{}'::jsonb;
end;
$function$;

revoke execute
  on function account_generation_auth_hook.before_user_created(jsonb)
  from public, anon, authenticated, service_role;
revoke execute
  on function account_generation_auth_hook.assert_identity_creation_allowed()
  from public, anon, authenticated, service_role;
grant execute
  on function account_generation_auth_hook.before_user_created(jsonb)
  to supabase_auth_admin;
grant execute
  on function account_generation_auth_hook.assert_identity_creation_allowed()
  to supabase_auth_admin;

-- PostgreSQL requires the current owner to be able to SET ROLE to a new
-- function owner. The Supabase migration runner is intentionally not a
-- superuser, so give it only the transaction-scoped membership needed for
-- this transfer and remove that membership immediately afterwards. Any
-- failure before the revoke rolls the grant back with the migration.
do $runner_membership_grant$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    -- PostgreSQL 16+ tracks SET/INHERIT per grantor. Keep the temporary
    -- self-grant non-inheriting and separate from the automatic admin-only
    -- membership that CREATEROLE receives for a newly created role.
    execute format(
      'grant homecook_auth_hook_guard_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant homecook_auth_hook_guard_owner to %I',
      current_user
    );
  end if;
end;
$runner_membership_grant$;

grant create on schema account_generation_auth_hook
  to homecook_auth_hook_guard_owner;

alter function account_generation_auth_hook.assert_identity_creation_allowed()
  owner to homecook_auth_hook_guard_owner;

revoke create on schema account_generation_auth_hook
  from homecook_auth_hook_guard_owner;

do $runner_membership_revoke$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke homecook_auth_hook_guard_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke homecook_auth_hook_guard_owner from %I',
      current_user
    );
  end if;
end;
$runner_membership_revoke$;

do $runner_membership$
declare
  v_runner_is_superuser boolean;
  v_runner_has_set_capability boolean;
begin
  select runner.rolsuper
    into v_runner_is_superuser
  from pg_catalog.pg_roles as runner
  where runner.rolname = current_user;

  if coalesce(v_runner_is_superuser, false) then
    -- Superusers can SET ROLE without a membership row. The portable leak
    -- check for bootstrap test clusters is therefore the catalog edge.
    select exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      where granted_role.rolname = 'homecook_auth_hook_guard_owner'
        and member_role.rolname = current_user
    )
      into v_runner_has_set_capability;
  elsif current_setting('server_version_num')::integer >= 160000 then
    execute $membership_check$
      select
        pg_catalog.pg_has_role(
          current_user,
          'homecook_auth_hook_guard_owner',
          'SET'
        )
        or pg_catalog.pg_has_role(
          current_user,
          'homecook_auth_hook_guard_owner',
          'USAGE'
        )
    $membership_check$
    into v_runner_has_set_capability;
  else
    v_runner_has_set_capability :=
      pg_catalog.pg_has_role(
        current_user,
        'homecook_auth_hook_guard_owner',
        'MEMBER'
      )
      or pg_catalog.pg_has_role(
        current_user,
        'homecook_auth_hook_guard_owner',
        'USAGE'
      );
  end if;

  if coalesce(v_runner_has_set_capability, false) then
    raise exception
      'migration runner retained set-capable auth hook membership'
      using errcode = '42501';
  end if;

  if pg_catalog.has_schema_privilege(
    'homecook_auth_hook_guard_owner',
    'account_generation_auth_hook',
    'CREATE'
  ) then
    raise exception 'auth hook guard owner retained schema create'
      using errcode = '42501';
  end if;
end;
$runner_membership$;

commit;
