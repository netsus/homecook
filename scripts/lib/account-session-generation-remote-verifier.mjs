import { readFileSync } from "node:fs";

const INVENTORY_SQL = String.raw`
with auth_inbound_fks as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    constraint_row.conname as constraint_name,
    constraint_row.confdeltype as delete_action
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
), f0_functions as (
  select
    namespace.nspname as schema_name,
    procedure.proname as function_name,
    pg_catalog.oidvectortypes(procedure.proargtypes) as argument_types,
    procedure.prosecdef as security_definer,
    coalesce(procedure.proconfig::text, '') as configuration
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'account_generation_auth_hook')
    and (
      procedure.proname like '%account_generation%'
      or procedure.proname like '%session_generation%'
      or procedure.proname = 'before_user_created'
      or procedure.proname = 'assert_identity_creation_allowed'
    )
)
select jsonb_build_object(
  'tables', jsonb_build_object(
    'capability', pg_catalog.to_regclass('public.account_generation_capability_state'),
    'watermarks', pg_catalog.to_regclass('public.user_account_generation_watermarks'),
    'lifecycles', pg_catalog.to_regclass('public.user_account_lifecycles'),
    'bindings', pg_catalog.to_regclass('public.user_session_generation_bindings'),
    'cutover_attempts', pg_catalog.to_regclass('public.account_generation_cutover_attempts'),
    'cutover_staging', pg_catalog.to_regclass('public.account_generation_cutover_staging'),
    'legacy_receipts', pg_catalog.to_regclass('public.legacy_account_delete_receipts'),
    'external_attempts', pg_catalog.to_regclass('public.legacy_external_write_attempts'),
    'auth_outbox', pg_catalog.to_regclass('public.auth_identity_deletion_outbox')
  ),
  'auth_inbound_fks', coalesce(
    (select jsonb_agg(to_jsonb(auth_inbound_fks) order by schema_name, table_name, constraint_name)
      from auth_inbound_fks),
    '[]'::jsonb
  ),
  'f0_functions', coalesce(
    (select jsonb_agg(to_jsonb(f0_functions) order by schema_name, function_name, argument_types)
      from f0_functions),
    '[]'::jsonb
  )
);
`;

const POST_MERGE_DARK_SHIP_SQL = String.raw`
with auth_inbound_fks as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    constraint_row.conname as constraint_name,
    constraint_row.confdeltype as delete_action
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
), capability as (
  select state, revision, current_cutover_attempt_id
  from public.account_generation_capability_state
  where singleton
)
select jsonb_build_object(
  'capability', (select to_jsonb(capability) from capability),
  'capability_count', (
    select count(*) from public.account_generation_capability_state
  ),
  'watermark_count', (
    select count(*) from public.user_account_generation_watermarks
  ),
  'lifecycle_count', (
    select count(*) from public.user_account_lifecycles
  ),
  'auth_inbound_fks', coalesce(
    (select jsonb_agg(to_jsonb(auth_inbound_fks) order by schema_name, table_name, constraint_name)
      from auth_inbound_fks),
    '[]'::jsonb
  )
);
`;

