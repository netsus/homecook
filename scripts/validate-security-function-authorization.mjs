import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";

const REPO_ROOT = process.cwd();
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  "supabase/migrations/20260723090000_security_definer_mutation_authorization_hotfix.sql",
);
const INVENTORY_PATH = path.join(
  REPO_ROOT,
  "docs/security/security-definer-function-authorization-inventory.json",
);
const LOCAL_DATABASE_URL =
  process.env.SECURITY_FUNCTION_DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const FRESH_DATABASE_URL = process.env.SECURITY_FUNCTION_FRESH_DATABASE_URL ?? null;
const DATA_API_SCHEMAS = new Set(["public", "storage", "graphql_public"]);
const PRINCIPALS = ["anon", "authenticated", "service_role"];

const args = new Set(process.argv.slice(2));
const mode = args.has("--write") ? "write" : "check";
const useLinkedRemote = args.has("--linked-remote");
const linkedRoot = useLinkedRemote
  ? resolveSecurityFunctionLinkedRoot()
  : REPO_ROOT;
const remoteStateIndex = process.argv.indexOf("--remote-state");
const remoteState = remoteStateIndex >= 0
  ? process.argv[remoteStateIndex + 1]
  : null;
const environmentName = process.env.SECURITY_FUNCTION_ENVIRONMENT ?? "local";

const metadataSql = String.raw`
with extension_membership as (
  select
    dependency.objid,
    extension.extname,
    extension.extversion
  from pg_catalog.pg_depend dependency
  join pg_catalog.pg_extension extension on extension.oid = dependency.refobjid
  where dependency.classid = 'pg_proc'::pg_catalog.regclass
    and dependency.deptype = 'e'
), function_rows as (
  select
    format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_catalog.oidvectortypes(procedure.proargtypes)
    ) as signature,
    namespace.nspname as schema_name,
    owner.rolname as owner,
    extension_membership.extname as extension_name,
    extension_membership.extversion as extension_version,
    procedure.prosecdef,
    procedure.provolatile,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    coalesce(procedure.proacl::text, '') as proacl,
    coalesce(procedure.proconfig::text, '') as proconfig,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          namespace.nspacl,
          pg_catalog.acldefault('n', namespace.nspowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'USAGE'
    ) as public_schema_usage,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_schema_privilege('anon', namespace.oid, 'USAGE') as anon_schema_usage,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    pg_catalog.has_schema_privilege('authenticated', namespace.oid, 'USAGE') as authenticated_schema_usage,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
    pg_catalog.has_schema_privilege('service_role', namespace.oid, 'USAGE') as service_role_schema_usage
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles owner on owner.oid = procedure.proowner
  left join extension_membership on extension_membership.objid = procedure.oid
  where procedure.prokind = 'f'
), selected as (
  select *
  from function_rows
  where schema_name = 'public'
    and extension_name is null
  union all
  select *
  from function_rows
  where prosecdef
    and not (schema_name = 'public' and extension_name is null)
)
select coalesce(jsonb_agg(to_jsonb(selected) order by signature), '[]'::jsonb)
from selected;
`;

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "command failed without stderr";
    throw new Error(`${command} failed: ${stderr}`);
  }

  return result.stdout;
}

function parseSupabaseDatabaseEnvironment(output) {
  const environment = { ...process.env };
  let matched = 0;

  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^export ([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|(\S+))$/u);
    if (!match) continue;
    environment[match[1]] = match[2] ?? match[3] ?? match[4];
    matched += 1;
  }

  if (matched === 0) {
    throw new Error("linked Supabase database environment was not found");
  }

  return environment;
}

function collectMetadata(databaseEnvironment, databaseUrl = null) {
  const connectionArgs = databaseUrl ? ["--dbname", databaseUrl] : [];
  const stdout = run(
    "psql",
    ["-X", "-At", "-v", "ON_ERROR_STOP=1", ...connectionArgs, "-c", metadataSql],
    { env: databaseEnvironment },
  );
  return JSON.parse(stdout);
}

function collectLocalMetadata() {
  return collectMetadata(process.env, LOCAL_DATABASE_URL);
}

function collectLinkedRemoteMetadata() {
  const dryRun = run(
    "pnpm",
    ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
    { cwd: linkedRoot },
  );
  return collectMetadata(parseSupabaseDatabaseEnvironment(dryRun));
}

function parseApplicationContract(migration) {
  const rowPattern = /^\s+\('([^']+)', '([^']+)', '([^']+)', (array\[[^\n]*\]|array\[\]::text\[\]), (true|false)\)[,;]$/gmu;
  const rows = [];

  for (const match of migration.matchAll(rowPattern)) {
    rows.push({
      signature: match[1],
      control_class: "application-controlled",
      effect: match[2],
      exposure: match[3],
      allowed_principals: [...match[4].matchAll(/'([^']+)'/gu)].map((role) => role[1]),
      optional_before_local_nutrition_head: match[5] === "true",
    });
  }

  if (rows.length !== 74 || new Set(rows.map((row) => row.signature)).size !== rows.length) {
    throw new Error(`expected 74 unique application contract rows, found ${rows.length}`);
  }

  return rows;
}

