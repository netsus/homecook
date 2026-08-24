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

revoke all on function public.set_account_generation_cutover_snapshot(
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
) from public, anon, authenticated;

grant execute on function public.set_account_generation_cutover_snapshot(
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
) to service_role;

revoke all on function public.promote_account_generation_cutover(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text
) from public, anon, authenticated;

grant execute on function public.promote_account_generation_cutover(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text
) to service_role;
