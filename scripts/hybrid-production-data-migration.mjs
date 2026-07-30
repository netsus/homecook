#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLegacyEvidenceArchive,
  buildLegacyDataMigrationPlan,
  buildLegacyDataMigrationTransaction,
  evaluateLegacyDataMigrationEvidence,
} from "./lib/hybrid-production-data-migration.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG = join(
  ROOT,
  "infra/hybrid-supabase/.env.production.local",
);
const BACKUP_KEY_ENV = "HOMECOOK_HYBRID_BACKUP_KEY";
const PBKDF2_ITERATIONS = "200000";
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const SAFE_SQL_NAME = /^[a-z_][a-z0-9_]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(message);
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value.`);
  }
  return value;
}

function requiredOption(args, name) {
  const value = optionValue(args, name);
  if (!value) {
    fail(`${name} is required.`);
  }
  return value;
}

function run(command, args, options = {}) {
  const outputFd = options.stdoutPath
    ? openSync(options.stdoutPath, "w", 0o600)
    : null;
  try {
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? ROOT,
      encoding: outputFd === null ? "utf8" : undefined,
      env: options.env ?? process.env,
      input: options.input,
      maxBuffer: 128 * 1024 * 1024,
      stdio: [
        options.input === undefined ? "ignore" : "pipe",
        outputFd ?? "pipe",
        "pipe",
      ],
    });
    if (result.status !== 0) {
      fail(options.failure ?? `${command} failed.`);
    }
    return typeof result.stdout === "string" ? result.stdout : "";
  } finally {
    if (outputFd !== null) {
      closeSync(outputFd);
    }
  }
}

function parseConfig(path) {
  if (!existsSync(path)) {
    fail(`Production config does not exist: ${path}`);
  }
  if ((statSync(path).mode & 0o777) !== 0o600) {
    fail("Production config mode must be exactly 0600.");
  }
  const config = {};
  for (const [index, rawLine] of readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      fail(`Invalid config at line ${index + 1}.`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    config[match[1]] = value;
  }
  for (const name of [
    "HOMECOOK_HYBRID_BACKUP_KEY_ID",
    "HOMECOOK_HYBRID_KEYCHAIN_SERVICE",
    "HYBRID_COMPOSE_PROJECT_NAME",
    "HYBRID_NODE_IMAGE",
    "HYBRID_STORAGE_VOLUME_NAME",
  ]) {
    if (!config[name]) {
      fail(`Production config is missing ${name}.`);
    }
  }
  if (config.HOMECOOK_HYBRID_SECRET_SOURCE !== "keychain") {
    fail("Production migration requires Keychain secrets.");
  }
  return Object.freeze(config);
}

function keychainSecret(config, account) {
  return run(
    "security",
    [
      "find-generic-password",
      "-s",
      config.HOMECOOK_HYBRID_KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ],
    { failure: `Required Keychain item ${account} is unavailable.` },
  ).trim();
}

function safeName(value, label) {
  if (!SAFE_NAME.test(value)) {
    fail(`${label} is unsafe.`);
  }
  return value;
}

function sqlName(value) {
  if (!SAFE_SQL_NAME.test(value)) {
    fail(`Unsafe SQL identifier: ${value}.`);
  }
  return `"${value}"`;
}

function qualifiedName(value) {
  const parts = value.split(".");
  if (parts.length !== 2) {
    fail(`Unsafe qualified relation: ${value}.`);
  }
  return parts.map(sqlName).join(".");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql({ container, database, user }, sql, options = {}) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      database,
      ...(options.tuples === false ? [] : ["-qAt"]),
    ],
    {
      input: sql,
      failure: options.failure ?? "PostgreSQL query failed.",
    },
  );
}

function queryJson(connection, sql) {
  const output = psql(connection, `${sql.trim()}\n`).trim();
  if (!output) {
    fail("PostgreSQL JSON query returned no result.");
  }
  return JSON.parse(output);
}

function tableCatalog(connection) {
  const tables = queryJson(
    connection,
    `
      select coalesce(json_agg(item order by item ->> 'name'), '[]'::json)
      from (
        select json_build_object(
          'name', namespace.nspname || '.' || relation.relname,
          'columns', (
            select coalesce(json_agg(json_build_object(
              'name', attribute.attname,
              'type', pg_catalog.format_type(
                attribute.atttypid,
                attribute.atttypmod
              ),
              'nullable', not attribute.attnotnull,
              'defaultExpression', pg_catalog.pg_get_expr(
                attribute_default.adbin,
                attribute_default.adrelid
              ),
              'identity', attribute.attidentity <> '',
              'generated', attribute.attgenerated <> ''
            ) order by attribute.attnum), '[]'::json)
            from pg_catalog.pg_attribute as attribute
            left join pg_catalog.pg_attrdef as attribute_default
              on attribute_default.adrelid = attribute.attrelid
             and attribute_default.adnum = attribute.attnum
            where attribute.attrelid = relation.oid
              and attribute.attnum > 0
              and not attribute.attisdropped
          ),
          'primaryKey', (
            select coalesce(json_agg(attribute.attname order by key.ord), '[]'::json)
            from pg_catalog.pg_constraint as constraint_definition
            cross join lateral unnest(constraint_definition.conkey)
              with ordinality as key(attnum, ord)
            join pg_catalog.pg_attribute as attribute
              on attribute.attrelid = relation.oid
             and attribute.attnum = key.attnum
            where constraint_definition.conrelid = relation.oid
              and constraint_definition.contype = 'p'
          )
        ) as item
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r', 'p')
      ) as catalog;
    `,
  );
  const countsSql = `
    select json_object_agg(item.name, item.row_count)::text
    from (
      ${tables.map((table) => `
        select
          ${sqlLiteral(table.name)}::text as name,
          count(*)::bigint as row_count
        from ${qualifiedName(table.name)}
      `).join("\nunion all\n")}
    ) as item;
  `;
  const counts = queryJson(connection, countsSql);
  return tables.map((table) => ({
    ...table,
    rowCount: Number(counts[table.name]),
  }));
}

function storageObjects(connection) {
  return queryJson(
    connection,
    `
      select coalesce(json_agg(json_build_object(
        'id', object.id,
        'bucket', object.bucket_id,
        'name', object.name,
        'version', object.version,
        'bytes', case
          when object.metadata ->> 'size' ~ '^[0-9]+$'
            then (object.metadata ->> 'size')::bigint
          else -1
        end,
        'mime', coalesce(object.metadata ->> 'mimetype', ''),
        'cacheControl', coalesce(object.metadata ->> 'cacheControl', ''),
        'ownerIsNull', object.owner is null,
        'ownerIdIsNull', object.owner_id is null
      ) order by object.bucket_id, object.name), '[]'::json)::text
      from storage.objects as object;
    `,
  );
}

function targetOnlyRows(plan, targetCatalog) {
  const rows = new Map(
    targetCatalog.map((table) => [table.name, table.rowCount]),
  );
  return Object.fromEntries(
    plan.targetOnlyTables.map((name) => [name, rows.get(name) ?? -1]),
  );
}

function planRuntime(source, target) {
  const sourceCatalog = tableCatalog(source);
  const targetCatalog = tableCatalog(target);
  const plan = buildLegacyDataMigrationPlan({
    sourceTables: sourceCatalog,
    targetTables: targetCatalog,
  });
  const targetOnly = targetOnlyRows(plan, targetCatalog);
  if (Object.values(targetOnly).some((count) => count !== 0)) {
    fail("Target-only public tables must be empty before replacement.");
  }
  return {
    plan,
    sourceCatalog,
    targetCatalog,
    targetOnly,
  };
}

function dataDump(source) {
  const dump = run(
    "docker",
    [
      "exec",
      source.container,
      "pg_dump",
      "-U",
      source.user,
      "-d",
      source.database,
      "--data-only",
      "--schema=public",
      "--column-inserts",
      "--no-owner",
      "--no-privileges",
    ],
    { failure: "Source public data dump failed." },
  );
  const firstInsert = dump.search(
    /^(?:INSERT INTO|SELECT pg_catalog\.setval)/mu,
  );
  if (firstInsert === -1) {
    fail("Source public data dump contains no transferable statements.");
  }
  return dump
    .slice(firstInsert)
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith("\\"))
    .join("\n")
    .trim();
}

function tableDigestSql(table) {
  if (!Array.isArray(table.primaryKey) || table.primaryKey.length === 0) {
    fail(`Source table ${table.name} has no primary key.`);
  }
  const columns = table.columns.map((column) => sqlName(column.name));
  const order = table.primaryKey.map((column) =>
    `row_data.${sqlName(column)}`).join(", ");
  return `
    select 'HOMECOOK_TABLE|${table.name}|'
      || count(*)::text || '|'
      || encode(extensions.digest(
        coalesce(
          string_agg(
            row_to_json(row_data)::text,
            E'\\\\n'
            order by ${order}
          ),
          ''
        ),
        'sha256'
      ), 'hex')
    from (
      select ${columns.join(", ")}
      from ${qualifiedName(table.name)}
    ) as row_data;
  `;
}

function parseTableDigests(output) {
  const result = {};
  for (const line of output.split(/\r?\n/u)) {
    if (!line.startsWith("HOMECOOK_TABLE|")) {
      continue;
    }
    const [, name, countText, sha256] = line.split("|");
    const count = Number(countText);
    if (!name || !Number.isSafeInteger(count) || !SHA256.test(sha256)) {
      fail("Table digest evidence is malformed.");
    }
    result[name] = { count, sha256 };
  }
  return result;
}

function aggregateDataDigest(tableDigests) {
  return sha256Text(
    Object.entries(tableDigests)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) =>
        `${name}:${value.count}:${value.sha256}`)
      .join("\n"),
  );
}

function sourceTableDigests(source, sourceCatalog) {
  const output = psql(
    source,
    sourceCatalog.map(tableDigestSql).join("\n"),
  );
  const result = parseTableDigests(output);
  if (Object.keys(result).length !== sourceCatalog.length) {
    fail("Source table digest evidence is incomplete.");
  }
  return result;
}

function foreignKeyValidationSql() {
  return `
    do $validation$
    declare
      foreign_key record;
      join_expression text;
      nonnull_expression text;
      violation_count bigint;
    begin
      for foreign_key in
        select constraint_definition.*
        from pg_catalog.pg_constraint as constraint_definition
        join pg_catalog.pg_class as relation
          on relation.oid = constraint_definition.conrelid
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where constraint_definition.contype = 'f'
          and namespace.nspname in ('public', 'storage')
        order by constraint_definition.conname
      loop
        if foreign_key.confmatchtype <> 's' then
          raise exception 'Unsupported non-simple FK %',
            foreign_key.conname;
        end if;
        select
          string_agg(
            format('child.%I = parent.%I', child.attname, parent.attname),
            ' and ' order by key.ord
          ),
          string_agg(
            format('child.%I is not null', child.attname),
            ' and ' order by key.ord
          )
          into join_expression, nonnull_expression
        from unnest(foreign_key.conkey, foreign_key.confkey)
          with ordinality as key(child_attnum, parent_attnum, ord)
        join pg_catalog.pg_attribute as child
          on child.attrelid = foreign_key.conrelid
         and child.attnum = key.child_attnum
        join pg_catalog.pg_attribute as parent
          on parent.attrelid = foreign_key.confrelid
         and parent.attnum = key.parent_attnum;

        execute format(
          'select count(*) from %s child where %s and not exists '
          || '(select 1 from %s parent where %s)',
          foreign_key.conrelid::regclass,
          nonnull_expression,
          foreign_key.confrelid::regclass,
          join_expression
        ) into violation_count;
        if violation_count <> 0 then
          raise exception 'Foreign key % has % orphan rows',
            foreign_key.conname,
            violation_count;
        end if;
      end loop;
    end;
    $validation$;
  `;
}

function authUsersResidualSql() {
  return `
    (
      (select count(*) from pg_catalog.pg_constraint
        where confrelid = 'auth.users'::regclass)
      +
      (select count(*) from pg_catalog.pg_depend
        where refobjid = 'auth.users'::regclass
          and deptype = 'n')
      +
      (select count(*) from pg_catalog.pg_proc
        where prokind in ('f', 'p')
          and pg_get_functiondef(oid) ilike '%auth.users%')
      +
      (select count(*) from pg_catalog.pg_policies
        where coalesce(qual, '') ilike '%auth.users%'
          or coalesce(with_check, '') ilike '%auth.users%')
    )
  `;
}

function transactionEvidenceSql(sourceCatalog, targetOnly, issuer) {
  const targetOnlyJson = Object.keys(targetOnly).length === 0
    ? "'{}'::json"
    : `json_build_object(${Object.keys(targetOnly).flatMap((name) => [
      sqlLiteral(name),
      `(select count(*) from ${qualifiedName(name)})`,
    ]).join(", ")})`;
  return [
    foreignKeyValidationSql(),
    ...sourceCatalog.map(tableDigestSql),
    `
      select 'HOMECOOK_SUMMARY|' || json_build_object(
        'authUsers', (select count(*) from auth.users),
        'authUsersResidual', ${authUsersResidualSql()},
        'invalidConstraints', (
          select count(*) from pg_catalog.pg_constraint
          where not convalidated
        ),
        'capability', (
          select state
          from public.account_generation_capability_state
          where singleton
        ),
        'identityEpochAntiJoinCount', (
          select count(*)
          from public.users as app_user
          where not exists (
            select 1
            from private.remote_auth_identity_epochs as epoch
            where epoch.issuer = ${sqlLiteral(issuer)}
              and epoch.owner_uuid = app_user.id
              and epoch.active_epoch
              and epoch.deleted_terminal_at is null
          )
        ),
        'targetOnlyRows', ${targetOnlyJson}
      )::text;
    `,
  ].join("\n");
}

function parseTransactionEvidence(output, expectedTableCount) {
  const tableDigests = parseTableDigests(output);
  const summaryLine = output.split(/\r?\n/u)
    .find((line) => line.startsWith("HOMECOOK_SUMMARY|"));
  if (
    Object.keys(tableDigests).length !== expectedTableCount
    || !summaryLine
  ) {
    fail("Migration transaction evidence is incomplete.");
  }
  const summary = JSON.parse(
    summaryLine.slice("HOMECOOK_SUMMARY|".length),
  );
  if (
    summary.authUsers !== 0
    || summary.authUsersResidual !== 0
    || summary.invalidConstraints !== 0
    || summary.capability !== "legacy"
    || Object.values(summary.targetOnlyRows).some((count) => count !== 0)
  ) {
    fail("Migration transaction semantic validation failed.");
  }
  return { summary, tableDigests };
}

function executePublicMigration({
  dataSql,
  dryRun,
  onCommitted = () => {},
  plan,
  sourceCatalog,
  target,
  targetOnly,
  issuer,
}) {
  const sql = buildLegacyDataMigrationTransaction({
    dataSql,
    dryRun,
    evidenceSql: transactionEvidenceSql(
      sourceCatalog,
      targetOnly,
      issuer,
    ),
    truncateTables: plan.truncateTables,
  });
  const output = psql(target, sql, {
    failure: dryRun
      ? "Public data migration dry-run failed."
      : "Public data migration apply failed.",
  });
  if (!dryRun) {
    onCommitted();
  }
  return parseTransactionEvidence(output, sourceCatalog.length);
}

function catalogSnapshot(target) {
  const rls = psql(
    target,
    `
      select json_build_object(
        'table', namespace.nspname || '.' || relation.relname,
        'rls', relation.relrowsecurity,
        'force', relation.relforcerowsecurity,
        'acl', coalesce(relation.relacl::text, ''),
        'policies', coalesce((
          select json_agg(json_build_object(
            'name', policy.polname,
            'command', policy.polcmd,
            'permissive', policy.polpermissive,
            'roles', policy.polroles::text,
            'using', pg_catalog.pg_get_expr(
              policy.polqual,
              policy.polrelid
            ),
            'check', pg_catalog.pg_get_expr(
              policy.polwithcheck,
              policy.polrelid
            )
          ) order by policy.polname)
          from pg_catalog.pg_policy as policy
          where policy.polrelid = relation.oid
        ), '[]'::json)
      )::text
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'storage')
        and relation.relkind in ('r', 'p')
      order by namespace.nspname, relation.relname;
    `,
  );
  const constraints = psql(
    target,
    `
      select json_build_object(
        'table', namespace.nspname || '.' || relation.relname,
        'name', constraint_definition.conname,
        'type', constraint_definition.contype,
        'validated', constraint_definition.convalidated,
        'deferrable', constraint_definition.condeferrable,
        'deferred', constraint_definition.condeferred,
        'definition', pg_catalog.pg_get_constraintdef(
          constraint_definition.oid,
          true
        )
      )::text
      from pg_catalog.pg_constraint as constraint_definition
      join pg_catalog.pg_class as relation
        on relation.oid = constraint_definition.conrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'storage')
      union all
      select json_build_object(
        'table', namespace.nspname || '.' || relation.relname,
        'name', trigger.tgname,
        'type', 'trigger',
        'validated', true,
        'deferrable', false,
        'deferred', false,
        'definition', pg_catalog.pg_get_triggerdef(trigger.oid, true)
      )::text
      from pg_catalog.pg_trigger as trigger
      join pg_catalog.pg_class as relation
        on relation.oid = trigger.tgrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'storage')
        and not trigger.tgisinternal
      order by 1;
    `,
  );
  const migrations = psql(
    target,
    `
      select 'application|' || version || '|' || coalesce(name, '')
      from supabase_migrations.schema_migrations
      union all
      select 'storage|' || id::text || '|' || name || '|' || hash
      from storage.migrations
      order by 1;
    `,
  );
  return Object.freeze({
    constraintDigest: sha256Text(constraints),
    migrationDigest: sha256Text(migrations),
    rlsDigest: sha256Text(rls),
  });
}

function gatewayRunning(project) {
  const output = run(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      "label=com.docker.compose.service=gateway",
      "--format",
      "{{.State}}",
    ],
    { failure: "Production gateway state could not be inspected." },
  ).trim();
  if (!output) {
    fail("Production gateway container is missing.");
  }
  return output.split(/\r?\n/u).some((state) =>
    ["running", "restarting"].includes(state));
}

function next3100Running() {
  return spawnSync(
    "lsof",
    ["-nP", "-iTCP:3100", "-sTCP:LISTEN"],
    { encoding: "utf8" },
  ).status === 0;
}

function verifyPrebackup(configPath, archive) {
  if (!isAbsolute(archive)) {
    fail("--prebackup must be an absolute path.");
  }
  const output = run(
    process.execPath,
    [
      "scripts/hybrid-production-runtime.mjs",
      "verify-backup",
      "--archive",
      archive,
      "--against-current",
      "--config",
      configPath,
    ],
    { failure: "Current complete-v2 prebackup verification failed." },
  );
  const evidence = JSON.parse(output);
  if (
    evidence.status !== "PASS"
    || evidence.current_match !== true
    || evidence.auth_users !== 0
    || evidence.auth_users_residual !== 0
    || !SHA256.test(evidence.archive_sha256)
  ) {
    fail("Current complete-v2 prebackup evidence is invalid.");
  }
  return evidence;
}

function verifyArchiveSidecar(archive, expectedSha256) {
  const sidecar = `${archive}.sha256`;
  if (
    !isAbsolute(archive)
    || !existsSync(archive)
    || !existsSync(sidecar)
    || (statSync(archive).mode & 0o777) !== 0o600
    || (statSync(sidecar).mode & 0o777) !== 0o600
  ) {
    fail("Legacy archive and sidecar must exist with mode 0600.");
  }
  const actual = sha256File(archive);
  const sidecarSha = readFileSync(sidecar, "utf8").trim()
    .split(/\s+/u)[0];
  if (
    !SHA256.test(expectedSha256)
    || actual !== expectedSha256
    || sidecarSha !== actual
  ) {
    fail("Legacy archive SHA-256 verification failed.");
  }
  return actual;
}

function inspectLegacyArchive(config, archive, expectedSha256) {
  const archiveSha256 = verifyArchiveSidecar(archive, expectedSha256);
  const key = keychainSecret(
    config,
    config.HOMECOOK_HYBRID_BACKUP_KEY_ID,
  );
  const temp = mkdtempSync(
    join(tmpdir(), "homecook-hybrid-legacy-migration-"),
  );
  chmodSync(temp, 0o700);
  const bundle = join(temp, "legacy.tar.gz");
  try {
    run(
      "openssl",
      [
        "enc",
        "-d",
        "-aes-256-cbc",
        "-pbkdf2",
        "-iter",
        PBKDF2_ITERATIONS,
        "-pass",
        `env:${BACKUP_KEY_ENV}`,
        "-in",
        archive,
        "-out",
        bundle,
      ],
      {
        env: { ...process.env, [BACKUP_KEY_ENV]: key },
        failure: "Legacy archive decryption failed.",
      },
    );
    const entries = run(
      "tar",
      ["-tzf", bundle],
      { failure: "Legacy archive path inspection failed." },
    ).split(/\r?\n/u).filter(Boolean);
    const verbose = run(
      "tar",
      ["-tvzf", bundle],
      { failure: "Legacy archive type inspection failed." },
    ).split(/\r?\n/u).filter(Boolean);
    const archivePlan = assertLegacyEvidenceArchive({
      entries,
      types: verbose.map((entry) => entry[0]),
    });
    const manifestEntry =
      `${archivePlan.root}/backup-manifest.json`;
    const manifest = JSON.parse(
      run(
        "tar",
        ["-xOzf", bundle, manifestEntry],
        { failure: "Legacy backup manifest extraction failed." },
      ),
    );
    if (
      manifest.format_version !== "2"
      || manifest.secrets_in_archive !== false
      || !Array.isArray(manifest.contents?.storage_objects)
    ) {
      fail("Legacy backup manifest is invalid.");
    }
    const payloads = manifest.contents.storage_objects.map(
      (object, index) => {
        if (
          typeof object?.bucket !== "string"
          || typeof object?.path !== "string"
          || !SHA256.test(object?.sha256)
          || !Number.isSafeInteger(object?.size_bytes)
          || object.size_bytes < 0
        ) {
          fail("Legacy Storage manifest entry is invalid.");
        }
        const manifestPrefix =
          `storage-objects/${object.bucket}/`;
        const logicalPath = object.path.startsWith(manifestPrefix)
          ? object.path.slice(manifestPrefix.length)
          : object.path;
        if (!logicalPath || logicalPath.startsWith("/")) {
          fail("Legacy Storage object path is invalid.");
        }
        const entry = object.path.startsWith("storage-objects/")
          ? `${archivePlan.root}/${object.path}`
          : `${archivePlan.root}/${manifestPrefix}${object.path}`;
        if (!archivePlan.storageEntries.includes(entry)) {
          fail("Legacy Storage payload is missing from the archive.");
        }
        const output = join(temp, `storage-object-${index}.bin`);
        run(
          "tar",
          ["-xOzf", bundle, entry],
          {
            failure: "Legacy Storage payload extraction failed.",
            stdoutPath: output,
          },
        );
        chmodSync(output, 0o600);
        if (
          statSync(output).size !== object.size_bytes
          || sha256File(output) !== object.sha256
        ) {
          fail("Legacy Storage payload checksum verification failed.");
        }
        return { ...object, file: output, path: logicalPath };
      },
    );
    return {
      archiveSha256,
      cleanup: () => rmSync(temp, { force: true, recursive: true }),
      payloads,
    };
  } catch (error) {
    rmSync(temp, { force: true, recursive: true });
    throw error;
  }
}

function compareStorageSource(payloads, sourceObjects) {
  if (payloads.length !== sourceObjects.length) {
    fail("Legacy archive and source storage.objects counts differ.");
  }
  return payloads.map((payload) => {
    const source = sourceObjects.find((object) =>
      object.bucket === payload.bucket
      && object.name === payload.path);
    if (
      !source
      || source.bytes !== payload.size_bytes
      || source.mime.length === 0
      || source.cacheControl.length === 0
      || !source.version
    ) {
      fail("Legacy Storage payload metadata does not match source DB.");
    }
    return { payload, source };
  });
}

function storageContainer(config) {
  const output = run(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.docker.compose.project=${config.HYBRID_COMPOSE_PROJECT_NAME}`,
      "--filter",
      "label=com.docker.compose.service=storage",
      "--format",
      "{{.Names}}",
    ],
    { failure: "Production Storage container could not be inspected." },
  ).trim();
  if (!output || output.includes("\n")) {
    fail("Exactly one production Storage container must be running.");
  }
  return output;
}

