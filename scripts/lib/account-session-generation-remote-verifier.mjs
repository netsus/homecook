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

const MUTATING_SQL_PATTERN =
  /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu;

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
  'auth_inbound_fks', coalesce(
    (select jsonb_agg(to_jsonb(auth_inbound_fks) order by schema_name, table_name, constraint_name)
      from auth_inbound_fks),
    '[]'::jsonb
  ),
  'remote_writes', 0
);
`;

const PREFLIGHT_MANUAL_BLOCKERS = Object.freeze([
  "personal_owner_universe_inventory",
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
    "remote_writes",
  ];

  for (const fieldName of countFields) {
    assertNonNegativeInteger(result[fieldName], fieldName);
  }

  assertSha256Hex(result.auth_user_digest, "auth_user_digest");
  assertSha256Hex(result.public_user_digest, "public_user_digest");
  assertStrictAuthInboundFks(result.auth_inbound_fks);

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

  return {
    ready: false,
    databaseReady,
    remoteWrites: result.remote_writes,
    blockers: uniqueBlockers([
      ...readinessBlockers,
      ...stagingBlockers,
      ...PREFLIGHT_MANUAL_BLOCKERS,
    ]),
  };
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
      sql: JOINT_ACTIVATION_PREFLIGHT_SQL,
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
      "begin transaction read only;",
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
