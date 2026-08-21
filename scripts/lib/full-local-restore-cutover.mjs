import { createHash } from "node:crypto";

const INCLUDED_RELATIONS = new Set([
  "auth.identities",
  "auth.schema_migrations",
  "auth.users",
  "private.full_local_auth_control",
  "private.full_local_session_observability",
  "private.remote_auth_identity_epochs",
  "private.youtube_extraction_current_policy",
  "private.youtube_extraction_worker_credentials",
  "storage.buckets",
  "storage.migrations",
  "storage.objects",
]);

const EXCLUDED_RELATIONS = new Set([
  "private.auth_flow_attempts",
  "auth.audit_log_entries",
  "auth.custom_oauth_providers",
  "auth.flow_state",
  "auth.instances",
  "auth.mfa_amr_claims",
  "auth.mfa_challenges",
  "auth.mfa_factors",
  "auth.oauth_authorizations",
  "auth.oauth_client_states",
  "auth.oauth_clients",
  "auth.oauth_consents",
  "auth.one_time_tokens",
  "auth.refresh_tokens",
  "auth.saml_providers",
  "auth.saml_relay_states",
  "auth.sessions",
  "auth.sso_domains",
  "auth.sso_providers",
  "auth.webauthn_challenges",
  "auth.webauthn_credentials",
  "storage.buckets_analytics",
  "storage.buckets_vectors",
  "storage.iceberg_namespaces",
  "storage.iceberg_tables",
  "storage.s3_multipart_uploads",
  "storage.s3_multipart_uploads_parts",
  "storage.vector_indexes",
  "supabase_functions.hooks",
  "vault.secrets",
]);