const JOINT_STORAGE_INVENTORY_SAMPLE_SQL = String.raw`
with capability as (
  select
    capability.state,
    capability.revision,
    capability.current_cutover_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton
    and capability.state = 'cutover_maintenance'
), expected_owner_universe as (
  select
    staging.owner_uuid,
    staging.proposed_account_generation,
    staging.validation_state
  from capability
  join public.account_generation_cutover_staging as staging
    on staging.attempt_id = capability.current_cutover_attempt_id
  where staging.owner_uuid is not null
), registry_expected_owners as (
  select
    expected_owner.owner_uuid,
    expected_owner.proposed_account_generation
  from expected_owner_universe as expected_owner
  where expected_owner.proposed_account_generation is not null
    and expected_owner.proposed_account_generation > 0
), current_expected_owner_lifecycles as (
  select
    expected_owner.owner_uuid,
    expected_owner.proposed_account_generation,
    lifecycle.required_cleanup_generation
  from registry_expected_owners as expected_owner
  left join public.user_account_lifecycles as lifecycle
    on lifecycle.owner_uuid = expected_owner.owner_uuid
   and lifecycle.account_generation = expected_owner.proposed_account_generation
), strict_legacy_path_candidates as (
  select
    object.id as storage_object_id,
    object.bucket_id,
    object.name as object_path,
    object.owner_id,
    split_part(object.name, '/', 1)::uuid as path_owner_uuid
  from storage.objects as object
  where object.bucket_id = 'recipe-images'
    and object.name ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
), owner_id_signals as (
  select distinct object.id as storage_object_id
  from storage.objects as object
  join expected_owner_universe as expected_owner
    on object.owner_id = expected_owner.owner_uuid::text
), strict_legacy_path_signals as (
  select distinct object.storage_object_id
  from strict_legacy_path_candidates as object
  join expected_owner_universe as expected_owner
    on object.path_owner_uuid = expected_owner.owner_uuid
), null_owner_strict_legacy_path_signals as (
  select distinct object.storage_object_id
  from strict_legacy_path_candidates as object
  join expected_owner_universe as expected_owner
    on object.path_owner_uuid = expected_owner.owner_uuid
  where object.owner_id is null
), registry_signals as (
  select distinct object.id as storage_object_id
  from registry_expected_owners as expected_owner
  join public.recipe_image_objects as registry
    on registry.owner_uuid = expected_owner.owner_uuid
   and registry.account_generation = expected_owner.proposed_account_generation
   and registry.visibility = 'private'
   and registry.bucket_id = 'recipe-images-private'
  join storage.objects as object
    on object.bucket_id = registry.bucket_id
   and object.name = registry.object_path
  where registry.object_path ~ (
    '^'
    || expected_owner.owner_uuid::text
    || '/'
    || expected_owner.proposed_account_generation::text
    || '/'
    || registry.id::text
    || '\.(jpg|jpeg|png|webp)$'
  )
), current_attempt_targets as (
  select
    target.id as migration_target_id,
    target.target_object_id,
    target.source_storage_object_id,
    target.source_bucket_id,
    target.source_object_path,
    target.target_bucket_id,
    target.target_object_path,
    target.expected_visibility,
    target.owner_uuid,
    target.account_generation,
    target.state
  from capability
  join public.recipe_image_legacy_visibility_migration_runs as migration_run
    on migration_run.cutover_attempt_id = capability.current_cutover_attempt_id
  join public.recipe_image_legacy_visibility_targets as target
    on target.migration_run_id = migration_run.id
  where target.source_bucket_id = 'recipe-images'
), current_attempt_target_references as (
  select
    target_reference.migration_target_id,
    positive_reference.owner_uuid as persisted_owner_uuid,
    positive_reference.storage_object_id as persisted_storage_object_id,
    positive_reference.bucket_id as persisted_bucket_id,
    positive_reference.object_path as persisted_object_path
  from public.recipe_image_legacy_visibility_target_references
    as target_reference
  join public.recipe_image_legacy_positive_references as positive_reference
    on positive_reference.id = target_reference.positive_reference_id
), current_existing_legacy_sources as (
  select distinct target.source_storage_object_id as storage_object_id
  from current_attempt_targets as target
  left join current_attempt_target_references as target_reference
    on target_reference.migration_target_id = target.migration_target_id
  join expected_owner_universe as expected_owner
    on expected_owner.owner_uuid = coalesce(
      target.owner_uuid,
      target_reference.persisted_owner_uuid
    )
  join storage.objects as source_object
    on source_object.id = target.source_storage_object_id
   and source_object.bucket_id = target.source_bucket_id
   and source_object.name = target.source_object_path
  where target.source_object_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    and (
      target.owner_uuid is not null
      or (
        target_reference.persisted_storage_object_id = target.source_storage_object_id
        and target_reference.persisted_bucket_id = target.source_bucket_id
        and target_reference.persisted_object_path = target.source_object_path
      )
    )
    and split_part(target.source_object_path, '/', 1)::uuid = expected_owner.owner_uuid
    and (
      source_object.owner_id is null
      or source_object.owner_id = expected_owner.owner_uuid::text
    )
), owned_unverified as (
  select owner_signal.storage_object_id
  from owner_id_signals as owner_signal
  left join current_existing_legacy_sources as known_source
    using (storage_object_id)
  left join registry_signals as registry_signal
    using (storage_object_id)
  where known_source.storage_object_id is null
    and registry_signal.storage_object_id is null
), owner_path_unverified as (
  select owner_path_signal.storage_object_id
  from null_owner_strict_legacy_path_signals as owner_path_signal
  left join current_existing_legacy_sources as known_source
    using (storage_object_id)
  where known_source.storage_object_id is null
), owner_signal_union as (
  select storage_object_id from owner_id_signals
  union
  select storage_object_id from strict_legacy_path_signals
  union
  select storage_object_id from registry_signals
), public_shared_rehome_targets as (
  select
    target.target_object_id,
    target.state
  from current_attempt_targets as target
  where target.expected_visibility = 'public_shared'
), private_cleanup_target_candidates as (
  select
    target.target_object_id,
    target.owner_uuid,
    target.account_generation,
    target.target_bucket_id,
    target.target_object_path
  from current_attempt_targets as target
  where target.expected_visibility = 'private'
), current_expected_owner_private_registry as (
  select distinct
    registry.id as target_object_id,
    registry.owner_uuid,
    registry.account_generation,
    registry.bucket_id as target_bucket_id,
    registry.object_path as target_object_path
  from registry_expected_owners as expected_owner
  join public.recipe_image_objects as registry
    on registry.owner_uuid = expected_owner.owner_uuid
   and registry.account_generation = expected_owner.proposed_account_generation
   and registry.visibility = 'private'
), private_cleanup_candidates as (
  select distinct
    candidate.target_object_id,
    candidate.owner_uuid,
    candidate.account_generation,
    candidate.target_bucket_id,
    candidate.target_object_path
  from (
    select
      target.target_object_id,
      target.owner_uuid,
      target.account_generation,
      target.target_bucket_id,
      target.target_object_path
    from private_cleanup_target_candidates as target

    union

    select
      registry.target_object_id,
      registry.owner_uuid,
      registry.account_generation,
      registry.target_bucket_id,
      registry.target_object_path
    from current_expected_owner_private_registry as registry
  ) as candidate
), current_expected_owner_outboxes as (
  select distinct
    outbox.owner_uuid,
    outbox.account_generation,
    outbox.bucket_id,
    outbox.object_path,
    outbox.cleanup_generation,
    outbox.state,
    outbox.terminal_result
  from registry_expected_owners as expected_owner
  join public.storage_object_deletion_outbox as outbox
    on outbox.owner_uuid = expected_owner.owner_uuid
   and outbox.account_generation = expected_owner.proposed_account_generation
), private_cleanup_candidate_states as (
  select
    candidate.target_object_id,
    candidate.owner_uuid,
    candidate.account_generation,
    candidate.target_bucket_id,
    candidate.target_object_path,
    registry.cleanup_generation,
    registry.state as registry_state,
    outbox.state as outbox_state,
    outbox.terminal_result as outbox_terminal_result
  from private_cleanup_candidates as candidate
  left join public.recipe_image_objects as registry
    on registry.id = candidate.target_object_id
   and registry.bucket_id = candidate.target_bucket_id
   and registry.object_path = candidate.target_object_path
   and registry.visibility = 'private'
   and registry.owner_uuid = candidate.owner_uuid
   and registry.account_generation = candidate.account_generation
  left join current_expected_owner_outboxes as outbox
    on outbox.owner_uuid = candidate.owner_uuid
   and outbox.account_generation = candidate.account_generation
   and outbox.bucket_id = candidate.target_bucket_id
   and outbox.object_path = candidate.target_object_path
   and registry.cleanup_generation is not null
   and outbox.cleanup_generation = registry.cleanup_generation
), digests as (
  select
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select string_agg(
              owner_signal.storage_object_id::text,
              E'\n' order by owner_signal.storage_object_id
            )
            from owner_signal_union as owner_signal
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as owner_signal_digest,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select string_agg(
              owned.storage_object_id::text,
              E'\n' order by owned.storage_object_id
            )
            from owned_unverified as owned
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as owned_unverified_digest,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select string_agg(
              owner_path.storage_object_id::text,
              E'\n' order by owner_path.storage_object_id
            )
            from owner_path_unverified as owner_path
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as owner_path_unverified_digest,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select string_agg(
              rehome.target_object_id::text || ':' || rehome.state,
              E'\n' order by rehome.target_object_id, rehome.state
            )
            from public_shared_rehome_targets as rehome
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as known_public_shared_rehome_digest,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select string_agg(
              cleanup.target_object_id::text || ':' || coalesce(cleanup.registry_state, 'missing')
              || ':' || coalesce(cleanup.outbox_state, 'missing')
              || ':' || coalesce(cleanup.outbox_terminal_result, 'missing'),
              E'\n' order by cleanup.target_object_id, cleanup.registry_state, cleanup.outbox_state, cleanup.outbox_terminal_result
            )
            from private_cleanup_candidate_states as cleanup
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as known_private_cleanup_digest,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce((
            select capability.current_cutover_attempt_id::text
            from capability
          ), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as capability_cutover_attempt_digest
)
select jsonb_build_object(
  'sampled_at', to_char(
    statement_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ),
  'capability_state', (select capability.state from capability),
  'capability_revision', (select capability.revision from capability),
  'capability_cutover_attempt_digest', (
    select digests.capability_cutover_attempt_digest from digests
  ),
  'external_write_nonterminal_count', (
    select count(*)
    from public.legacy_external_write_attempts as attempt
    where attempt.state <> 'terminal'
  ),
  'owner_id_signal_count', (
    select count(*) from owner_id_signals
  ),
  'strict_legacy_path_signal_count', (
    select count(*) from strict_legacy_path_signals
  ),
  'registry_signal_count', (
    select count(*) from registry_signals
  ),
  'owner_signal_3_way_union_count', (
    select count(*) from owner_signal_union
  ),
  'owned_unverified_count', (
    select count(*) from owned_unverified
  ),
  'owner_path_unverified_count', (
    select count(*) from owner_path_unverified
  ),
  'known_public_shared_rehome_terminal_count', (
    select count(*)
    from public_shared_rehome_targets as rehome
    where rehome.state = 'finalized'
  ),
  'known_public_shared_rehome_pending_count', (
    select count(*)
    from public_shared_rehome_targets as rehome
    where rehome.state <> 'finalized'
  ),
  'known_private_cleanup_terminal_count', (
    select count(*)
    from private_cleanup_candidate_states as cleanup
    where cleanup.registry_state in ('deleted', 'verified_not_found')
      and cleanup.outbox_state = 'succeeded'
      and cleanup.outbox_terminal_result in ('deleted', 'verified_not_found')
      and cleanup.outbox_terminal_result = cleanup.registry_state
  ),
  'known_private_cleanup_pending_count', (
    select count(*)
    from private_cleanup_candidate_states as cleanup
    where not (
      cleanup.registry_state in ('deleted', 'verified_not_found')
      and cleanup.outbox_state = 'succeeded'
      and cleanup.outbox_terminal_result in ('deleted', 'verified_not_found')
      and cleanup.outbox_terminal_result = cleanup.registry_state
    )
  ),
  'known_private_cleanup_outbox_nonterminal_count', (
    select count(*)
    from current_expected_owner_outboxes as outbox
    where outbox.state not in ('succeeded', 'dead_letter')
  ),
  'known_private_cleanup_outbox_dead_letter_count', (
    select count(*)
    from current_expected_owner_outboxes as outbox
    where outbox.state = 'dead_letter'
  ),
  'known_private_cleanup_outbox_generation_mismatch_count', (
    select count(*)
    from current_expected_owner_lifecycles as lifecycle
    where lifecycle.required_cleanup_generation is null
      or exists (
        select 1
        from current_expected_owner_outboxes as outbox
        where outbox.owner_uuid = lifecycle.owner_uuid
          and outbox.account_generation = lifecycle.proposed_account_generation
          and outbox.cleanup_generation not between 1 and lifecycle.required_cleanup_generation
      )
      or (
        select count(distinct outbox.cleanup_generation) filter (
          where outbox.state = 'succeeded'
            and outbox.terminal_result in ('deleted', 'verified_not_found')
            and exists (
              select 1
              from public.recipe_image_objects as registry
              where registry.bucket_id = outbox.bucket_id
                and registry.object_path = outbox.object_path
                and registry.owner_uuid = outbox.owner_uuid
                and registry.account_generation = outbox.account_generation
                and registry.visibility = 'private'
                and registry.cleanup_generation >= outbox.cleanup_generation
                and registry.cleanup_generation <= lifecycle.required_cleanup_generation
            )
        )
        from current_expected_owner_outboxes as outbox
        where outbox.owner_uuid = lifecycle.owner_uuid
          and outbox.account_generation = lifecycle.proposed_account_generation
      ) <> lifecycle.required_cleanup_generation
  ),
  'known_private_cleanup_outbox_registry_mismatch_count', (
    select count(*)
    from current_expected_owner_outboxes as outbox
    left join current_expected_owner_lifecycles as lifecycle
      on lifecycle.owner_uuid = outbox.owner_uuid
     and lifecycle.proposed_account_generation = outbox.account_generation
    where lifecycle.required_cleanup_generation is null
      or not exists (
      select 1
      from public.recipe_image_objects as registry
      where registry.bucket_id = outbox.bucket_id
        and registry.object_path = outbox.object_path
        and registry.owner_uuid = outbox.owner_uuid
        and registry.account_generation = outbox.account_generation
        and registry.visibility = 'private'
        and registry.cleanup_generation >= outbox.cleanup_generation
        and registry.cleanup_generation <= lifecycle.required_cleanup_generation
    )
  ),
  'owner_signal_digest', (select digests.owner_signal_digest from digests),
  'owned_unverified_digest', (
    select digests.owned_unverified_digest from digests
  ),
  'owner_path_unverified_digest', (
    select digests.owner_path_unverified_digest from digests
  ),
  'known_public_shared_rehome_digest', (
    select digests.known_public_shared_rehome_digest from digests
  ),
  'known_private_cleanup_digest', (
    select digests.known_private_cleanup_digest from digests
  ),
  'remote_writes', 0
);
`;

