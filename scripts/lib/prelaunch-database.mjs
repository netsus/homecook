import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPinnedLocalDockerTarget } from "./local-supabase-isolated-runtime.mjs";
import { parseFullLocalProductionConfig, selectFullLocalProductionResources } from "./full-local-production-resources.mjs";

const FILE = /^([0-9]{14})_[A-Za-z0-9_-]+\.sql$/u;
const SHA = /^[a-f0-9]{64}$/u;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => `'${String(value).replace(/'/gu, "''")}'`;
const records = (rows) => rows.map(({ filename, sha256 }) => ({ filename, sha256 }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function planPrelaunchMigrations(migrations, state, baseline) {
  const source = records(migrations);
  for (const row of source) {
    if (!FILE.test(row.filename) || !SHA.test(row.sha256)) throw new Error("Invalid migration filename or checksum");
  }
  if (new Set(source.map((row) => row.filename.slice(0, 14))).size !== source.length) throw new Error("Duplicate migration version");
  let applied = state.applied;
  if (!state.exists) {
    if (!baseline) return { pending: source.map((row) => row.filename), baselineRequired: true, applied: [], source };
    if (baseline.schema !== "homecook.prelaunch-db-baseline.v1" || baseline.verified !== true || !Array.isArray(baseline.applied)) throw new Error("Explicit verified database baseline required");
    applied = records(baseline.applied);
    if (state.supabaseVersions.length && !same([...state.supabaseVersions].sort(), applied.map((row) => row.filename.slice(0, 14)).sort())) throw new Error("Supabase migration history differs from verified baseline");
  }
  for (const [index, row] of applied.entries()) {
    const found = source.find((entry) => entry.filename === row.filename);
    if (!found) throw new Error("Previously applied migration missing/deleted from candidate");
    if (found.sha256 !== row.sha256) throw new Error("Previously applied migration checksum changed");
    if (source[index]?.filename !== row.filename) throw new Error("Applied migration history must be an ordered prefix");
  }
  const pending = migrations.slice(applied.length);
  for (const migration of pending) validatePrelaunchMigrationSql(migration.sql);
  // Pattern eligibility only: the CLI separately requires verified old-app compatibility.
  return { pending: pending.map((row) => row.filename), baselineRequired: false, migrationMode: "additive", applied: records(applied), source };
}

// This deliberately narrow scanner is a deployment guard, not an arbitrary-SQL sandbox.
// Procedural/dynamic SQL and data rewrites use the separate reviewed DB procedure.
export function validatePrelaunchMigrationSql(sql) {
  const statements = [];
  let start = 0;
  let masked = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end;
      masked += " ";
    } else if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("Unclosed SQL comment");
      masked += " ";
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      const quoteStart = i;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        // Escape-string variants have server-setting-dependent parsing; keep this lane simple.
        if (sql[i] === "\\" && sql[i + 1] === "'") throw new Error("Escaped SQL strings require reviewed database deployment");
        i++;
      }
      if (!closed) throw new Error("Unclosed SQL literal");
      masked += quote === '"' ? sql.slice(quoteStart, i - 1).toUpperCase() : " LITERAL ";
    } else if (sql[i] === "$" || sql[i] === "\\") {
      throw new Error("Procedural SQL and psql commands require reviewed database deployment");
    } else if (sql[i] === ";") {
      if (masked.trim()) statements.push({ text: sql.slice(start, i + 1), tokens: masked.toUpperCase().trim() });
      masked = ""; start = ++i;
    } else { masked += sql[i++]; }
  }
  if (masked.trim()) throw new Error("Migration statements must end with semicolon");
  if (statements[0]?.tokens === "BEGIN" && statements.at(-1)?.tokens === "COMMIT") { statements.shift(); statements.pop(); }
  if (!statements.length) throw new Error("Empty additive migration");
  for (const { tokens } of statements) {
    if (/\b(HOMECOOK_DEPLOY|SUPABASE_MIGRATIONS|CONCURRENTLY|DROP|TRUNCATE|DELETE|UPDATE|PROGRAM|COMMIT|ROLLBACK|VACUUM|TABLESPACE|TEMP|TEMPORARY|UNLOGGED)\b/u.test(tokens)) throw new Error("Destructive or transaction-unsafe SQL requires reviewed database deployment");
    if (!/^(CREATE TABLE\s|CREATE (UNIQUE )?INDEX\s|ALTER TABLE\s)/u.test(tokens)) throw new Error("Only additive table/index migrations are supported by quick database deployment");
    if (tokens.startsWith("ALTER TABLE") && (!/\bADD\s+(COLUMN\s+|CONSTRAINT\s+)/u.test(tokens) || /\b(ALTER|RENAME|OWNER|DISABLE|ENABLE|SET|RESET|ATTACH|DETACH|INHERIT|VALIDATE)\b/u.test(tokens.slice("ALTER TABLE".length)))) throw new Error("Only ADD COLUMN / ADD CONSTRAINT supported for ALTER TABLE");
    if (/\b(CREATE TABLE.*\bAS\b|SELECT|EXECUTE|FUNCTION|CALL)\b/u.test(tokens)) throw new Error("Query or executable SQL requires reviewed database deployment");
  }
  return statements.map((statement) => statement.text).join("\n");
}