const COPY_HEADER = /^COPY\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)\.(?:"[^"]+"|[a-zA-Z_][\w$]*))\s+\(([^)]*)\)\s+FROM\s+stdin;\s*$/;
const PGDUMP_RESTRICT_LINE = /^\\restrict\s+([A-Za-z0-9]+)\s*$/u;
const PGDUMP_UNRESTRICT_LINE = /^\\unrestrict\s+([A-Za-z0-9]+)\s*$/u;
const SAFE_DOCKER_RESOURCE_NAME = /^[a-z0-9][a-z0-9_.-]{2,127}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const DIGEST_PIN = /^.+@sha256:[0-9a-f]{64}$/u;
const SERVICE_LEDGER_KEYS = Object.freeze({
  "auth.schema_migrations": "auth_schema_migrations",
  "storage.migrations": "storage_migrations",
});

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function validSha256(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function validPinnedDigest(value) {
  return typeof value === "string" && DIGEST_PIN.test(value);
}

function normalizeServiceLedgers(serviceLedgers) {
  if (!serviceLedgers || typeof serviceLedgers !== "object" || Array.isArray(serviceLedgers)) {
    throw new Error("Platform service restore attestation requires exact service ledger digests");
  }
  const normalized = {};
  for (const key of Object.values(SERVICE_LEDGER_KEYS)) {
    const ledger = serviceLedgers[key];
    if (
      !ledger
      || !validSha256(ledger.digest_sha256)
      || !Number.isSafeInteger(ledger.row_count)
      || ledger.row_count < 0
    ) {
      throw new Error("Platform service restore attestation requires exact service ledger digests");
    }
    normalized[key] = Object.freeze({
      digest_sha256: ledger.digest_sha256,
      row_count: ledger.row_count,
    });
  }
  return Object.freeze(normalized);
}

/**
 * @param {{
 *   components: Record<string, string>,
 *   expected?: unknown,
 *   schemaCatalogSha256: string,
 *   serviceImages: { auth: string, storage: string },
 *   serviceLedgers: Record<string, { digest_sha256: string, row_count: number }>,
 * }} input
 */
export function buildPlatformServiceRestoreAttestation({
  components,
  expected = undefined,
  schemaCatalogSha256,
  serviceImages,
  serviceLedgers,
}) {
  const componentKeys = [
    "data_sha256",
    "roles_sha256",
    "schema_sha256",
    "storage_payload_sha256",
  ];
  const normalizedComponents = {};
  for (const key of componentKeys) {
    if (!validSha256(components?.[key])) {
      throw new Error("Platform service restore attestation requires exact component digests");
    }
    normalizedComponents[key] = components[key];
  }
  if (
    !validSha256(schemaCatalogSha256)
    || !validPinnedDigest(serviceImages?.auth)
    || !validPinnedDigest(serviceImages?.storage)
  ) {
    throw new Error("Platform service restore attestation requires exact service schema and image digests");
  }
  const observed = Object.freeze({
    component_set_sha256: digest(normalizedComponents),
    schema_catalog_sha256: schemaCatalogSha256,
    service_images: Object.freeze({
      auth: serviceImages.auth,
      storage: serviceImages.storage,
    }),
    service_ledgers: normalizeServiceLedgers(serviceLedgers),
  });
  if (expected !== undefined && stableJson(observed) !== stableJson(expected)) {
    throw new Error("Platform service restore attestation mismatch");
  }
  return observed;
}

function normalizeIdentifier(identifier) {
  return identifier
    .split(".")
    .map((part) => part.startsWith('"') ? part.slice(1, -1).replaceAll('""', '"') : part)
    .join(".");
}

function classifyRelation(relation) {
  if (INCLUDED_RELATIONS.has(relation) || relation.startsWith("public.")) {
    return "include";
  }
  if (EXCLUDED_RELATIONS.has(relation)) {
    return "exclude";
  }
  throw new Error(`Unclassified platform restore relation: ${relation}`);
}

function canonicalizePgDumpRestrictPair(sql) {
  const lines = sql.split("\n");
  let restrictIndex = null;
  let unrestrictIndex = null;
  let restrictKey = null;
  let unrestrictKey = null;

  for (const [index, line] of lines.entries()) {
    if (line.startsWith("\\restrict")) {
      const match = line.match(PGDUMP_RESTRICT_LINE);
      if (!match || restrictIndex !== null) {
        throw new Error("Platform data semantic digest requires one safe matching pg_dump restrict/unrestrict pair");
      }
      restrictIndex = index;
      restrictKey = match[1];
      continue;
    }
    if (line.startsWith("\\unrestrict")) {
      const match = line.match(PGDUMP_UNRESTRICT_LINE);
      if (!match || unrestrictIndex !== null) {
        throw new Error("Platform data semantic digest requires one safe matching pg_dump restrict/unrestrict pair");
      }
      unrestrictIndex = index;
      unrestrictKey = match[1];
    }
  }

  if (restrictIndex === null && unrestrictIndex === null) {
    return sql;
  }
  if (
    restrictIndex === null
    || unrestrictIndex === null
    || restrictIndex >= unrestrictIndex
    || restrictKey !== unrestrictKey
  ) {
    throw new Error("Platform data semantic digest requires one safe matching pg_dump restrict/unrestrict pair");
  }

  return lines.filter((_line, index) => index !== restrictIndex && index !== unrestrictIndex).join("\n");
}

export function digestSemanticPlatformDataSql(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("Platform data SQL must be a string");
  }
  return createHash("sha256")
    .update(canonicalizePgDumpRestrictPair(sql))
    .digest("hex");
}

export function assertFreshRestoreAllowed({
  postgresVolumeExists,
  storageVolumeExists,
}) {
  if (postgresVolumeExists || storageVolumeExists) {
    throw new Error("Platform restore requires fresh named volumes; existing local rehearsal data must not be merged");
  }
  return true;
}

export function assertFreshRestoreExecutionApproved({ confirmation }) {
  if (confirmation !== "RESTORE_VERIFIED_BACKUP_TO_FRESH_VOLUMES") {
    throw new Error(
      "Fresh platform restore requires --confirm-fresh-restore RESTORE_VERIFIED_BACKUP_TO_FRESH_VOLUMES",
    );
  }
  return true;
}

