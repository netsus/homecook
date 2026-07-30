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

export function buildStorageApiRequestScript() {
  return `
    const fs = await import("node:fs");
    const crypto = await import("node:crypto");
    const [
      baseUrl,
      method,
      bucket,
      objectPath,
      contentType,
      cacheControl,
      file,
    ] = process.argv.slice(1);
    const serviceJwt = process.env.SERVICE_JWT;
    if (!serviceJwt) {
      throw new Error("Storage service authorization is unavailable.");
    }
    const encodedPath = objectPath.split("/")
      .map(encodeURIComponent).join("/");
    const prefix = method === "GET"
      ? "/object/authenticated/"
      : "/object/";
    const headers = {
      authorization: "Bearer " + serviceJwt,
    };
    if (method === "POST") {
      headers["cache-control"] = cacheControl;
      headers["content-type"] = contentType;
      headers["x-upsert"] = "false";
    }
    const response = await fetch(
      baseUrl.replace(/\\/+$/, "") + prefix
        + encodeURIComponent(bucket) + "/" + encodedPath,
      {
        method,
        headers,
        body: method === "POST" && file
          ? fs.readFileSync(file)
          : undefined,
      },
    );
    const body = Buffer.from(await response.arrayBuffer());
    process.stdout.write(JSON.stringify({
      status: response.status,
      bytes: body.length,
      sha256: method === "GET"
        ? crypto.createHash("sha256").update(body).digest("hex")
        : null,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
    }));
  `;
}