function providerClassification(signature) {
  if (signature === "pgbouncer.get_auth(text)") {
    return { effect: "auth-hook", exposure: "auth-hook-internal" };
  }
  if (signature === "graphql.get_schema_version()") {
    return { effect: "read-only", exposure: "service-internal" };
  }
  return { effect: "mutation", exposure: "service-internal" };
}

function normalizeObservation(row) {
  if (!row) return { present: false };

  const principalPrivileges = {
    PUBLIC: {
      schema_usage: row.public_schema_usage,
      execute: row.public_execute,
    },
  };
  for (const principal of PRINCIPALS) {
    principalPrivileges[principal] = {
      schema_usage: row[`${principal}_schema_usage`],
      execute: row[`${principal}_execute`],
    };
  }

  const schemaExposed = DATA_API_SCHEMAS.has(row.schema_name);
  return {
    present: true,
    owner: row.owner,
    extension_name: row.extension_name,
    extension_version: row.extension_version,
    security_definer: row.prosecdef,
    volatility: row.provolatile,
    result_type: row.result_type,
    proacl: row.proacl,
    proconfig: row.proconfig,
    schema_exposed_to_data_api: schemaExposed,
    principal_privileges: principalPrivileges,
    effective_data_api_callers: PRINCIPALS.filter(
      (principal) => schemaExposed
        && principalPrivileges[principal].schema_usage
        && principalPrivileges[principal].execute,
    ),
  };
}

function stableDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildInventory(applicationContract, environmentRows, previousInventory = null) {
  const environmentMaps = Object.fromEntries(
    Object.entries(environmentRows).map(([environment, rows]) => [
      environment,
      new Map(rows.map((row) => [row.signature, row])),
    ]),
  );
  const providerSignatures = [...new Set(
    [
      ...Object.values(environmentRows)
        .flat()
        .filter((row) => !(row.schema_name === "public" && row.extension_name === null))
        .map((row) => row.signature),
      ...(previousInventory?.functions ?? [])
        .filter((entry) => entry.control_class === "provider/extension-managed")
        .map((entry) => entry.signature),
    ],
  )].sort();
  const previousFunctions = new Map(
    (previousInventory?.functions ?? []).map((entry) => [entry.signature, entry]),
  );
  const environmentNames = [...new Set([
    ...Object.keys(previousInventory?.environment_baseline_sha256 ?? {}),
    ...Object.keys(environmentRows),
  ])];

  function observationsFor(signature) {
    return Object.fromEntries(environmentNames.map((environment) => {
      const rows = environmentMaps[environment];
      if (rows) return [environment, normalizeObservation(rows.get(signature))];
      return [
        environment,
        previousFunctions.get(signature)?.observations?.[environment] ?? { present: false },
      ];
    }));
  }

  const applicationFunctions = applicationContract.map((contract) => ({
    ...contract,
    observations: observationsFor(contract.signature),
  }));
  const providerFunctions = providerSignatures.map((signature) => ({
    signature,
    control_class: "provider/extension-managed",
    ...providerClassification(signature),
    allowed_principals: [],
    observations: observationsFor(signature),
  }));
  const functions = [...applicationFunctions, ...providerFunctions];

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    trusted_application_schema: "public",
    data_api_exposed_schemas: [...DATA_API_SCHEMAS].sort(),
    principal_contract: ["PUBLIC", ...PRINCIPALS],
    application_contract_sha256: stableDigest(applicationContract),
    environment_baseline_sha256: Object.fromEntries(
      environmentNames.map((environment) => [
        environment,
        stableDigest(functions.map((entry) => ({
          signature: entry.signature,
          observation: entry.observations[environment],
        }))),
      ]),
    ),
    environment_states: Object.fromEntries(environmentNames.map((environment) => [
      environment,
      environment === "remote"
        ? remoteState
        : previousInventory?.environment_states?.[environment] ?? "post-migration",
    ])),
    functions,
  };
}

function assertApplicationContract(inventory, applicationContract) {
  const expected = applicationContract.map((entry) => ({
    signature: entry.signature,
    control_class: entry.control_class,
    effect: entry.effect,
    exposure: entry.exposure,
    allowed_principals: entry.allowed_principals,
    optional_before_local_nutrition_head: entry.optional_before_local_nutrition_head,
  }));
  const actual = inventory.functions
    .filter((entry) => entry.control_class === "application-controlled")
    .map((entry) => ({
      signature: entry.signature,
      control_class: entry.control_class,
      effect: entry.effect,
      exposure: entry.exposure,
      allowed_principals: entry.allowed_principals,
      optional_before_local_nutrition_head: entry.optional_before_local_nutrition_head,
    }));

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("inventory application contract does not match the migration contract");
  }
}