function storageVolumeFileCount(config) {
  return Number(
    run(
      "docker",
      [
        "run",
        "--rm",
        "--platform",
        config.HYBRID_DOCKER_PLATFORM,
        "-v",
        `${config.HYBRID_STORAGE_VOLUME_NAME}:/volume:ro`,
        config.HYBRID_NODE_IMAGE,
        "node",
        "-e",
        `
          const fs = require("node:fs");
          const path = require("node:path");
          let count = 0;
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const item = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(item);
              else if (entry.isFile()) count += 1;
            }
          };
          walk("/volume");
          process.stdout.write(String(count));
        `,
      ],
      { failure: "Storage volume could not be inspected." },
    ).trim(),
  );
}

function storageRequest({
  config,
  container,
  method,
  object,
  payloadPath = null,
}) {
  const stagedPath =
    `/tmp/homecook-storage-migration-${process.pid}.bin`;
  const serviceJwt = keychainSecret(config, "DATA_SUPABASE_SECRET_KEY");
  if (payloadPath) {
    run(
      "docker",
      ["cp", payloadPath, `${container}:${stagedPath}`],
      { failure: "Storage payload staging failed." },
    );
  }
  try {
    const script = `
      const fs = await import("node:fs");
      const crypto = await import("node:crypto");
      const [method, bucket, objectPath, contentType, cacheControl, file] =
        process.argv.slice(1);
      const encodedPath = objectPath.split("/")
        .map(encodeURIComponent).join("/");
      const isRead = method === "GET";
      const prefix = isRead ? "/object/public/" : "/object/";
      const response = await fetch(
        "http://127.0.0.1:5000" + prefix
          + encodeURIComponent(bucket) + "/" + encodedPath,
        {
          method,
          headers: isRead ? {} : {
            authorization: "Bearer " + process.env.SERVICE_JWT,
            "cache-control": cacheControl,
            "content-type": contentType,
            "x-upsert": "false",
          },
          body: file ? fs.readFileSync(file) : undefined,
        },
      );
      const body = Buffer.from(await response.arrayBuffer());
      process.stdout.write(JSON.stringify({
        status: response.status,
        bytes: body.length,
        sha256: isRead
          ? crypto.createHash("sha256").update(body).digest("hex")
          : null,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
      }));
    `;
    const output = run(
      "docker",
      [
        "exec",
        "-e",
        "SERVICE_JWT",
        container,
        "node",
        "--input-type=module",
        "-e",
        script,
        method,
        object.bucket,
        object.name,
        object.mime,
        object.cacheControl,
        payloadPath ? stagedPath : "",
      ],
      {
        env: { ...process.env, SERVICE_JWT: serviceJwt },
        failure: `Storage ${method} request failed.`,
      },
    );
    return JSON.parse(output);
  } finally {
    if (payloadPath) {
      run(
        "docker",
        ["exec", container, "rm", "-f", stagedPath],
        { failure: "Storage payload staging cleanup failed." },
      );
    }
  }
}