const MUTATING_SQL_PATTERN =
  /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu;

const PERSONAL_OWNER_SOURCE_DEFINITIONS = Object.freeze([
  {
    sourceName: "public.users",
    relation: "public.users",
    columnExpression: "id",
  },
  {
    sourceName: "public.auth_identity_deletion_outbox",
    relation: "public.auth_identity_deletion_outbox",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.image_upload_quota_counters",
    relation: "public.image_upload_quota_counters",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.mutation_idempotency_keys",
    relation: "public.mutation_idempotency_keys",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.recipe_image_legacy_positive_references",
    relation: "public.recipe_image_legacy_positive_references",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.recipe_image_legacy_visibility_targets",
    relation: "public.recipe_image_legacy_visibility_targets",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.recipe_image_objects",
    relation: "public.recipe_image_objects",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.storage_object_deletion_outbox",
    relation: "public.storage_object_deletion_outbox",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.user_account_generation_watermarks",
    relation: "public.user_account_generation_watermarks",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.user_account_lifecycles",
    relation: "public.user_account_lifecycles",
    columnExpression: "owner_uuid",
  },
  {
    sourceName: "public.user_session_generation_bindings",
    relation: "public.user_session_generation_bindings",
    columnExpression: "owner_uuid",
  },
]);

const PERSONAL_OWNER_UUID_COLUMN_WHITELIST = Object.freeze([
  ["public", "auth_identity_deletion_outbox", "owner_uuid", "included_personal_owner"],
  ["public", "image_upload_quota_counters", "owner_uuid", "included_personal_owner"],
  ["public", "mutation_idempotency_keys", "owner_uuid", "included_personal_owner"],
  ["public", "recipe_image_legacy_positive_references", "owner_uuid", "included_personal_owner"],
  ["public", "recipe_image_legacy_visibility_targets", "owner_uuid", "included_personal_owner"],
  ["public", "recipe_image_objects", "owner_uuid", "included_personal_owner"],
  ["public", "storage_object_deletion_outbox", "owner_uuid", "included_personal_owner"],
  ["public", "user_account_generation_watermarks", "owner_uuid", "included_personal_owner"],
  ["public", "user_account_lifecycles", "owner_uuid", "included_personal_owner"],
  ["public", "user_session_generation_bindings", "owner_uuid", "included_personal_owner"],
  ["public", "legacy_account_delete_receipts", "owner_uuid", "excluded_evidence"],
  ["public", "legacy_external_write_attempts", "owner_uuid", "excluded_evidence"],
  ["public", "account_generation_cutover_staging", "owner_uuid", "excluded_staging"],
  ["public", "operational_events", "actor_user_id", "excluded_audit_actor"],
  ["public", "operational_events", "target_user_id", "excluded_audit_target"],
]);

const EXPECTED_PERSONAL_OWNER_SOURCE_NAMES = Object.freeze(
  PERSONAL_OWNER_SOURCE_DEFINITIONS.map(({ sourceName }) => sourceName).sort(),
);

const ALLOWED_PERSONAL_OWNER_CLASSIFICATIONS = new Set([
  ...PERSONAL_OWNER_UUID_COLUMN_WHITELIST.map(([, , , classification]) => classification),
  "unknown_owner_like",
]);

const ACCOUNT_GENERATION_SAMPLE_ALLOWED_KEYS = Object.freeze([
  "sampled_at",
  "capability_state",
  "capability_revision",
  "capability_cutover_attempt_digest",
  "external_write_nonterminal_count",
  "owner_id_signal_count",
  "strict_legacy_path_signal_count",
  "registry_signal_count",
  "owner_signal_3_way_union_count",
  "owned_unverified_count",
  "owner_path_unverified_count",
  "known_public_shared_rehome_terminal_count",
  "known_public_shared_rehome_pending_count",
  "known_private_cleanup_terminal_count",
  "known_private_cleanup_pending_count",
  "known_private_cleanup_outbox_nonterminal_count",
  "known_private_cleanup_outbox_dead_letter_count",
  "known_private_cleanup_outbox_generation_mismatch_count",
  "known_private_cleanup_outbox_registry_mismatch_count",
  "owner_signal_digest",
  "owned_unverified_digest",
  "owner_path_unverified_digest",
  "known_public_shared_rehome_digest",
  "known_private_cleanup_digest",
  "remote_writes",
]);

const ACCOUNT_GENERATION_SAMPLE_COUNT_FIELDS = Object.freeze([
  "external_write_nonterminal_count",
  "owner_id_signal_count",
  "strict_legacy_path_signal_count",
  "registry_signal_count",
  "owner_signal_3_way_union_count",
  "owned_unverified_count",
  "owner_path_unverified_count",
  "known_public_shared_rehome_terminal_count",
  "known_public_shared_rehome_pending_count",
  "known_private_cleanup_terminal_count",
  "known_private_cleanup_pending_count",
  "known_private_cleanup_outbox_nonterminal_count",
  "known_private_cleanup_outbox_dead_letter_count",
  "known_private_cleanup_outbox_generation_mismatch_count",
  "known_private_cleanup_outbox_registry_mismatch_count",
  "remote_writes",
]);

