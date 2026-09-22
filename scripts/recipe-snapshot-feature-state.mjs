#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFullLocalBackupReadiness } from "./full-local-production-runtime.mjs";
import { assertPrivateArtifactParent, assertRegularReadinessArtifact } from "./lib/full-local-backup-readiness.mjs";
import { parseFullLocalProductionConfig, selectFullLocalProductionResources } from "./lib/full-local-production-resources.mjs";
import { FEATURE_STATE_SELECT, parseFeatureStateArguments, resolvePostgrestDatabaseTarget, runFeatureStateOperation } from "./lib/recipe-snapshot-feature-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  // Docker/psql stderr can include credentials or row data. Never forward it.
  if (result.status !== 0 || result.error) throw new Error("Local Docker/database operation failed; no raw diagnostics emitted");
  return result.stdout;
}
function privateConfig(path) {
  assertPrivateArtifactParent(path);
  assertRegularReadinessArtifact(path);
  if (lstatSync(path).uid !== process.getuid?.() || realpathSync(path) !== path
    || !relative(ROOT, path).startsWith("../")) throw new Error("Config must be owner-controlled and outside the repository");
  return readFileSync(path);
}
function localInventory(config) {
  const context = JSON.parse(docker(["context", "inspect"]));
  const endpoint = process.env.DOCKER_CONTEXT ? context[0]?.Endpoints?.docker?.Host
    : process.env.DOCKER_HOST || context[0]?.Endpoints?.docker?.Host;
  if (typeof endpoint !== "string" || !endpoint.startsWith("unix://")) throw new Error("Only local Unix Docker transport is allowed");
  const project = config.FULL_LOCAL_COMPOSE_PROJECT_NAME;
  if (!/^[a-z0-9][a-z0-9_.-]{2,127}$/.test(project ?? "")) throw new Error("Exact Compose project is required");
  const ids = docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) throw new Error("Existing full-local containers are required");
  const containers = JSON.parse(docker(["inspect", ...ids]));
  for (const name of [config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]) {
    if (!/^[a-z0-9][a-z0-9_.-]{2,127}$/.test(name ?? "")) throw new Error("Exact volume names are required");
  }
  const volumes = JSON.parse(docker(["volume", "inspect", config.FULL_LOCAL_POSTGRES_VOLUME_NAME, config.FULL_LOCAL_STORAGE_VOLUME_NAME]));
  const resources = selectFullLocalProductionResources({ config, containers, volumes });
  const postgres = containers.find((row) => row.Id === resources.postgresContainerId);
  if (!postgres.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === resources.postgresVolumeName && mount.Destination === "/var/lib/postgresql/data")) {
    throw new Error("PostgreSQL data mount does not match the configured volume");
  }
  const rest = containers.filter((row) => row.Config?.Labels?.["com.docker.compose.service"] === "postgrest");
  if (rest.length !== 1) throw new Error("Exact existing PostgREST container is required");
  const scriptDigests = {};
  let canonicalScriptsMatch = true;
  for (const name of ["secret-entrypoint.sh", "start-postgrest.sh"]) {
    const mount = rest[0].Mounts?.find((item) => item.Destination === `/homecook/${name}`);
    if (mount?.Type !== "bind" || mount.RW !== false || !lstatSync(mount.Source).isFile()) { canonicalScriptsMatch = false; continue; }
    const observed = digest(readFileSync(mount.Source));
    scriptDigests[name] = observed;
    // Original deployed start script predates rehearsal DB selection; its target
    // is literally authenticator@postgres:5432/postgres. Pin exact historical
    // bytes from c39a9556498f892267d9393c072814d32d88bffd rather than parsing shell.
    const supportedLegacyStart = name === "start-postgrest.sh"
      && observed === "42b2ea375e8e535191918827c7ef9826519aa2ea159bb1a1406c2b891218b16b";
    if (!supportedLegacyStart && observed !== digest(readFileSync(resolve(ROOT, "infra/full-local-supabase", name)))) canonicalScriptsMatch = false;
  }
  const { loginRole } = resolvePostgrestDatabaseTarget({ environment: rest[0].Config.Env ?? [], command: rest[0].Config.Cmd,
    entrypoint: rest[0].Config.Entrypoint, canonicalScriptsMatch }, resources.postgresContainerName);
  return { resources, loginRole, identity: digest(JSON.stringify({ endpoint, resources, postgrestId: rest[0].Id, postgrestEnvironment: rest[0].Config.Env, scriptDigests, mounts: postgres.Mounts })) };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseFeatureStateArguments(argv);
  const configBytes = privateConfig(options.config);
  const config = parseFullLocalProductionConfig(configBytes.toString("utf8"));
  const target = localInventory(config);
  const query = (sql) => docker(["exec", "-i", target.resources.postgresContainerId,
    "psql", "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-U", "postgres", "-d", "postgres"], sql);
  // Role configuration is NOT used for activation: PostgreSQL SET ROLE does not
  // necessarily apply login defaults. Database defaults cover every new pool connection.
  const roleExists = query(`begin read only; select rolcanlogin from pg_catalog.pg_roles where rolname = '${target.loginRole}'; rollback;`).trim();
  if (roleExists !== "t") throw new Error("Actual PostgREST login role is not present/login-enabled");
  const result = await runFeatureStateOperation(options, {
    read: () => JSON.parse(query(`begin read only; set local statement_timeout = '15s'; ${FEATURE_STATE_SELECT}; rollback;`).trim()),
    verifyBackup: () => loadFullLocalBackupReadiness({ config }, target.resources),
    verifyTarget: () => {
      if (digest(configBytes) !== digest(privateConfig(options.config)) || localInventory(config).identity !== target.identity) throw new Error("Exact local target/config changed during preflight");
    },
    apply: (sql) => query(sql),
  });
  return { ...result, database_scope: "postgres/new_connections", postgrest_login_role: target.loginRole };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