function uploadStorageObjects(config, target, pairs) {
  if (storageObjects(target).length !== 0) {
    fail("Target storage.objects must be empty before migration.");
  }
  if (storageVolumeFileCount(config) !== 0) {
    fail("Target Storage volume must be empty before migration.");
  }
  const container = storageContainer(config);
  const uploaded = [];
  try {
    for (const { payload, source } of pairs) {
      const upload = storageRequest({
        config,
        container,
        method: "POST",
        object: source,
        payloadPath: payload.file,
      });
      if (![200, 201].includes(upload.status)) {
        fail(`Storage upload returned HTTP ${upload.status}.`);
      }
      uploaded.push(source);
    }
    return {
      compensate: () => {
        for (const object of uploaded.reverse()) {
          const result = storageRequest({
            config,
            container,
            method: "DELETE",
            object,
          });
          if (![200, 204, 404].includes(result.status)) {
            fail("Storage compensation failed.");
          }
        }
      },
      verify: () => {
        const targets = storageObjects(target);
        if (targets.length !== pairs.length) {
          fail("Target storage.objects count differs after upload.");
        }
        return pairs.map(({ payload, source }) => {
          const targetObject = targets.find((object) =>
            object.bucket === source.bucket
            && object.name === source.name);
          if (
            !targetObject
            || targetObject.bytes !== source.bytes
            || targetObject.mime !== source.mime
            || targetObject.cacheControl !== source.cacheControl
          ) {
            fail("Target Storage DB metadata differs from source.");
          }
          const http = storageRequest({
            config,
            container,
            method: "GET",
            object: source,
          });
          if (
            http.status !== 200
            || http.bytes !== payload.size_bytes
            || http.sha256 !== payload.sha256
            || http.contentType !== source.mime
            || http.cacheControl !== source.cacheControl
          ) {
            fail("Target Storage HTTP payload or metadata differs.");
          }
          return {
            bytes: http.bytes,
            cacheControl: http.cacheControl,
            contentType: http.contentType,
            sha256: http.sha256,
          };
        });
      },
    };
  } catch (error) {
    for (const object of uploaded.reverse()) {
      try {
        storageRequest({
          config,
          container,
          method: "DELETE",
          object,
        });
      } catch {
        // The production gateway remains private if compensation is incomplete.
      }
    }
    throw error;
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/hybrid-production-data-migration.mjs plan [options]",
      "  node scripts/hybrid-production-data-migration.mjs dry-run [options]",
      "  node scripts/hybrid-production-data-migration.mjs apply [options]",
      "",
      "Required connection options:",
      "  --source-container <name> --target-container <name>",
      "  --source-db <name> --target-db <name>",
      "",
      "dry-run/apply also require:",
      "  --prebackup <absolute complete-v2 archive>",
      "  --legacy-archive <absolute legacy archive>",
      "  --legacy-sha256 <expected sha256>",
      "",
      "The production gateway remains private for every command.",
    ].join("\n") + "\n",
  );
}