export function buildBootstrapAwareDatabaseResetSql() {
  return [
    "\\set ON_ERROR_STOP on",
    "SELECT pg_terminate_backend(pid)",
    "FROM pg_catalog.pg_stat_activity",
    "WHERE datname = 'postgres' AND pid <> pg_backend_pid();",
    "DROP DATABASE IF EXISTS postgres WITH (FORCE);",
    "CREATE DATABASE postgres WITH TEMPLATE template0 OWNER supabase_admin;",
    "",
  ].join("\n");
}

function exactDockerResourceName(value, label) {
  if (typeof value !== "string" || !SAFE_DOCKER_RESOURCE_NAME.test(value)) {
    throw new Error(`${label} must be an exact safe Docker resource name`);
  }
  return value;
}

export function buildComposeLabeledStorageVolumeCreateArgs({
  attemptToken,
  composeProject,
  volumeName,
}) {
  const project = exactDockerResourceName(composeProject, "Compose project");
  const attempt = exactDockerResourceName(attemptToken, "Restore attempt token");
  const volume = exactDockerResourceName(volumeName, "Storage volume");
  return [
    "volume",
    "create",
    "--label",
    `com.docker.compose.project=${project}`,
    "--label",
    "com.docker.compose.volume=storage-data",
    "--label",
    `homecook.local/restore-attempt=${attempt}`,
    volume,
  ];
}

export function assertRestoredStorageVolumeProvenance({
  attemptToken,
  composeProject,
  inspect,
  volumeName,
}) {
  const project = exactDockerResourceName(composeProject, "Compose project");
  const attempt = exactDockerResourceName(attemptToken, "Restore attempt token");
  const volume = exactDockerResourceName(volumeName, "Storage volume");
  if (
    !inspect
    || inspect.Name !== volume
    || inspect.Labels?.["com.docker.compose.project"] !== project
    || inspect.Labels?.["com.docker.compose.volume"] !== "storage-data"
    || inspect.Labels?.["homecook.local/restore-attempt"] !== attempt
  ) {
    throw new Error("Restored Storage volume Compose provenance labels mismatch");
  }
  return true;
}

export async function executeBootstrapAwarePlatformRestore({
  bootstrapServices,
  replayDatabase,
  resetDatabase,
  restoreStoragePayload,
  startPostgres,
  startServices,
  stopServices,
  verifyRestoreAttestation = async () => true,
  verifyResources,
  verifyRestoredPlatform,
}) {
  const steps = [
    bootstrapServices,
    stopServices,
    restoreStoragePayload,
    startPostgres,
    resetDatabase,
    replayDatabase,
    verifyRestoreAttestation,
    startServices,
    verifyResources,
  ];
  if (
    steps.some((step) => typeof step !== "function")
    || typeof verifyRestoredPlatform !== "function"
  ) {
    throw new TypeError("Complete bootstrap-aware platform restore steps are required");
  }
  for (const step of steps) await step();
  return verifyRestoredPlatform();
}