function assertRecordedEnvironmentPolicy(inventory, environment) {
  const environmentState = inventory.environment_states?.[environment];
  if (!new Set(["pre-deployment", "post-migration"]).has(environmentState)) {
    throw new Error(`recorded ${environment} deployment state is missing or invalid`);
  }

  for (const entry of inventory.functions) {
    const observation = entry.observations?.[environment];
    if (!observation) {
      throw new Error(`recorded ${environment} observation is missing for ${entry.signature}`);
    }
    if (!observation.present) {
      if (environmentState === "post-migration"
        && entry.control_class === "application-controlled"
        && !entry.optional_before_local_nutrition_head) {
        throw new Error(`recorded ${environment} application function is missing: ${entry.signature}`);
      }
      continue;
    }

    if (entry.control_class === "provider/extension-managed") {
      if (entry.effect === "mutation"
        && observation.schema_exposed_to_data_api
        && observation.effective_data_api_callers.length > 0) {
        throw new Error(
          `recorded ${environment} provider mutation is Data API callable: ${entry.signature}`,
        );
      }
      continue;
    }

    if (environmentState === "pre-deployment") continue;

    const actualAllowed = PRINCIPALS.filter(
      (principal) => observation.principal_privileges[principal].execute,
    );
    if (observation.principal_privileges.PUBLIC.execute
      || JSON.stringify(actualAllowed) !== JSON.stringify(entry.allowed_principals)) {
      throw new Error(`recorded ${environment} exact principal drift for ${entry.signature}`);
    }
    if (observation.security_definer) {
      const searchPath = (observation.proconfig.match(/search_path=([^}]*)/u)?.[1] ?? "")
        .replace(/["}]/gu, "")
        .trim();
      if (!searchPath.startsWith("pg_catalog") || !searchPath.endsWith("pg_temp")) {
        throw new Error(
          `recorded ${environment} unsafe SECURITY DEFINER search_path for ${entry.signature}`,
        );
      }
    }
  }
}

function assertEnvironment(inventory, environment, currentRows) {
  const environmentState = inventory.environment_states?.[environment];
  const currentMap = new Map(currentRows.map((row) => [row.signature, row]));
  const inventorySignatures = new Set(inventory.functions.map((entry) => entry.signature));
  const unexpected = currentRows
    .filter((row) => !inventorySignatures.has(row.signature))
    .map((row) => row.signature);
  if (unexpected.length > 0) {
    throw new Error(`unclassified function inventory drift: ${unexpected.join(", ")}`);
  }

  for (const entry of inventory.functions) {
    const row = currentMap.get(entry.signature);
    const expectedObservation = entry.observations[environment];
    const actualObservation = normalizeObservation(row);

    if (JSON.stringify(actualObservation) !== JSON.stringify(expectedObservation)) {
      throw new Error(`${environment} baseline drift for ${entry.signature}`);
    }

    if (entry.control_class !== "application-controlled"
      || !row
      || environmentState === "pre-deployment") continue;

    const actualAllowed = PRINCIPALS.filter(
      (principal) => row[`${principal}_execute`],
    );
    if (row.public_execute || JSON.stringify(actualAllowed) !== JSON.stringify(entry.allowed_principals)) {
      throw new Error(`exact principal drift for ${entry.signature}`);
    }
    if (row.prosecdef) {
      const searchPath = (row.proconfig.match(/search_path=([^}]*)/u)?.[1] ?? "")
        .replace(/["}]/gu, "")
        .trim();
      if (!searchPath.startsWith("pg_catalog") || !searchPath.endsWith("pg_temp")) {
        throw new Error(`unsafe SECURITY DEFINER search_path for ${entry.signature}`);
      }
    }
  }
}

const migration = await readFile(MIGRATION_PATH, "utf8");
const applicationContract = parseApplicationContract(migration);
const environments = { [environmentName]: collectLocalMetadata() };
if (mode === "write" && FRESH_DATABASE_URL) {
  environments.fresh = collectMetadata(process.env, FRESH_DATABASE_URL);
}
if (useLinkedRemote) environments.remote = collectLinkedRemoteMetadata();

if (mode === "write") {
  if (!useLinkedRemote) {
    throw new Error("--write requires --linked-remote so the artifact contains both baselines");
  }
  if (!new Set(["pre-deployment", "post-migration"]).has(remoteState)) {
    throw new Error("--write requires --remote-state pre-deployment|post-migration");
  }
  const previousInventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
  const inventory = buildInventory(applicationContract, environments, previousInventory);
  await writeFile(INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  console.warn(`wrote ${inventory.functions.length} classified functions to ${INVENTORY_PATH}`);
} else {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
  assertApplicationContract(inventory, applicationContract);
  for (const environment of Object.keys(inventory.environment_baseline_sha256)) {
    assertRecordedEnvironmentPolicy(inventory, environment);
  }
  for (const [environment, rows] of Object.entries(environments)) {
    assertEnvironment(inventory, environment, rows);
  }
  console.warn(`security function authorization inventory is valid for ${Object.keys(environments).join("+")}`);
}