const ACCOUNT_GENERATION_SAMPLE_DIGEST_FIELDS = Object.freeze([
  "capability_cutover_attempt_digest",
  "owner_signal_digest",
  "owned_unverified_digest",
  "owner_path_unverified_digest",
  "known_public_shared_rehome_digest",
  "known_private_cleanup_digest",
]);

const PSQL_META_COMMAND_PATTERN = /\\/u;
const STRICT_UTC_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/u;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const STORAGE_SAMPLE_MANUAL_BLOCKERS = Object.freeze([
  "storage_inventory_second_sample",
  "auth_quiet_window",
  "provider_auth_barrier",
  "maintenance_runtime_release",
]);
const CUTOVER_SHARED_LOCK_PRELUDE = String.raw`select pg_catalog.pg_advisory_xact_lock_shared(
  pg_catalog.hashtextextended(
    'homecook-account-generation-cutover',
    0
  )
);`;

const PERSONAL_OWNER_SOURCE_INVENTORY_SQL = PERSONAL_OWNER_SOURCE_DEFINITIONS.map(
  ({ sourceName, relation, columnExpression }) =>
    `select '${sourceName}'::text as source_name, count(distinct ${columnExpression}::text)::bigint as owner_count from ${relation} where ${columnExpression} is not null`,
).join("\n  union all\n  ");

const PERSONAL_OWNER_UNION_SQL = PERSONAL_OWNER_SOURCE_DEFINITIONS.map(
  ({ relation, columnExpression }) =>
    `select ${columnExpression}::text as user_id from ${relation} where ${columnExpression} is not null`,
).join("\n  union\n  ");

const PERSONAL_OWNER_UUID_COLUMN_WHITELIST_SQL = PERSONAL_OWNER_UUID_COLUMN_WHITELIST.map(
  ([schemaName, tableName, columnName, classification]) =>
    `('${schemaName}', '${tableName}', '${columnName}', '${classification}')`,
).join(",\n    ");

function maskSqlLiterals(value) {
  if (typeof value !== "string") return "";

  let masked = "";
  let inLiteral = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      masked += character;
      if (inLiteral && value[index + 1] === "'") {
        masked += value[index + 1];
        index += 1;
      } else {
        inLiteral = !inLiteral;
      }
      continue;
    }
    masked += inLiteral ? " " : character;
  }
  return masked;
}

export function assertAccountGenerationReadOnlyVerificationSql({
  sql,
  fieldName,
}) {
  const maskedSql = maskSqlLiterals(sql);
  const trimmedSql = maskedSql.trim();
  const semicolonCount = (trimmedSql.match(/;/g) ?? []).length;

  if (!trimmedSql.toLowerCase().startsWith("with")) {
    throw new Error(`${fieldName} must be a single WITH ... SELECT statement`);
  }
  if (PSQL_META_COMMAND_PATTERN.test(trimmedSql)) {
    throw new Error(`${fieldName} must not contain psql meta-commands`);
  }
  if (semicolonCount !== 1 || !trimmedSql.endsWith(";")) {
    throw new Error(`${fieldName} must not contain multiple SQL statements`);
  }
  const withoutTerminator = trimmedSql.slice(0, -1);
  if (!/\bselect\b/iu.test(withoutTerminator)) {
    throw new Error(`${fieldName} must be a single WITH ... SELECT statement`);
  }
  if (MUTATING_SQL_PATTERN.test(withoutTerminator)) {
    throw new Error(`${fieldName} must remain SELECT/CTE-only`);
  }
}

const JOINT_ACTIVATION_PREFLIGHT_SQL = String.raw`
with auth_inbound_fks as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    constraint_row.conname as constraint_name,
    constraint_row.confdeltype as delete_action
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'auth.users'::pg_catalog.regclass
), public_user_inbound_fks as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    constraint_row.conname as constraint_name,
    attribute_row.attname as column_name,
    constraint_row.confdeltype as delete_action
  from pg_catalog.pg_constraint as constraint_row
  join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_attribute as attribute_row
    on attribute_row.attrelid = relation.oid
   and attribute_row.attnum = any(constraint_row.conkey)
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.users'::pg_catalog.regclass
), capability as (
  select state, revision, current_cutover_attempt_id
  from public.account_generation_capability_state
  where singleton
), auth_users as (
  select
    auth_user.id::text as user_id,
    to_char(
      auth_user.created_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) as created_at_snapshot
  from auth.users as auth_user
), public_users as (
  select
    public_user.id::text as user_id
  from public.users as public_user
), auth_public_intersection as (
  select auth_users.user_id
  from auth_users
  join public_users using (user_id)
), auth_only as (
  select auth_users.user_id
  from auth_users
  left join public_users using (user_id)
  where public_users.user_id is null
), public_only as (
  select public_users.user_id
  from public_users
  left join auth_users using (user_id)
  where auth_users.user_id is null
), legacy_receipts_exact as (
  select receipt.owner_uuid::text as user_id
  from public.legacy_account_delete_receipts as receipt
  join auth_users
    on auth_users.user_id = receipt.owner_uuid::text
   and auth_users.created_at_snapshot = to_char(
      receipt.auth_identity_created_at_snapshot at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
), personal_owner_sources as (
  ${PERSONAL_OWNER_SOURCE_INVENTORY_SQL}
), personal_owner_union as (
  ${PERSONAL_OWNER_UNION_SQL}
), owner_uuid_whitelist as (
  select *
  from (
    values
    ${PERSONAL_OWNER_UUID_COLUMN_WHITELIST_SQL}
  ) as whitelist(schema_name, table_name, column_name, classification)
), owner_uuid_candidates as (
  select
    namespace.nspname as schema_name,
    relation.relname as table_name,
    attribute_row.attname as column_name
  from pg_catalog.pg_attribute as attribute_row
  join pg_catalog.pg_class as relation
    on relation.oid = attribute_row.attrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_type as type_row
    on type_row.oid = attribute_row.atttypid
  left join pg_catalog.pg_constraint as constraint_row
    on constraint_row.conrelid = relation.oid
   and constraint_row.contype = 'f'
   and pg_catalog.array_length(constraint_row.conkey, 1) = 1
   and constraint_row.conkey[1] = attribute_row.attnum
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped
    and type_row.typname = 'uuid'
    and attribute_row.attname in (
      'owner_uuid',
      'owner_user_id',
      'user_id',
      'created_by',
      'reporter_user_id',
      'actor_user_id',
      'target_user_id'
    )
    and constraint_row.oid is null
), personal_owner_uuid_columns as (
  select
    candidate.schema_name,
    candidate.table_name,
    candidate.column_name,
    coalesce(whitelist.classification, 'unknown_owner_like') as classification
  from owner_uuid_candidates as candidate
  left join owner_uuid_whitelist as whitelist
    using (schema_name, table_name, column_name)
), personal_owner_uuid_missing as (
  select
    whitelist.schema_name,
    whitelist.table_name,
    whitelist.column_name,
    whitelist.classification
  from owner_uuid_whitelist as whitelist
  left join owner_uuid_candidates as candidate
    using (schema_name, table_name, column_name)
  where candidate.schema_name is null
), personal_owner_without_identity as (
  select personal_owner.user_id
  from personal_owner_union as personal_owner
  left join auth_users using (user_id)
  left join public_users using (user_id)
  where auth_users.user_id is null
    and public_users.user_id is null
)
select jsonb_build_object(
  'capability', (select to_jsonb(capability) from capability),
  'capability_count', (
    select count(*) from public.account_generation_capability_state
  ),
  'watermark_count', (
    select count(*) from public.user_account_generation_watermarks
  ),
  'lifecycle_count', (
    select count(*) from public.user_account_lifecycles
  ),
  'cutover_nonterminal_attempt_count', (
    select count(*) from public.account_generation_cutover_attempts
    where state in ('staging', 'staged')
  ),
  'cutover_staging_count', (
    select count(*) from public.account_generation_cutover_staging
  ),
  'legacy_external_write_nonterminal_count', (
    select count(*)
    from public.legacy_external_write_attempts as attempt
    where attempt.state <> 'terminal'
  ),
  'auth_deletion_outbox_nonterminal_count', (
    select count(*)
    from public.auth_identity_deletion_outbox as outbox
    where outbox.state not in ('succeeded', 'dead_letter')
  ),
  'auth_deletion_outbox_dead_letter_count', (
    select count(*)
    from public.auth_identity_deletion_outbox as outbox
    where outbox.state = 'dead_letter'
  ),
  'recipe_image_registry_nonterminal_count', (
    select count(*)
    from public.recipe_image_objects as registry
    where registry.state in (
      'pending_upload',
      'uploaded_unlinked',
      'cleanup_pending',
      'not_found_observed'
    )
  ),
  'storage_deletion_outbox_nonterminal_count', (
    select count(*)
    from public.storage_object_deletion_outbox as outbox
    where outbox.state not in ('succeeded', 'dead_letter')
  ),
  'storage_deletion_outbox_dead_letter_count', (
    select count(*)
    from public.storage_object_deletion_outbox as outbox
    where outbox.state = 'dead_letter'
  ),
  'auth_user_count', (
    select count(*) from auth_users
  ),
  'auth_user_digest', (
    select encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              auth_users.user_id || ':' || auth_users.created_at_snapshot,
              E'\n'
              order by auth_users.user_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from auth_users
  ),
  'public_user_count', (
    select count(*) from public_users
  ),
  'public_user_digest', (
    select encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              app_user.id::text,
              E'\n'
              order by app_user.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from public.users as app_user
  ),
  'auth_public_intersection_count', (
    select count(*) from auth_public_intersection
  ),
  'auth_only_count', (
    select count(*) from auth_only
  ),
  'public_only_count', (
    select count(*) from public_only
  ),
  'legacy_receipt_count', (
    select count(*) from public.legacy_account_delete_receipts
  ),
  'current_auth_identity_exact_match_count', (
    select count(*) from legacy_receipts_exact
  ),
  'public_user_inbound_fks', coalesce(
    (select jsonb_agg(to_jsonb(public_user_inbound_fks) order by schema_name, table_name, constraint_name, column_name)
      from public_user_inbound_fks),
    '[]'::jsonb
  ),
  'personal_owner_count', (
    select count(*) from personal_owner_union
  ),
  'personal_owner_digest', (
    select encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              personal_owner.user_id,
              E'\n'
              order by personal_owner.user_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from personal_owner_union as personal_owner
  ),
  'personal_owner_without_identity_count', (
    select count(*) from personal_owner_without_identity
  ),
  'personal_owner_sources', coalesce(
    (select jsonb_agg(to_jsonb(personal_owner_sources) order by source_name)
      from personal_owner_sources),
    '[]'::jsonb
  ),
  'personal_owner_uuid_columns', coalesce(
    (select jsonb_agg(to_jsonb(personal_owner_uuid_columns) order by schema_name, table_name, column_name)
      from personal_owner_uuid_columns),
    '[]'::jsonb
  ),
  'personal_owner_inventory_unknown_count', (
    select count(*)
    from personal_owner_uuid_columns
    where classification = 'unknown_owner_like'
  ),
  'personal_owner_inventory_missing_count', (
    select count(*) from personal_owner_uuid_missing
  ),
  'auth_inbound_fks', coalesce(
    (select jsonb_agg(to_jsonb(auth_inbound_fks) order by schema_name, table_name, constraint_name)
      from auth_inbound_fks),
    '[]'::jsonb
  ),
  'remote_writes', 0
);
`;

