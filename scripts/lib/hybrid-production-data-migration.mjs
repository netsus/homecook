function compareText(left, right) {
  return left.localeCompare(right);
}

function columnCompatible(source, target) {
  return source.name === target.name
    && source.type === target.type
    && source.nullable === target.nullable
    && source.defaultExpression === target.defaultExpression
    && source.identity === target.identity
    && source.generated === target.generated;
}

function safeQualifiedName(value) {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe qualified relation name: ${value}.`);
  }
  return value;
}

export function buildLegacyDataMigrationPlan({
  sourceTables,
  targetTables,
}) {
  const targets = new Map(targetTables.map((table) => [table.name, table]));
  const transferTables = sourceTables.map((source) => {
    const target = targets.get(source.name);
    if (!target) {
      throw new Error(`Target is missing source table ${source.name}.`);
    }
    const targetColumns = new Map(
      target.columns.map((column) => [column.name, column]),
    );
    for (const column of source.columns) {
      const targetColumn = targetColumns.get(column.name);
      if (!targetColumn || !columnCompatible(column, targetColumn)) {
        throw new Error(
          `Target column is incompatible with ${source.name}.${column.name}.`,
        );
      }
    }
    const sourceColumnNames = new Set(
      source.columns.map((column) => column.name),
    );
    for (const column of target.columns) {
      if (
        !sourceColumnNames.has(column.name)
        && !column.nullable
        && column.defaultExpression === null
        && !column.identity
        && !column.generated
      ) {
        throw new Error(
          `Target-only column requires a value: ${target.name}.${column.name}.`,
        );
      }
    }
    return {
      columns: source.columns.map((column) => column.name),
      name: source.name,
      sourceRowCount: source.rowCount,
    };
  }).sort((left, right) => compareText(left.name, right.name));
  const sourceNames = new Set(sourceTables.map((table) => table.name));

  return Object.freeze({
    targetOnlyTables: targetTables
      .filter((table) => !sourceNames.has(table.name))
      .map((table) => table.name)
      .sort(compareText),
    transferTables,
    truncateTables: targetTables
      .map((table) => table.name)
      .sort(compareText),
  });
}

export function buildLegacyDataMigrationTransaction({
  dataSql,
  dryRun,
  evidenceSql,
  truncateTables,
}) {
  if (
    typeof dataSql !== "string"
    || typeof evidenceSql !== "string"
    || !Array.isArray(truncateTables)
    || truncateTables.length === 0
  ) {
    throw new Error("Migration transaction inputs are incomplete.");
  }
  const relations = truncateTables.map(safeQualifiedName).join(", ");
  return [
    "begin;",
    "set local lock_timeout = '15s';",
    "set local statement_timeout = '10min';",
    "lock table auth.users in share row exclusive mode;",
    `truncate table ${relations} restart identity;`,
    "set local session_replication_role = replica;",
    dataSql.trim(),
    "set local session_replication_role = origin;",
    "set constraints all deferred;",
    evidenceSql.trim(),
    dryRun ? "rollback;" : "commit;",
    "",
  ].join("\n");
}

export function assertLegacyEvidenceArchive({ entries, types }) {
  if (
    !Array.isArray(entries)
    || !Array.isArray(types)
    || entries.length !== types.length
    || entries.length === 0
  ) {
    throw new Error("Legacy archive listings are incomplete.");
  }
  const normalized = entries.map((entry) => entry.replace(/^\.\//u, ""));
  for (const [index, entry] of normalized.entries()) {
    if (
      entry.startsWith("/")
      || entry.includes("\\")
      || entry.split("/").includes("..")
    ) {
      throw new Error(`unsafe legacy archive path: ${entries[index]}.`);
    }
    if (!["-", "d"].includes(types[index])) {
      throw new Error("Legacy archive may contain only files and directories.");
    }
  }
  const roots = new Set(
    normalized.map((entry) => entry.split("/")[0]).filter(Boolean),
  );
  if (roots.size !== 1) {
    throw new Error("Legacy archive must have one isolated root directory.");
  }
  const [root] = roots;
  const requiredFiles = new Set([
    "backup-manifest.json",
    "data-application.sql",
    "data-public-storage.sql",
    "roles.sql",
    "schema-application.sql",
    "schema-public-storage.sql",
  ].map((name) => `${root}/${name}`));
  const presentFiles = new Set(
    normalized.filter((_entry, index) => types[index] === "-"),
  );
  for (const required of requiredFiles) {
    if (!presentFiles.has(required)) {
      throw new Error(`Legacy archive is missing ${required}.`);
    }
  }
  const storagePrefix = `${root}/storage-objects/`;
  const storageEntries = [];
  for (const entry of presentFiles) {
    if (requiredFiles.has(entry)) {
      continue;
    }
    if (!entry.startsWith(storagePrefix) || entry === storagePrefix) {
      throw new Error(`unexpected legacy archive entry: ${entry}.`);
    }
    storageEntries.push(entry);
  }
  return Object.freeze({
    root,
    storageEntries: storageEntries.sort(compareText),
  });
}

function requireEqual(evidence, before, after, label) {
  if (
    typeof evidence[before] !== "string"
    || evidence[before].length === 0
    || evidence[before] !== evidence[after]
  ) {
    throw new Error(`${label} changed during migration.`);
  }
}

export function evaluateLegacyDataMigrationEvidence(evidence) {
  if (evidence.gatewayRunning) {
    throw new Error("Production gateway must remain private.");
  }
  if (!evidence.next3100Running) {
    throw new Error("Existing Next service on port 3100 is not running.");
  }
  if (!evidence.prebackupMatchesCurrent) {
    throw new Error("Current complete-v2 prebackup is not verified.");
  }
  if (
    evidence.authUsersBefore !== 0
    || evidence.authUsersAfter !== 0
    || evidence.authUsersResidualAfter !== 0
  ) {
    throw new Error("Local auth.users separation was not preserved.");
  }
  if (evidence.foreignKeyViolations !== 0) {
    throw new Error("Foreign key validation failed after migration.");
  }
  requireEqual(
    evidence,
    "constraintDigestBefore",
    "constraintDigestAfter",
    "Constraint catalog",
  );
  requireEqual(
    evidence,
    "migrationDigestBefore",
    "migrationDigestAfter",
    "Migration ledger",
  );
  requireEqual(
    evidence,
    "rlsDigestBefore",
    "rlsDigestAfter",
    "RLS catalog",
  );
  if (
    typeof evidence.sourceDataDigest !== "string"
    || evidence.sourceDataDigest.length === 0
    || evidence.sourceDataDigest !== evidence.targetDataDigest
  ) {
    throw new Error("Source and target public data digests differ.");
  }
  if (
    !/^[0-9a-f]{64}$/u.test(evidence.storageSourceSha256)
    || evidence.storageSourceSha256 !== evidence.storagePayloadSha256
  ) {
    throw new Error("Storage payload SHA-256 differs from the source.");
  }
  if (
    evidence.storageHttpContentType !== "image/jpeg"
    || evidence.storageHttpCacheControl !== "max-age=3600"
  ) {
    throw new Error("Storage HTTP metadata does not match the source.");
  }

  const publicationBlockers = [];
  if (
    !Number.isSafeInteger(evidence.identityEpochAntiJoinCount)
    || evidence.identityEpochAntiJoinCount < 0
  ) {
    throw new Error("Identity epoch anti-join evidence is invalid.");
  }
  if (evidence.identityEpochAntiJoinCount > 0) {
    publicationBlockers.push(
      `identity-epoch-anti-join:${evidence.identityEpochAntiJoinCount}`,
    );
  }
  return Object.freeze({
    importSafe: true,
    publicationBlockers,
    publicationSafe: publicationBlockers.length === 0,
  });
}
