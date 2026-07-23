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

export function buildAccountGenerationRemoteVerificationPlan({ mode }) {
  if (mode === "inventory") {
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: false,
      sql: INVENTORY_SQL,
    };
  }

  if (mode === "post-merge-dark-ship") {
    return {
      mode,
      readOnly: true,
      requiresMergedOriginMaster: true,
      sql: POST_MERGE_DARK_SHIP_SQL,
    };
  }

  throw new Error(
    `unsupported account generation remote verification mode: ${mode ?? "missing"}`,
  );
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
