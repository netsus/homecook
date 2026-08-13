import { createHash } from "node:crypto";

const INCLUDED_RELATIONS = new Set([
  "auth.identities",
  "auth.users",
  "storage.buckets",
  "storage.objects",
]);

const EXCLUDED_RELATIONS = new Set([
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
]);

const COPY_HEADER = /^COPY\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)\.(?:"[^"]+"|[a-zA-Z_][\w$]*))\s+\(([^)]*)\)\s+FROM\s+stdin;\s*$/;

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
    if (action === "include") {
      output.push(...block);
    }
  }

  const relationClassification = relations.map(({ action, columns, relation }) => ({
    action,
    columns,
    relation,
  }));

  return {
    manifest: {
      relation_classification_digest: digest(relationClassification),
      relations,
      transient_promote_count: 0,
      unclassified: [],
    },
    sql: output.join("\n"),
  };
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