export function createPrelaunchDatabaseEngine({ readMigrations, adapter, readBaseline = async () => undefined, checkCancelled = () => {} }) {
  let plannedFingerprint;
  async function snapshot() {
    const migrations = await readMigrations();
    const identity = await adapter.inspect();
    const state = await adapter.readState(identity);
    const baseline = await readBaseline();
    const plan = planPrelaunchMigrations(migrations, state, baseline);
    const fingerprint = digest(JSON.stringify({ identity, state, source: plan.source, applied: plan.applied }));
    return { migrations, identity, state, plan, fingerprint };
  }
  return {
    async plan() {
      const current = await snapshot();
      plannedFingerprint = current.fingerprint;
      return current.plan;
    },
    async apply() {
      const current = await snapshot();
      if (plannedFingerprint && plannedFingerprint !== current.fingerprint) throw new Error("Database target/history/source changed after plan; plan again");
      if (current.plan.baselineRequired) throw new Error("Explicit verified database baseline required before first migration");
      const pending = current.migrations.filter((row) => current.plan.pending.includes(row.filename)).map((row) => ({ ...row, sql: validatePrelaunchMigrationSql(row.sql) }));
      if (!pending.length && current.state.exists) return { changed: false, applied: [], backupPath: null };
      checkCancelled();
      const backupPath = await adapter.backup(current.identity);
      const afterBackup = await snapshot();
      if (current.fingerprint !== afterBackup.fingerprint) throw new Error("Database target identity/history/source changed during backup");
      checkCancelled();
      const attempted = pending.map((row) => row.filename);
      let committed = false;
      try {
        await adapter.transact(current.identity, current.state, current.plan.applied, pending);
        committed = true;
        plannedFingerprint = undefined;
        const verified = await snapshot();
        if (verified.plan.pending.length || !verified.state.exists || !same(verified.identity, current.identity)) throw new Error("Database migration verification failed");
        return { changed: true, applied: attempted, backupPath, outcome: "committed" };
      } catch (error) {
        // Preserve recovery evidence even if the acknowledgement or post-commit check fails.
        throw Object.assign(error instanceof Error ? error : new Error("Database migration outcome requires inspection"), {
          databaseState: { changed: true, applied: committed ? attempted : [], attempted, backupPath, outcome: committed ? "committed" : "uncertain" },
        });
      }
    },
    async verify() {
      const current = await snapshot();
      if (current.plan.baselineRequired || current.plan.pending.length) throw new Error("Database has pending or unverified migration history");
      return current.plan;
    },
    async close() {},
  };
}