const PREFLIGHT_MANUAL_BLOCKERS = Object.freeze([
  "auth_hook_remote_configuration",
  "auth_admin_write_freeze",
  "auth_quiet_window",
  "storage_inventory_second_sample",
  "provider_auth_barrier",
  "maintenance_runtime_release",
]);

const LINKED_DATABASE_ENVIRONMENT_KEYS = Object.freeze([
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
]);

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`joint activation preflight returned an invalid count: ${fieldName}`);
  }
}

function assertSha256Hex(value, fieldName) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`joint activation preflight returned an invalid digest: ${fieldName}`);
  }
}

function assertIsoTimestamp(value, fieldName) {
  const match =
    typeof value === "string"
      ? value.match(STRICT_UTC_TIMESTAMP_PATTERN)
      : null;
  if (!match) {
    throw new Error(`joint storage inventory sample returned an invalid timestamp: ${fieldName}`);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    microseconds,
  ] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(microseconds.slice(0, 3)),
    ),
  );
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)
  ) {
    throw new Error(`joint storage inventory sample returned an invalid timestamp: ${fieldName}`);
  }
}

function assertStrictAuthInboundFks(value) {
  if (!Array.isArray(value)) {
    throw new Error("joint activation preflight returned invalid auth_inbound_fks inventory");
  }
  for (const item of value) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || typeof item.schema_name !== "string"
      || typeof item.table_name !== "string"
      || typeof item.constraint_name !== "string"
      || typeof item.delete_action !== "string"
    ) {
      throw new Error("joint activation preflight returned invalid auth_inbound_fks inventory");
    }
  }
}

function assertStrictPublicUserInboundFks(value) {
  if (!Array.isArray(value)) {
    throw new Error("joint activation preflight returned invalid public_user_inbound_fks inventory");
  }
  for (const item of value) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || typeof item.schema_name !== "string"
      || typeof item.table_name !== "string"
      || typeof item.constraint_name !== "string"
      || typeof item.column_name !== "string"
      || typeof item.delete_action !== "string"
    ) {
      throw new Error("joint activation preflight returned invalid public_user_inbound_fks inventory");
    }
  }
}

function assertStrictPersonalOwnerSources(value) {
  if (!Array.isArray(value)) {
    throw new Error("joint activation preflight returned invalid personal_owner_sources inventory");
  }

  const sourceNames = [];
  for (const item of value) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || typeof item.source_name !== "string"
    ) {
      throw new Error("joint activation preflight returned invalid personal_owner_sources inventory");
    }
    assertNonNegativeInteger(item.owner_count, `${item.source_name} owner_count`);
    sourceNames.push(item.source_name);
  }

  const sortedNames = [...sourceNames].sort();
  if (
    sortedNames.length !== EXPECTED_PERSONAL_OWNER_SOURCE_NAMES.length
    || sortedNames.some(
      (sourceName, index) => sourceName !== EXPECTED_PERSONAL_OWNER_SOURCE_NAMES[index],
    )
  ) {
    throw new Error("joint activation preflight returned invalid personal_owner_sources inventory");
  }
}

function assertStrictPersonalOwnerUuidColumns(value) {
  if (!Array.isArray(value)) {
    throw new Error("joint activation preflight returned invalid personal_owner_uuid_columns inventory");
  }

  for (const item of value) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || typeof item.schema_name !== "string"
      || typeof item.table_name !== "string"
      || typeof item.column_name !== "string"
      || typeof item.classification !== "string"
      || !ALLOWED_PERSONAL_OWNER_CLASSIFICATIONS.has(item.classification)
    ) {
      throw new Error("joint activation preflight returned invalid personal_owner_uuid_columns inventory");
    }
  }
}

function uniqueBlockers(blockers) {
  return [...new Set(blockers)];
}