export function validateStorageMigrationEvidence({ actual, expected }) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    throw new Error("Storage migration evidence is incomplete.");
  }
  const fields = [
    "bucket",
    "bytes",
    "cacheControl",
    "contentType",
    "name",
    "sha256",
  ];
  const normalize = (objects, label) => {
    const keys = new Set();
    return objects.map((object) => {
      if (
        !object
        || typeof object !== "object"
        || typeof object.bucket !== "string"
        || object.bucket.length === 0
        || !Number.isSafeInteger(object.bytes)
        || object.bytes < 0
        || typeof object.cacheControl !== "string"
        || typeof object.contentType !== "string"
        || object.contentType.length === 0
        || typeof object.name !== "string"
        || object.name.length === 0
        || !/^[0-9a-f]{64}$/u.test(object.sha256)
      ) {
        throw new Error(`Storage migration evidence ${label} is invalid.`);
      }
      const key = `${object.bucket}\u0000${object.name}`;
      if (keys.has(key)) {
        throw new Error(
          `Storage migration evidence ${label} contains a duplicate object.`,
        );
      }
      keys.add(key);
      return Object.freeze(Object.fromEntries(
        fields.map((field) => [field, object[field]]),
      ));
    }).sort((left, right) => {
      const leftKey = `${left.bucket}\u0000${left.name}`;
      const rightKey = `${right.bucket}\u0000${right.name}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  };
  const normalizedActual = normalize(actual, "actual");
  const normalizedExpected = normalize(expected, "expected");
  if (
    normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((object, index) =>
      fields.some((field) =>
        object[field] !== normalizedExpected[index][field]))
  ) {
    throw new Error(
      "Storage migration evidence does not exactly match the source.",
    );
  }
  return Object.freeze({
    count: normalizedActual.length,
    objects: Object.freeze(normalizedActual),
  });
}

export function resolvePublicMigrationOutcome({
  executionStatus,
  markerStatus,
  transactionActive,
}) {
  if (markerStatus === "present") {
    return Object.freeze({
      databaseOutcome: "committed",
      reason: "durable-marker-present",
    });
  }
  if (
    markerStatus === "absent"
    && transactionActive === false
    && ["failed", "precommit_failed"].includes(executionStatus)
  ) {
    return Object.freeze({
      databaseOutcome: "rolled_back",
      reason: "marker-absent-and-transaction-inactive",
    });
  }
  return Object.freeze({
    databaseOutcome: "unknown",
    reason: markerStatus === "unknown"
      ? "commit-marker-unavailable"
      : "commit-outcome-unconfirmed",
  });
}

export function planStorageCommitBoundary({
  databaseOutcome,
  storageVerifiedBeforeCommit,
}) {
  if (
    !["committed", "rolled_back", "unknown"].includes(databaseOutcome)
  ) {
    throw new Error("Database migration outcome is invalid.");
  }
  if (databaseOutcome === "committed" && !storageVerifiedBeforeCommit) {
    throw new Error(
      "Storage must verify before public commit.",
    );
  }
  return Object.freeze({
    commitAllowed: storageVerifiedBeforeCommit,
    compensateStorage: databaseOutcome === "rolled_back",
    reconciliationRequired: databaseOutcome === "unknown",
  });
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

/**
 * @param {{
 *   commitMarkerSql?: string;
 *   dataSql: string;
 *   dryRun: boolean;
 *   evidenceSql: string;
 *   transactionPreambleSql?: string;
 *   truncateTables: string[];
 * }} input
 */
export function buildLegacyDataMigrationTransaction({
  commitMarkerSql = undefined,
  dataSql,
  dryRun,
  evidenceSql,
  transactionPreambleSql = undefined,
  truncateTables,
}) {
  if (
    typeof dataSql !== "string"
    || typeof evidenceSql !== "string"
    || !Array.isArray(truncateTables)
    || truncateTables.length === 0
    || (!dryRun && (
      typeof commitMarkerSql !== "string"
      || commitMarkerSql.trim().length === 0
      || typeof transactionPreambleSql !== "string"
      || transactionPreambleSql.trim().length === 0
    ))
  ) {
    throw new Error("Migration transaction inputs are incomplete.");
  }
  const relations = truncateTables.map(safeQualifiedName).join(", ");
  return [
    "begin;",
    "set local lock_timeout = '15s';",
    "set local statement_timeout = '10min';",
    ...(dryRun ? [] : [transactionPreambleSql.trim()]),
    "lock table auth.users in share row exclusive mode;",
    `truncate table ${relations} restart identity;`,
    "set local session_replication_role = replica;",
    dataSql.trim(),
    "set local session_replication_role = origin;",
    "set constraints all immediate;",
    evidenceSql.trim(),
    ...(dryRun ? [] : [commitMarkerSql.trim()]),
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
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Legacy archive contains a duplicate path.");
  }
  for (const [index, entry] of normalized.entries()) {
    if (
      entry.startsWith("/")
      || entry.startsWith("-")
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

export function validateLegacyStoragePayloadInventory({
  archiveFiles,
  manifestObjects,
  root,
}) {
  if (
    !Array.isArray(archiveFiles)
    || !Array.isArray(manifestObjects)
    || typeof root !== "string"
    || !root
    || root.startsWith("/")
    || root.startsWith("-")
    || root.includes("\\")
    || root.split("/").includes("..")
    || root.includes("/")
  ) {
    throw new Error("Legacy Storage inventory is malformed.");
  }
  const expected = manifestObjects.map((object) => {
    if (
      typeof object?.bucket !== "string"
      || !object.bucket
      || object.bucket.includes("/")
      || object.bucket.includes("\\")
      || object.bucket === ".."
      || typeof object?.path !== "string"
      || !object.path
      || object.path.startsWith("/")
      || object.path.includes("\\")
      || object.path.split("/").includes("..")
      || !/^[0-9a-f]{64}$/u.test(object?.sha256)
      || !Number.isSafeInteger(object?.size_bytes)
      || object.size_bytes < 0
    ) {
      throw new Error("Legacy Storage manifest entry is invalid.");
    }
    const manifestPrefix = `storage-objects/${object.bucket}/`;
    if (
      object.path.startsWith("storage-objects/")
      && !object.path.startsWith(manifestPrefix)
    ) {
      throw new Error("Legacy Storage manifest bucket and path disagree.");
    }
    const logicalPath = object.path.startsWith(manifestPrefix)
      ? object.path.slice(manifestPrefix.length)
      : object.path;
    if (!logicalPath || logicalPath.endsWith("/")) {
      throw new Error("Legacy Storage object path is invalid.");
    }
    return {
      ...object,
      archiveEntry: `${root}/${manifestPrefix}${logicalPath}`,
      path: logicalPath,
    };
  });
  const expectedPaths = expected.map((object) => object.archiveEntry);
  if (new Set(expectedPaths).size !== expectedPaths.length) {
    throw new Error("Legacy Storage manifest contains a duplicate object.");
  }
  const storagePrefix = `${root}/storage-objects/`;
  const actual = archiveFiles.map((file) => {
    const path = typeof file?.path === "string"
      ? file.path.replace(/^\.\//u, "")
      : "";
    if (
      !path.startsWith(storagePrefix)
      || path === storagePrefix
      || path.startsWith("/")
      || path.includes("\\")
      || path.split("/").includes("..")
      || !Number.isSafeInteger(file?.bytes)
      || file.bytes < 0
      || !/^[0-9a-f]{64}$/u.test(file?.sha256)
    ) {
      throw new Error("Legacy Storage archive payload is invalid.");
    }
    return { bytes: file.bytes, path, sha256: file.sha256 };
  });
  if (new Set(actual.map((file) => file.path)).size !== actual.length) {
    throw new Error("Legacy Storage archive contains a duplicate payload.");
  }
  const actualByPath = new Map(actual.map((file) => [file.path, file]));
  if (
    actual.length !== expected.length
    || expected.some((object) => {
      const file = actualByPath.get(object.archiveEntry);
      return !file
        || file.bytes !== object.size_bytes
        || file.sha256 !== object.sha256;
    })
  ) {
    throw new Error(
      "Legacy Storage manifest and archive payloads must exactly match.",
    );
  }
  return expected;
}