async function privateFile(file, repositoryRoot) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error("Database configuration/baseline must be an owner-only regular file");
  const resolved = await realpath(file);
  const repo = await realpath(repositoryRoot);
  if (resolved.startsWith(`${repo}${path.sep}`)) throw new Error("Database configuration/baseline must be outside repository");
  return readFile(file, "utf8");
}

export async function readPrelaunchMigrationFiles(repositoryRoot) {
    const directory = path.join(repositoryRoot, "supabase/migrations");
    const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    return Promise.all(names.map(async (filename) => {
      if (!FILE.test(filename)) throw new Error("Unsafe migration filename");
      const file = path.join(directory, filename);
      if (!(await lstat(file)).isFile()) throw new Error("Migration must be a regular file");
      const bytes = await readFile(file);
      let sql;
      try { sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("Migration must be valid UTF-8"); }
      return { filename, sha256: digest(bytes), sql };
    }));
  }

/** @param {{ repositoryRoot: string, configPath: string, backupRoot: string, baselinePath?: string, logFd?: number, checkCancelled?: () => void }} options */
export function createPrelaunchDatabase({ repositoryRoot, configPath, backupRoot, baselinePath, checkCancelled }) {
  let dockerEnv;
  function run(args, options = {}) {
    const result = spawnSync("docker", args, { env: dockerEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options });
    if (result.status !== 0) throw new Error(`Database ${args[0]} operation failed; database output withheld`);
    return result.stdout;
  }
  function psql(identity, sql) {
    return run(["exec", "-i", identity.postgresContainerId, "psql", "--username", "supabase_admin", "--dbname", "postgres", "--no-psqlrc", "--no-align", "--tuples-only", "--quiet", "--set", "ON_ERROR_STOP=1"], { input: sql });
  }
  const adapter = {
    async inspect() {
      const config = parseFullLocalProductionConfig(await privateFile(configPath, repositoryRoot));
      if (!dockerEnv) {
        const pinned = readPinnedLocalDockerTarget();
        dockerEnv = { ...process.env, DOCKER_HOST: pinned.docker_host };
        delete dockerEnv.DOCKER_CONTEXT;
        delete dockerEnv.DOCKER_TLS_VERIFY;
        delete dockerEnv.DOCKER_CERT_PATH;
      }
      const ids = run(["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${config.FULL_LOCAL_COMPOSE_PROJECT_NAME}`]).trim().split(/\s+/u).filter(Boolean);
      if (!ids.length) throw new Error("No exact configured database container");
      const containers = JSON.parse(run(["inspect", ...ids]));
      const volumes = JSON.parse(run(["volume", "inspect", config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]));
      const selected = selectFullLocalProductionResources({ config, containers, volumes });
      const container = containers.find((item) => item.Id === selected.postgresContainerId);
      const mounts = container.Mounts.filter((mount) => mount.Destination === "/var/lib/postgresql/data");
      if (mounts.length !== 1 || mounts[0].Type !== "volume" || mounts[0].Name !== selected.postgresVolumeName || mounts[0].RW !== true) throw new Error("Database volume mount identity mismatch");
      return selected;
    },
    async readState(identity) {
      const available = JSON.parse(psql(identity, "SELECT json_build_object('exists',to_regclass('homecook_deploy.migrations') IS NOT NULL,'supabase',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL);"));
      const applied = available.exists ? JSON.parse(psql(identity, "SELECT coalesce(json_agg(t ORDER BY filename),'[]'::json) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t;")) : [];
      const supabaseVersions = available.supabase ? JSON.parse(psql(identity, "SELECT coalesce(json_agg(version ORDER BY version),'[]'::json) FROM supabase_migrations.schema_migrations;")) : [];
      return { exists: available.exists, applied, supabaseVersions };
    },
    async backup(identity) {
      await mkdir(backupRoot, { recursive: true, mode: 0o700 });
      const stat = await lstat(backupRoot);
      const resolved = await realpath(backupRoot);
      const repo = await realpath(repositoryRoot);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid() || resolved === repo || resolved.startsWith(`${repo}${path.sep}`)) throw new Error("Backup root must be owner-only directory outside repository");
      const directory = await mkdtemp(path.join(resolved, "prelaunch-db-"));
      const dump = path.join(directory, "postgres.dump");
      const fd = openSync(dump, "wx", 0o600);
      try { run(["exec", identity.postgresContainerId, "pg_dump", "--username", "supabase_admin", "--dbname", "postgres", "--format=c"], { stdio: ["ignore", fd, "pipe"] }); }
      finally { closeSync(fd); }
      const readFd = openSync(dump, "r");
      try { run(["exec", "-i", identity.postgresContainerId, "pg_restore", "--list"], { stdio: [readFd, "pipe", "pipe"] }); }
      finally { closeSync(readFd); }
      const bytes = await readFile(dump);
      if (!bytes.length) throw new Error("Empty database backup");
      await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify({ schema: "homecook.prelaunch-db-backup.v1", createdAt: new Date().toISOString(), sha256: digest(bytes), bytes: bytes.length, postgresContainerId: identity.postgresContainerId })}\n`, { flag: "wx", mode: 0o600 });
      return dump;
    },
    async transact(identity, expectedState, baselineRows, pending) {
      const expectedRows = JSON.stringify(expectedState.applied);
      const expectedSupabase = JSON.stringify(expectedState.supabaseVersions);
      const insert = (row) => `INSERT INTO homecook_deploy.migrations(filename,sha256) VALUES (${literal(row.filename)},${literal(row.sha256)});`;
      const sql = [
        "BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL standard_conforming_strings=on;",
        "SELECT pg_advisory_xact_lock(104230921,77101);",
        `DO $guard$ BEGIN IF (to_regclass('homecook_deploy.migrations') IS NOT NULL) <> ${expectedState.exists ? "true" : "false"} THEN RAISE EXCEPTION 'Migration history changed'; END IF; END $guard$;`,
        `DO $guard$ DECLARE versions jsonb := '[]'::jsonb; BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN EXECUTE 'SELECT coalesce(jsonb_agg(version ORDER BY version), ''[ ]''::jsonb) FROM supabase_migrations.schema_migrations' INTO versions; END IF; IF versions <> ${literal(expectedSupabase)}::jsonb THEN RAISE EXCEPTION 'Supabase migration history changed'; END IF; END $guard$;`,
        "CREATE SCHEMA IF NOT EXISTS homecook_deploy; REVOKE ALL ON SCHEMA homecook_deploy FROM PUBLIC;",
        "CREATE TABLE IF NOT EXISTS homecook_deploy.migrations(filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON homecook_deploy.migrations FROM PUBLIC;",
        "DO $acl$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON SCHEMA homecook_deploy FROM %I',role_name); EXECUTE format('REVOKE ALL ON homecook_deploy.migrations FROM %I',role_name); END IF; END LOOP; END $acl$;",
        `DO $guard$ BEGIN IF (SELECT coalesce(jsonb_agg(t ORDER BY filename),'[]'::jsonb) FROM (SELECT filename,sha256 FROM homecook_deploy.migrations) t) <> ${literal(expectedRows)}::jsonb THEN RAISE EXCEPTION 'Migration history changed'; END IF; END $guard$;`,
        ...(!expectedState.exists ? baselineRows.map(insert) : []),
        ...pending.flatMap((row) => [row.sql, insert(row)]),
        "NOTIFY pgrst, 'reload schema'; COMMIT;",
      ].join("\n");
      psql(identity, sql);
    },
  };
  return createPrelaunchDatabaseEngine({ readMigrations: () => readPrelaunchMigrationFiles(repositoryRoot), adapter, checkCancelled, readBaseline: async () => {
    if (!baselinePath) return undefined;
    return JSON.parse(await privateFile(baselinePath, repositoryRoot));
  } });
}