export function parseAccountGenerationLinkedDatabaseEnvironment({
  output,
}) {
  const environment = {};

  for (const line of String(output ?? "").split(/\r?\n/u)) {
    const match = line.match(
      /^export ([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|(\S+))$/u,
    );
    if (!match || !LINKED_DATABASE_ENVIRONMENT_KEYS.includes(match[1])) continue;
    environment[match[1]] = match[2] ?? match[3] ?? match[4];
  }

  if (
    LINKED_DATABASE_ENVIRONMENT_KEYS.some(
      (name) => typeof environment[name] !== "string" || environment[name] === "",
    )
  ) {
    throw new Error("linked Supabase database environment is incomplete");
  }

  return environment;
}

export function assessAccountGenerationJointActivationPreflightResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("joint activation preflight did not return a JSON object");
  }

  const countFields = [
    "capability_count",
    "watermark_count",
    "lifecycle_count",
    "cutover_nonterminal_attempt_count",
    "cutover_staging_count",
    "legacy_external_write_nonterminal_count",
    "auth_deletion_outbox_nonterminal_count",
    "auth_deletion_outbox_dead_letter_count",
    "recipe_image_registry_nonterminal_count",
    "storage_deletion_outbox_nonterminal_count",
    "storage_deletion_outbox_dead_letter_count",
    "auth_user_count",
    "public_user_count",
    "auth_public_intersection_count",
    "auth_only_count",
    "public_only_count",
    "legacy_receipt_count",
    "current_auth_identity_exact_match_count",
    "personal_owner_count",
    "personal_owner_without_identity_count",
    "personal_owner_inventory_unknown_count",
    "personal_owner_inventory_missing_count",
    "remote_writes",
  ];

  for (const fieldName of countFields) {
    assertNonNegativeInteger(result[fieldName], fieldName);
  }

  assertSha256Hex(result.auth_user_digest, "auth_user_digest");
  assertSha256Hex(result.public_user_digest, "public_user_digest");
  assertSha256Hex(result.personal_owner_digest, "personal_owner_digest");
  assertStrictAuthInboundFks(result.auth_inbound_fks);
  assertStrictPublicUserInboundFks(result.public_user_inbound_fks);
  assertStrictPersonalOwnerSources(result.personal_owner_sources);
  assertStrictPersonalOwnerUuidColumns(result.personal_owner_uuid_columns);

  if (
    result.auth_public_intersection_count + result.auth_only_count
      !== result.auth_user_count
    || result.auth_public_intersection_count + result.public_only_count
      !== result.public_user_count
  ) {
    throw new Error(
      "joint activation preflight returned inconsistent identity aggregate counts",
    );
  }
  if (
    result.current_auth_identity_exact_match_count > result.legacy_receipt_count
    || result.current_auth_identity_exact_match_count > result.auth_user_count
  ) {
    throw new Error(
      "joint activation preflight returned an impossible current auth identity exact-match aggregate",
    );
  }
  if (result.personal_owner_without_identity_count > result.personal_owner_count) {
    throw new Error(
      "joint activation preflight returned an impossible personal owner identity aggregate",
    );
  }
  if (result.personal_owner_count < result.public_user_count) {
    throw new Error(
      "joint activation preflight returned an impossible personal owner aggregate",
    );
  }
  const publicUsersPersonalOwnerSource = result.personal_owner_sources.find(
    (item) => item.source_name === "public.users",
  );
  if (
    !publicUsersPersonalOwnerSource
    || publicUsersPersonalOwnerSource.owner_count !== result.public_user_count
  ) {
    throw new Error(
      "joint activation preflight returned an impossible personal owner source aggregate",
    );
  }
  if (
    result.personal_owner_sources.some(
      (item) => item.owner_count > result.personal_owner_count,
    )
  ) {
    throw new Error(
      "joint activation preflight returned an impossible personal owner source aggregate",
    );
  }

  const readinessBlockers = [];

  if (
    result.capability_count !== 1
    || result.capability?.state !== "legacy"
    || !Number.isInteger(result.capability?.revision)
    || result.capability.revision <= 0
    || result.capability.current_cutover_attempt_id !== null
  ) {
    readinessBlockers.push("database_capability_not_legacy");
  }

  if (result.watermark_count !== 0) readinessBlockers.push("database_watermarks_not_zero");
  if (result.lifecycle_count !== 0) readinessBlockers.push("database_lifecycles_not_zero");
  if (result.cutover_nonterminal_attempt_count !== 0) {
    readinessBlockers.push("database_cutover_nonterminal_attempts_not_zero");
  }
  if (result.cutover_staging_count !== 0) readinessBlockers.push("database_cutover_staging_not_zero");
  if (result.legacy_external_write_nonterminal_count !== 0) {
    readinessBlockers.push("database_legacy_external_write_nonterminal");
  }
  if (result.auth_deletion_outbox_nonterminal_count !== 0) {
    readinessBlockers.push("database_auth_deletion_outbox_nonterminal");
  }
  if (result.auth_deletion_outbox_dead_letter_count !== 0) {
    readinessBlockers.push("database_auth_deletion_outbox_dead_letter");
  }
  if (result.recipe_image_registry_nonterminal_count !== 0) {
    readinessBlockers.push("database_recipe_image_registry_nonterminal");
  }
  if (result.storage_deletion_outbox_nonterminal_count !== 0) {
    readinessBlockers.push("database_storage_deletion_outbox_nonterminal");
  }
  if (result.storage_deletion_outbox_dead_letter_count !== 0) {
    readinessBlockers.push("database_storage_deletion_outbox_dead_letter");
  }
  if (result.remote_writes !== 0) {
    readinessBlockers.push("database_remote_writes_not_zero");
  }

  const databaseReady = readinessBlockers.length === 0;
  const stagingBlockers =
    result.auth_only_count > 0 || result.public_only_count > 0
      ? ["identity_population_requires_staging"]
      : [];
  const personalOwnerInventoryBlockers =
    result.personal_owner_inventory_unknown_count > 0
    || result.personal_owner_inventory_missing_count > 0
      ? ["personal_owner_universe_inventory_drift"]
      : [];

  return {
    ready: false,
    databaseReady,
    remoteWrites: result.remote_writes,
    blockers: uniqueBlockers([
      ...readinessBlockers,
      ...stagingBlockers,
      ...personalOwnerInventoryBlockers,
      ...PREFLIGHT_MANUAL_BLOCKERS,
    ]),
  };
}

export function assertAccountGenerationJointStorageInventorySampleResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("joint storage inventory sample did not return a JSON object");
  }

  const resultKeys = Object.keys(result).sort();
  const allowedKeys = [...ACCOUNT_GENERATION_SAMPLE_ALLOWED_KEYS].sort();
  if (
    resultKeys.length !== allowedKeys.length
    || resultKeys.some((key, index) => key !== allowedKeys[index])
  ) {
    throw new Error("joint storage inventory sample must contain only safe summary keys");
  }

  assertIsoTimestamp(result.sampled_at, "sampled_at");
  if (result.capability_state !== "cutover_maintenance") {
    throw new Error("joint storage inventory sample requires capability_state=cutover_maintenance");
  }
  assertNonNegativeInteger(result.capability_revision, "capability_revision");
  if (result.capability_revision <= 0) {
    throw new Error("joint storage inventory sample requires a positive capability revision");
  }
  assertSha256Hex(
    result.capability_cutover_attempt_digest,
    "capability_cutover_attempt_digest",
  );

  for (const fieldName of ACCOUNT_GENERATION_SAMPLE_COUNT_FIELDS) {
    assertNonNegativeInteger(result[fieldName], fieldName);
  }
  for (const fieldName of ACCOUNT_GENERATION_SAMPLE_DIGEST_FIELDS) {
    assertSha256Hex(result[fieldName], fieldName);
  }

  if (
    result.owner_signal_3_way_union_count < result.owner_id_signal_count
    || result.owner_signal_3_way_union_count
      < result.strict_legacy_path_signal_count
    || result.owner_signal_3_way_union_count < result.registry_signal_count
  ) {
    throw new Error(
      "joint storage inventory sample returned inconsistent owner signal counts",
    );
  }

  if (result.remote_writes !== 0) {
    throw new Error("joint storage inventory sample requires remote_writes=0");
  }

  return result;
}