export function buildPlatformRestoreSql({ dataSql, rolesSql, schemaSql }) {
  for (const [label, value] of Object.entries({ dataSql, rolesSql, schemaSql })) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${label} is required for platform restore`);
    }
  }
  return [
    "\\set ON_ERROR_STOP on",
    rolesSql.trimEnd(),
    schemaSql.trimEnd(),
    "SET session_replication_role = replica;",
    dataSql.trimEnd(),
    "SET session_replication_role = origin;",
    "",
  ].join("\n");
}

export function inventoryPlatformDataRelations(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("Platform data SQL must be a string");
  }
  const relations = [];
  const lines = sql.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("COPY ")) continue;
    const match = line.match(COPY_HEADER);
    if (!match) throw new Error(`Unsupported COPY header: ${line}`);
    const relation = normalizeIdentifier(match[1]);
    const columns = match[2]
      .split(",")
      .map((column) => normalizeIdentifier(column.trim()))
      .filter(Boolean);
    let rowCount = 0;
    let terminated = false;
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index] === "\\.") {
        terminated = true;
        break;
      }
      rowCount += 1;
    }
    if (!terminated) throw new Error(`Unterminated COPY block: ${relation}`);
    relations.push({ columns, relation, row_count: rowCount });
  }
  return relations;
}

export function buildSanitizedPlatformData(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("Platform data SQL must be a string");
  }

  const lines = sql.split("\n");
  const output = [];
  const relations = [];
  const serviceLedgers = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("COPY ")) {
      output.push(line);
      continue;
    }

    const match = line.match(COPY_HEADER);
    if (!match) {
      throw new Error(`Unsupported COPY header: ${line}`);
    }

    const relation = normalizeIdentifier(match[1]);
    const columns = match[2]
      .split(",")
      .map((column) => normalizeIdentifier(column.trim()))
      .filter(Boolean);
    const action = classifyRelation(relation);
    const block = [line];
    let rowCount = 0;
    let terminated = false;

    for (index += 1; index < lines.length; index += 1) {
      const blockLine = lines[index];
      block.push(blockLine);
      if (blockLine === "\\.") {
        terminated = true;
        break;
      }
      rowCount += 1;
    }

    if (!terminated) {
      throw new Error(`Unterminated COPY block: ${relation}`);
    }

    relations.push({ action, columns, relation, row_count: rowCount });
    const serviceLedgerKey = SERVICE_LEDGER_KEYS[relation];
    if (action === "include" && serviceLedgerKey) {
      serviceLedgers[serviceLedgerKey] = Object.freeze({
        digest_sha256: digest({
          columns,
          relation,
          rows: block.slice(1, -1),
        }),
        row_count: rowCount,
      });
    }
    if (action === "include") {
      output.push(...block);
    }
  }

  const relationClassification = relations.map(({ action, columns, relation }) => ({
    action,
    columns,
    relation,
  }));
  const sanitizedSql = output.join("\n");

  return {
    manifest: {
      data_semantic_sha256: digestSemanticPlatformDataSql(sanitizedSql),
      relation_classification_digest: digest(relationClassification),
      relations,
      service_ledgers: Object.freeze(serviceLedgers),
      transient_promote_count: 0,
      unclassified: [],
    },
    sql: sanitizedSql,
  };
}

export function verifyRestoredPlatformDataSnapshot({
  restoredDataSql,
  sourceDataSha256,
  sourceDataSemanticSha256,
  sourceRelationClassificationDigest,
}) {
  const restored = buildSanitizedPlatformData(restoredDataSql);
  const restoredDataSha256 = createHash("sha256")
    .update(restored.sql)
    .digest("hex");
  if (
    !validSha256(sourceDataSha256)
    || !validSha256(sourceDataSemanticSha256)
    || !validSha256(sourceRelationClassificationDigest)
    || restored.manifest.data_semantic_sha256 !== sourceDataSemanticSha256
    || restored.manifest.relation_classification_digest
      !== sourceRelationClassificationDigest
  ) {
    throw new Error("Restored DB/Auth data does not match the authenticated archive");
  }
  return Object.freeze({
    restored_data_sha256: restoredDataSha256,
    restored_data_semantic_sha256: restored.manifest.data_semantic_sha256,
    restored_relation_classification_digest:
      restored.manifest.relation_classification_digest,
  });
}

export function assertDestructiveRestoreAllowed({ current, destructive, preRestoreBackup }) {
  if (destructive !== true) {
    throw new Error("Destructive restore requires an explicit destructive flag");
  }
  if (!preRestoreBackup || preRestoreBackup.verified !== true) {
    throw new Error("Destructive restore requires a verified pre-restore backup");
  }
  if (preRestoreBackup.encrypted !== true) {
    throw new Error("Pre-restore backup must be encrypted");
  }
  if (preRestoreBackup.project !== current?.project) {
    throw new Error("Pre-restore backup does not match the current project");
  }
  if (preRestoreBackup.database_digest !== current?.database_digest) {
    throw new Error("Pre-restore backup does not match the current database digest");
  }
  if (preRestoreBackup.storage_digest !== current?.storage_digest) {
    throw new Error("Pre-restore backup does not match the current storage digest");
  }
  return true;
}

export function compareRestoreReplayManifests(first, second) {
  const requiredFields = [
    "auth_identity_digest",
    "database_digest",
    "relation_classification_digest",
    "source_data_sha256",
    "source_data_semantic_sha256",
    "source_roles_sha256",
    "source_schema_sha256",
    "storage_digest",
  ];
  for (const manifest of [first, second]) {
    if (!manifest || manifest.transient_promote_count !== 0 || manifest.unclassified_count !== 0) {
      throw new Error("restore replay manifest contains transient or unclassified data");
    }
    if (requiredFields.some((field) => typeof manifest[field] !== "string" || manifest[field].length === 0)) {
      throw new Error("restore replay manifest is incomplete");
    }
  }
  if (requiredFields.some((field) => first[field] !== second[field])) {
    throw new Error("restore replay digest mismatch");
  }
  return { digest_match: true, restore_count: 2 };
}

function normalizeStorageManifest(objects) {
  if (!Array.isArray(objects)) {
    throw new TypeError("Storage manifest must be an array");
  }
  return objects
    .map((object) => ({
      bytes: object.bytes,
      mime: object.mime,
      owner_prefix: object.owner_prefix,
      path: object.path,
      referenced: object.referenced,
      sha256: object.sha256,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function compareStorageObjectManifests(sourceObjects, restoredObjects) {
  const source = normalizeStorageManifest(sourceObjects);
  const restored = normalizeStorageManifest(restoredObjects);
  if (stableJson(source) !== stableJson(restored)) {
    throw new Error("Storage manifest mismatch");
  }
  return {
    bytes: source.reduce((total, object) => total + object.bytes, 0),
    count: source.length,
    mismatch_count: 0,
    storage_digest: digest(source),
  };
}

export function buildCutoverPreflight({
  completeStorageBackupVerified,
  firstLocalMutationApproved,
  offMacRestoreCount,
  providerCallbackVerified,
  remoteOutstandingFlows,
  restoreReplayVerified,
  storageVerified,
  temporaryHostedS3CredentialRevoked,
}) {
  const blockers = [];
  if (completeStorageBackupVerified !== true) blockers.push("complete-storage-backup-verification-missing");
  if (restoreReplayVerified !== true) blockers.push("restore-replay-verification-missing");
  if (storageVerified !== true) blockers.push("storage-verification-missing");
  if (!Number.isInteger(offMacRestoreCount) || offMacRestoreCount < 2) blockers.push("two-off-mac-restores-required");
  if (providerCallbackVerified !== true) blockers.push("provider-callback-verification-missing");
  if (remoteOutstandingFlows !== 0) blockers.push("remote-outstanding-auth-flows-remain");
  if (temporaryHostedS3CredentialRevoked !== true) blockers.push("temporary-hosted-s3-credential-revocation-missing");
  if (firstLocalMutationApproved !== true) blockers.push("first-local-production-auth-mutation-approval-missing");
  return { blockers, ready: blockers.length === 0 };
}

export function classifyRollbackMode({ firstLocalMutationAt, jointDeltaExportVerified }) {
  if (!firstLocalMutationAt) {
    return { envOnlyRollbackAllowed: true, mode: "pre-floor" };
  }
  if (jointDeltaExportVerified !== true) {
    throw new Error("post-floor rollback requires joint Auth/DB/Storage delta evidence");
  }
  return { envOnlyRollbackAllowed: false, mode: "post-floor" };
}