async function main() {
  const [command = "--help", ...args] = process.argv.slice(2);
  if (["--help", "-h", "help"].includes(command)) {
    help();
    return;
  }
  if (!["plan", "dry-run", "apply"].includes(command)) {
    fail(`Unsupported command: ${command}`);
  }
  const configPath = resolve(
    optionValue(args, "--config") ?? DEFAULT_CONFIG,
  );
  const config = parseConfig(configPath);
  const source = {
    container: safeName(
      requiredOption(args, "--source-container"),
      "source container",
    ),
    database: safeName(
      requiredOption(args, "--source-db"),
      "source database",
    ),
    user: "postgres",
  };
  const target = {
    container: safeName(
      requiredOption(args, "--target-container"),
      "target container",
    ),
    database: safeName(
      requiredOption(args, "--target-db"),
      "target database",
    ),
    user: "supabase_admin",
  };
  if (
    gatewayRunning(config.HYBRID_COMPOSE_PROJECT_NAME)
    || !next3100Running()
  ) {
    fail("Gateway must be private and the existing Next 3100 service must remain running.");
  }
  const authUsersBefore = Number(
    psql(target, "select count(*) from auth.users;").trim(),
  );
  if (
    authUsersBefore !== 0
    || Number(psql(source, "select count(*) from auth.users;").trim()) !== 0
  ) {
    fail("Both source and target must preserve auth.users=0.");
  }
  const runtimePlan = planRuntime(source, target);
  const sourceRows = runtimePlan.sourceCatalog.reduce(
    (sum, table) => sum + table.rowCount,
    0,
  );
  if (command === "plan") {
    print({
      auth_users: 0,
      source_public_rows: sourceRows,
      source_public_tables: runtimePlan.sourceCatalog.length,
      status: "PLAN_PASS",
      target_only_tables: runtimePlan.plan.targetOnlyTables,
      target_public_tables: runtimePlan.targetCatalog.length,
      transfer_tables: runtimePlan.plan.transferTables.length,
    });
    return;
  }

  const prebackup = verifyPrebackup(
    configPath,
    resolve(requiredOption(args, "--prebackup")),
  );
  const legacyArchive = resolve(
    requiredOption(args, "--legacy-archive"),
  );
  const legacy = inspectLegacyArchive(
    config,
    legacyArchive,
    requiredOption(args, "--legacy-sha256"),
  );
  try {
    const sourceObjects = storageObjects(source);
    const storagePairs = compareStorageSource(
      legacy.payloads,
      sourceObjects,
    );
    if (
      storageObjects(target).length !== 0
      || storageVolumeFileCount(config) !== 0
    ) {
      fail("Target Storage must be empty before migration.");
    }
    const sourceDigests = sourceTableDigests(
      source,
      runtimePlan.sourceCatalog,
    );
    const sourceDataDigest = aggregateDataDigest(sourceDigests);
    const dump = dataDump(source);
    const beforeCatalog = catalogSnapshot(target);
    const dryRunEvidence = executePublicMigration({
      dataSql: dump,
      dryRun: true,
      issuer: config.AUTH_SUPABASE_EXPECTED_ISSUER,
      plan: runtimePlan.plan,
      sourceCatalog: runtimePlan.sourceCatalog,
      target,
      targetOnly: runtimePlan.targetOnly,
    });
    const dryRunDigest = aggregateDataDigest(
      dryRunEvidence.tableDigests,
    );
    if (dryRunDigest !== sourceDataDigest) {
      fail("Dry-run public data digest differs from source.");
    }
    const afterDryRunCatalog = catalogSnapshot(target);
    for (const key of [
      "constraintDigest",
      "migrationDigest",
      "rlsDigest",
    ]) {
      if (beforeCatalog[key] !== afterDryRunCatalog[key]) {
        fail("Dry-run changed the target catalog.");
      }
    }
    if (command === "dry-run") {
      print({
        auth_users: 0,
        legacy_archive_sha256: legacy.archiveSha256,
        prebackup_sha256: prebackup.archive_sha256,
        public_data_digest: sourceDataDigest,
        source_public_rows: sourceRows,
        status: "DRY_RUN_PASS",
        storage_objects: storagePairs.length,
        storage_source_sha256: storagePairs.map(
          ({ payload }) => payload.sha256,
        ),
        target_only_rows: runtimePlan.targetOnly,
      });
      return;
    }

    const storageMutation = uploadStorageObjects(
      config,
      target,
      storagePairs,
    );
    let publicCommitted = false;
    try {
      const applyEvidence = executePublicMigration({
        dataSql: dump,
        dryRun: false,
        issuer: config.AUTH_SUPABASE_EXPECTED_ISSUER,
        onCommitted: () => {
          publicCommitted = true;
        },
        plan: runtimePlan.plan,
        sourceCatalog: runtimePlan.sourceCatalog,
        target,
        targetOnly: runtimePlan.targetOnly,
      });
      const targetDataDigest = aggregateDataDigest(
        applyEvidence.tableDigests,
      );
      const storageEvidence = storageMutation.verify();
      const afterCatalog = catalogSnapshot(target);
      const evaluated = evaluateLegacyDataMigrationEvidence({
        authUsersAfter: applyEvidence.summary.authUsers,
        authUsersBefore,
        authUsersResidualAfter:
          applyEvidence.summary.authUsersResidual,
        constraintDigestAfter: afterCatalog.constraintDigest,
        constraintDigestBefore: beforeCatalog.constraintDigest,
        foreignKeyViolations: 0,
        gatewayRunning:
          gatewayRunning(config.HYBRID_COMPOSE_PROJECT_NAME),
        identityEpochAntiJoinCount:
          applyEvidence.summary.identityEpochAntiJoinCount,
        migrationDigestAfter: afterCatalog.migrationDigest,
        migrationDigestBefore: beforeCatalog.migrationDigest,
        next3100Running: next3100Running(),
        prebackupMatchesCurrent: true,
        rlsDigestAfter: afterCatalog.rlsDigest,
        rlsDigestBefore: beforeCatalog.rlsDigest,
        sourceDataDigest,
        storageHttpCacheControl:
          storageEvidence[0]?.cacheControl,
        storageHttpContentType:
          storageEvidence[0]?.contentType,
        storagePayloadSha256: storageEvidence[0]?.sha256,
        storageSourceSha256:
          storagePairs[0]?.payload.sha256,
        targetDataDigest,
      });
      print({
        auth_users: 0,
        auth_users_residual: 0,
        foreign_key_violations: 0,
        identity_epoch_anti_join:
          applyEvidence.summary.identityEpochAntiJoinCount,
        import_safe: evaluated.importSafe,
        legacy_archive_sha256: legacy.archiveSha256,
        prebackup_sha256: prebackup.archive_sha256,
        public_data_digest: targetDataDigest,
        publication_blockers: evaluated.publicationBlockers,
        publication_safe: evaluated.publicationSafe,
        rls_digest: afterCatalog.rlsDigest,
        status: "APPLY_PASS_GATEWAY_PRIVATE",
        storage: storageEvidence,
      });
    } catch (error) {
      if (!publicCommitted) {
        storageMutation.compensate();
      }
      throw error;
    }
  } finally {
    legacy.cleanup();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "FAIL",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