export function assessAccountGenerationJointStorageInventorySampleResult(result) {
  const sample = assertAccountGenerationJointStorageInventorySampleResult(result);
  const blockers = [];

  if (sample.external_write_nonterminal_count !== 0) {
    blockers.push("external_write_nonterminal_not_zero");
  }
  if (sample.owner_signal_3_way_union_count !== 0) {
    blockers.push("owner_signal_union_not_zero");
  }
  if (sample.owned_unverified_count !== 0) {
    blockers.push("owned_unverified_not_zero");
  }
  if (sample.owner_path_unverified_count !== 0) {
    blockers.push("owner_path_unverified_not_zero");
  }
  if (sample.known_public_shared_rehome_pending_count !== 0) {
    blockers.push("known_public_shared_rehome_pending_not_zero");
  }
  if (sample.known_private_cleanup_pending_count !== 0) {
    blockers.push("known_private_cleanup_pending_not_zero");
  }
  if (sample.known_private_cleanup_outbox_nonterminal_count !== 0) {
    blockers.push("known_private_cleanup_outbox_nonterminal_not_zero");
  }
  if (sample.known_private_cleanup_outbox_dead_letter_count !== 0) {
    blockers.push("known_private_cleanup_outbox_dead_letter_not_zero");
  }
  if (sample.known_private_cleanup_outbox_generation_mismatch_count !== 0) {
    blockers.push("known_private_cleanup_outbox_generation_mismatch_not_zero");
  }
  if (sample.known_private_cleanup_outbox_registry_mismatch_count !== 0) {
    blockers.push("known_private_cleanup_outbox_registry_mismatch_not_zero");
  }

  return {
    ready: false,
    blockers: uniqueBlockers([
      ...blockers,
      ...STORAGE_SAMPLE_MANUAL_BLOCKERS,
    ]),
    safeSummary: {
      remote_writes: sample.remote_writes,
      external_write_nonterminal_count:
        sample.external_write_nonterminal_count,
      owner_id_signal_count: sample.owner_id_signal_count,
      strict_legacy_path_signal_count:
        sample.strict_legacy_path_signal_count,
      registry_signal_count: sample.registry_signal_count,
      owner_signal_3_way_union_count:
        sample.owner_signal_3_way_union_count,
      owned_unverified_count: sample.owned_unverified_count,
      owner_path_unverified_count: sample.owner_path_unverified_count,
      known_public_shared_rehome_terminal_count:
        sample.known_public_shared_rehome_terminal_count,
      known_public_shared_rehome_pending_count:
        sample.known_public_shared_rehome_pending_count,
      known_private_cleanup_terminal_count:
        sample.known_private_cleanup_terminal_count,
      known_private_cleanup_pending_count:
        sample.known_private_cleanup_pending_count,
      known_private_cleanup_outbox_nonterminal_count:
        sample.known_private_cleanup_outbox_nonterminal_count,
      known_private_cleanup_outbox_dead_letter_count:
        sample.known_private_cleanup_outbox_dead_letter_count,
      known_private_cleanup_outbox_generation_mismatch_count:
        sample.known_private_cleanup_outbox_generation_mismatch_count,
      known_private_cleanup_outbox_registry_mismatch_count:
        sample.known_private_cleanup_outbox_registry_mismatch_count,
    },
  };
}

export function compareAccountGenerationJointStorageInventorySamples({
  firstSample,
  secondSample,
  minimumIntervalSeconds,
} = {}) {
  if (
    minimumIntervalSeconds !== undefined
    && minimumIntervalSeconds !== 900
  ) {
    throw new Error("joint storage inventory sample minimum interval is fixed at 900 seconds");
  }

  const first = assertAccountGenerationJointStorageInventorySampleResult(firstSample);
  const second = assertAccountGenerationJointStorageInventorySampleResult(secondSample);

  const firstTimestamp = parseStrictUtcTimestampMicroseconds(
    first.sampled_at,
    "firstSample.sampled_at",
  );
  const secondTimestamp = parseStrictUtcTimestampMicroseconds(
    second.sampled_at,
    "secondSample.sampled_at",
  );
  if (secondTimestamp <= firstTimestamp) {
    throw new Error("joint storage inventory second sample must be later than the first sample");
  }
  const intervalMicroseconds = secondTimestamp - firstTimestamp;
  const intervalSeconds = Number(intervalMicroseconds) / 1_000_000;

  if (intervalMicroseconds < 900_000_000n) {
    throw new Error(
      "joint storage inventory samples must be at least 900 seconds apart",
    );
  }
  if (first.capability_revision !== second.capability_revision) {
    throw new Error("joint storage inventory samples must keep the same capability revision");
  }
  if (
    first.capability_cutover_attempt_digest
    !== second.capability_cutover_attempt_digest
  ) {
    throw new Error("joint storage inventory samples must keep the same cutover attempt digest");
  }

  for (const fieldName of ACCOUNT_GENERATION_SAMPLE_DIGEST_FIELDS) {
    if (first[fieldName] !== second[fieldName]) {
      throw new Error(`joint storage inventory samples must keep a stable digest: ${fieldName}`);
    }
  }

  for (const fieldName of [
    "external_write_nonterminal_count",
    "owner_id_signal_count",
    "strict_legacy_path_signal_count",
    "registry_signal_count",
    "owner_signal_3_way_union_count",
    "owned_unverified_count",
    "owner_path_unverified_count",
    "known_public_shared_rehome_terminal_count",
    "known_public_shared_rehome_pending_count",
    "known_private_cleanup_terminal_count",
    "known_private_cleanup_pending_count",
    "known_private_cleanup_outbox_nonterminal_count",
    "known_private_cleanup_outbox_dead_letter_count",
    "known_private_cleanup_outbox_generation_mismatch_count",
    "known_private_cleanup_outbox_registry_mismatch_count",
  ]) {
    if (first[fieldName] !== second[fieldName]) {
      throw new Error(`joint storage inventory samples must keep stable counts: ${fieldName}`);
    }
  }

  if (
    first.external_write_nonterminal_count !== 0
    || first.owner_signal_3_way_union_count !== 0
    || first.owned_unverified_count !== 0
    || first.owner_path_unverified_count !== 0
    || first.known_public_shared_rehome_pending_count !== 0
    || first.known_private_cleanup_pending_count !== 0
    || first.known_private_cleanup_outbox_nonterminal_count !== 0
    || first.known_private_cleanup_outbox_dead_letter_count !== 0
    || first.known_private_cleanup_outbox_generation_mismatch_count !== 0
    || first.known_private_cleanup_outbox_registry_mismatch_count !== 0
  ) {
    throw new Error(
      "joint storage inventory samples must reject stable nonzero gate blockers",
    );
  }

  return {
    ok: true,
    intervalSeconds,
    capability_revision: first.capability_revision,
    capability_cutover_attempt_digest:
      first.capability_cutover_attempt_digest,
    stable_digests: {
      owner_signal_digest: first.owner_signal_digest,
      owned_unverified_digest: first.owned_unverified_digest,
      owner_path_unverified_digest: first.owner_path_unverified_digest,
      known_public_shared_rehome_digest:
        first.known_public_shared_rehome_digest,
      known_private_cleanup_digest: first.known_private_cleanup_digest,
    },
    stable_counts: {
      external_write_nonterminal_count:
        first.external_write_nonterminal_count,
      owner_id_signal_count: first.owner_id_signal_count,
      strict_legacy_path_signal_count:
        first.strict_legacy_path_signal_count,
      registry_signal_count: first.registry_signal_count,
      owner_signal_3_way_union_count:
        first.owner_signal_3_way_union_count,
      owned_unverified_count: first.owned_unverified_count,
      owner_path_unverified_count: first.owner_path_unverified_count,
      known_public_shared_rehome_terminal_count:
        first.known_public_shared_rehome_terminal_count,
      known_public_shared_rehome_pending_count:
        first.known_public_shared_rehome_pending_count,
      known_private_cleanup_terminal_count:
        first.known_private_cleanup_terminal_count,
      known_private_cleanup_pending_count:
        first.known_private_cleanup_pending_count,
      known_private_cleanup_outbox_nonterminal_count:
        first.known_private_cleanup_outbox_nonterminal_count,
      known_private_cleanup_outbox_dead_letter_count:
        first.known_private_cleanup_outbox_dead_letter_count,
      known_private_cleanup_outbox_generation_mismatch_count:
        first.known_private_cleanup_outbox_generation_mismatch_count,
      known_private_cleanup_outbox_registry_mismatch_count:
        first.known_private_cleanup_outbox_registry_mismatch_count,
    },
  };
}

export function assertAccountGenerationJointStorageInventoryEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("storage inventory sample envelope must be a JSON object");
  }

  const allowedKeys = ["assessment", "mergeSha", "mode", "ok", "result"];
  const envelopeKeys = Object.keys(envelope).sort();
  const sortedAllowedKeys = [...allowedKeys].sort();
  if (
    envelopeKeys.length !== sortedAllowedKeys.length
    || envelopeKeys.some((key, index) => key !== sortedAllowedKeys[index])
  ) {
    throw new Error("storage inventory sample envelope must contain only safe keys");
  }
  if (envelope.mode !== "joint-storage-inventory-sample") {
    throw new Error("storage inventory sample envelope must keep the sample mode");
  }
  if (typeof envelope.ok !== "boolean") {
    throw new Error("storage inventory sample envelope must include boolean ok");
  }
  if (typeof envelope.mergeSha !== "string" || !GIT_SHA_PATTERN.test(envelope.mergeSha)) {
    throw new Error("storage inventory sample envelope must include a valid mergeSha");
  }

  const result = assertAccountGenerationJointStorageInventorySampleResult(
    envelope.result,
  );
  const assessment = envelope.assessment;
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) {
    throw new Error("storage inventory sample envelope must include assessment");
  }
  if (assessment.ready !== false) {
    throw new Error("storage inventory sample envelope assessment must stay not-ready");
  }
  if (!Array.isArray(assessment.blockers)) {
    throw new Error("storage inventory sample envelope assessment blockers must be an array");
  }
  if (!assessment.safeSummary || typeof assessment.safeSummary !== "object" || Array.isArray(assessment.safeSummary)) {
    throw new Error("storage inventory sample envelope assessment must include safeSummary");
  }

  return {
    ok: envelope.ok,
    mode: envelope.mode,
    mergeSha: envelope.mergeSha,
    result,
    assessment,
  };
}

export function readAccountGenerationJointStorageInventoryEnvelope({
  filePath,
}) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  return assertAccountGenerationJointStorageInventoryEnvelope(parsed);
}

export function compareAccountGenerationJointStorageInventoryEnvelopes({
  firstEnvelope,
  secondEnvelope,
}) {
  const first = assertAccountGenerationJointStorageInventoryEnvelope(firstEnvelope);
  const second = assertAccountGenerationJointStorageInventoryEnvelope(secondEnvelope);

  if (first.mergeSha !== second.mergeSha) {
    throw new Error("storage inventory sample envelopes must keep the same mergeSha");
  }

  return {
    ok: true,
    mode: "joint-storage-inventory-sample-compare",
    mergeSha: first.mergeSha,
    comparison: compareAccountGenerationJointStorageInventorySamples({
      firstSample: first.result,
      secondSample: second.result,
    }),
  };
}

function parseStrictUtcTimestampMicroseconds(value, fieldName) {
  const match =
    typeof value === "string"
      ? value.match(STRICT_UTC_TIMESTAMP_PATTERN)
      : null;
  if (!match) {
    throw new Error(`joint storage inventory sample returned an invalid timestamp: ${fieldName}`);
  }
  const [, year, month, day, hour, minute, second, microseconds] = match;
  const milliseconds = Number(microseconds.slice(0, 3));
  const epochMilliseconds = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  const date = new Date(epochMilliseconds);
  if (
    Number.isNaN(epochMilliseconds)
    || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)
  ) {
    throw new Error(`joint storage inventory sample returned an invalid timestamp: ${fieldName}`);
  }
  return BigInt(epochMilliseconds) * 1000n + BigInt(microseconds.slice(3));
}

export function buildAccountGenerationRemoteVerificationPlan({ mode }) {
  if (mode === "inventory") {
    assertAccountGenerationReadOnlyVerificationSql({
      sql: INVENTORY_SQL,
      fieldName: "inventory verification SQL",
    });
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: false,
      requiresCutoverSharedLock: false,
      sql: INVENTORY_SQL,
    };
  }

  if (mode === "post-merge-dark-ship") {
    assertAccountGenerationReadOnlyVerificationSql({
      sql: POST_MERGE_DARK_SHIP_SQL,
      fieldName: "post-merge dark-ship verification SQL",
    });
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCutoverSharedLock: false,
      sql: POST_MERGE_DARK_SHIP_SQL,
    };
  }

  if (mode === "joint-activation-preflight") {
    assertAccountGenerationReadOnlyVerificationSql({
      sql: JOINT_ACTIVATION_PREFLIGHT_SQL,
      fieldName: "joint activation preflight SQL",
    });
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCutoverSharedLock: false,
      sql: JOINT_ACTIVATION_PREFLIGHT_SQL,
    };
  }

  if (mode === "joint-storage-inventory-sample") {
    assertAccountGenerationReadOnlyVerificationSql({
      sql: JOINT_STORAGE_INVENTORY_SAMPLE_SQL,
      fieldName: "joint storage inventory sample SQL",
    });
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCutoverSharedLock: true,
      sql: JOINT_STORAGE_INVENTORY_SAMPLE_SQL,
    };
  }

  throw new Error(
    `unsupported account generation remote verification mode: ${mode ?? "missing"}`,
  );
}

export function buildAccountGenerationRemotePsqlRequest({
  baseEnvironment = {},
  databaseEnvironment,
  planSql,
  requiresCutoverSharedLock = false,
}) {
  const environment = {};
  for (const [name, value] of Object.entries(baseEnvironment)) {
    if (!/^PG/u.test(name)) {
      environment[name] = value;
    }
  }
  for (const name of LINKED_DATABASE_ENVIRONMENT_KEYS) {
    environment[name] = databaseEnvironment[name];
  }
  environment.PGSSLMODE = "require";

  return {
    args: ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    input: [
      "begin transaction isolation level read committed read only;",
      ...(requiresCutoverSharedLock ? [CUTOVER_SHARED_LOCK_PRELUDE] : []),
      planSql,
      "commit;",
    ].join("\n"),
    environment,
  };
}

export function assertAccountGenerationMergedExactSource({
  head,
  originMaster,
  trackedStatus,
}) {
  if (head !== originMaster) {
    throw new Error(
      "account generation remote verification requires HEAD to equal origin/master",
    );
  }
  if (trackedStatus !== "") {
    throw new Error(
      "account generation remote verification requires a clean worktree",
    );
  }
  return head;
}

export function assertAccountGenerationRemoteVerificationResult({
  mode,
  result,
}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("remote verification did not return a JSON object");
  }

  if (mode === "inventory") {
    if (!Array.isArray(result.auth_inbound_fks) || !Array.isArray(result.f0_functions)) {
      throw new Error("remote inventory is incomplete");
    }
    return;
  }

  if (mode === "joint-activation-preflight") {
    assessAccountGenerationJointActivationPreflightResult(result);
    return;
  }

  if (mode === "joint-storage-inventory-sample") {
    assertAccountGenerationJointStorageInventorySampleResult(result);
    return;
  }

  if (mode !== "post-merge-dark-ship") {
    throw new Error(`unsupported account generation remote result mode: ${mode}`);
  }

  if (
    result.capability_count !== 1
    || result.capability?.state !== "legacy"
    || !Number.isInteger(result.capability?.revision)
    || result.capability.revision <= 0
    || result.capability.current_cutover_attempt_id !== null
    || result.watermark_count !== 0
    || result.lifecycle_count !== 0
  ) {
    throw new Error(
      "remote F0 is not a legacy dark ship with canonical authority at zero",
    );
  }
}
