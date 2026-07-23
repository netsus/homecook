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
const INVENTORY_PATH = process.env.SECURITY_FUNCTION_INVENTORY_PATH
  ?? path.join(
    REPO_ROOT,
    "docs/security/security-definer-function-authorization-inventory.json",
  );
const ADDITIVE_MANIFEST_PATH = process.env.SECURITY_FUNCTION_ADDITIVE_MANIFEST_PATH
  ?? path.join(
    REPO_ROOT,
    "docs/security/account-session-generation-security-function-authorization-manifest.json",
  );
const ADDITIVE_MIGRATION_PATH = process.env.SECURITY_FUNCTION_ADDITIVE_MIGRATION_PATH
  ?? path.join(
    REPO_ROOT,
    "supabase/migrations/20260723140000_account_session_generation_foundation.sql",
  );
const LOCAL_DATABASE_URL =
  process.env.SECURITY_FUNCTION_DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const FRESH_DATABASE_URL = process.env.SECURITY_FUNCTION_FRESH_DATABASE_URL ?? null;
const DATA_API_SCHEMAS = new Set(["public", "storage", "graphql_public"]);
const PRINCIPALS = ["anon", "authenticated", "service_role"];
const ADDITIVE_PRINCIPALS = [...PRINCIPALS, "supabase_auth_admin"];

const args = new Set(process.argv.slice(2));
const mode = args.has("--write") ? "write" : "check";
const useLinkedRemote = args.has("--linked-remote");
const contractOnly = args.has("--contract-only");
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
    pg_catalog.has_schema_privilege('service_role', namespace.oid, 'USAGE') as service_role_schema_usage,
    pg_catalog.has_function_privilege('supabase_auth_admin', procedure.oid, 'EXECUTE') as supabase_auth_admin_execute,
    pg_catalog.has_schema_privilege('supabase_auth_admin', namespace.oid, 'USAGE') as supabase_auth_admin_schema_usage
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles owner on owner.oid = procedure.proowner
  left join extension_membership on extension_membership.objid = procedure.oid
  where procedure.prokind = 'f'
), selected as (
  select *
  from function_rows
  where schema_name in ('public', 'account_generation_auth_hook')
    and extension_name is null
  union all
  select *
  from function_rows
  where prosecdef
    and not (
      schema_name in ('public', 'account_generation_auth_hook')
      and extension_name is null
    )
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

function normalizeFunctionArgument(argument) {
  const trimmed = argument
    .replace(/--.*$/gmu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!trimmed) return "";

  const withoutMode = trimmed.replace(/^(?:in|out|inout|variadic)\s+/iu, "");
  const tokens = withoutMode.split(" ");
  const type = tokens.length > 1 ? tokens.slice(1).join(" ") : tokens[0];
  return type
    .replace(/^timestamptz$/iu, "timestamp with time zone")
    .replace(/^int8$/iu, "bigint")
    .replace(/^int4$/iu, "integer")
    .toLowerCase();
}

function parseCreatedFunctionDefinitions(migration) {
  const definitionPattern =
    /create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*returns\b/giu;
  const definitions = [];

  for (const match of migration.matchAll(definitionPattern)) {
    const argumentsSql = match[2].trim();
    const argumentTypes = argumentsSql
      ? argumentsSql.split(",").map(normalizeFunctionArgument)
      : [];
    const openingDelimiter = migration.indexOf("$function$", match.index);
    const closingDelimiter = openingDelimiter < 0
      ? -1
      : migration.indexOf("$function$;", openingDelimiter + "$function$".length);
    if (openingDelimiter < 0 || closingDelimiter < 0) {
      throw new Error(`function body delimiter is missing for ${match[1]}`);
    }
    const definitionSql = migration.slice(match.index, closingDelimiter + "$function$;".length);
    const searchPathMatch = definitionSql.match(/set\s+search_path\s*=\s*([^\n]+)\n/iu);
    if (!searchPathMatch) {
      throw new Error(`function search_path is missing for ${match[1]}`);
    }

    definitions.push({
      signature: `${match[1].toLowerCase()}(${argumentTypes.join(", ")})`,
      security_mode: /\bsecurity\s+definer\b/iu.test(definitionSql)
        ? "definer"
        : "invoker",
      safe_search_path: searchPathMatch[1]
        .split(",")
        .map((entry) => entry.trim().replace(/^"|"$/gu, "").toLowerCase()),
    });
  }

  return definitions;
}

function collapseSql(value) {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .replace(/\s*,\s*/gu, ", ")
    .trim()
    .toLowerCase();
}

function parseExecuteAcl(migration, signature) {
  const normalizedSignature = collapseSql(signature);
  const statements = migration
    .split(";")
    .map(collapseSql)
    .filter((statement) => statement.includes(`function ${normalizedSignature}`));
  const allowed = new Set();
  const revoked = new Set();

  for (const statement of statements) {
    const grant = statement.match(/\bgrant execute on function .+ to (.+)$/u);
    if (grant) {
      for (const role of grant[1].split(",").map((entry) => entry.trim())) {
        allowed.add(role);
      }
    }
    const revoke = statement.match(/\brevoke (?:all|execute) on function .+ from (.+)$/u);
    if (revoke) {
      for (const role of revoke[1].split(",").map((entry) => entry.trim())) {
        revoked.add(role);
      }
    }
  }

  return { allowed: [...allowed].sort(), revoked };
}

function assertAdditiveContract(baseContract, manifest, migration) {
  if (manifest.schema_version !== 1
    || manifest.deployment_state !== "pre-deployment"
    || manifest.baseline_application_contract_count !== baseContract.length) {
    throw new Error("additive security function manifest metadata is invalid");
  }

  const functions = manifest.functions ?? [];
  const signatures = functions.map((entry) => entry.signature);
  if (functions.length === 0 || new Set(signatures).size !== functions.length) {
    throw new Error("additive security function manifest signatures are empty or duplicated");
  }
  const baseSignatures = new Set(baseContract.map((entry) => entry.signature));
  const overlap = signatures.filter((signature) => baseSignatures.has(signature));
  if (overlap.length > 0) {
    throw new Error(`additive security function overlaps the historical baseline: ${overlap.join(", ")}`);
  }

  const definitions = parseCreatedFunctionDefinitions(migration);
  const definitionMap = new Map(definitions.map((entry) => [entry.signature, entry]));
  const unclassified = definitions
    .filter((entry) => !signatures.includes(entry.signature))
    .map((entry) => entry.signature);
  const missing = signatures.filter((signature) => !definitionMap.has(signature));
  if (unclassified.length > 0 || missing.length > 0) {
    throw new Error(
      `additive function contract drift; unclassified=${unclassified.join(",") || "none"}; missing=${missing.join(",") || "none"}`,
    );
  }

  for (const entry of functions) {
    const definition = definitionMap.get(entry.signature);
    if (entry.control_class !== "application-controlled"
      || !new Set(["read-only", "mutation", "trigger/internal", "auth-hook"]).has(entry.effect)
      || !new Set(["service-internal", "auth-hook-internal"]).has(entry.exposure)
      || !new Set(["definer", "invoker"]).has(entry.security_mode)
      || definition.security_mode !== entry.security_mode
      || JSON.stringify(definition.safe_search_path) !== JSON.stringify(entry.safe_search_path)
      || entry.safe_search_path[0] !== "pg_catalog"
      || entry.safe_search_path.at(-1) !== "pg_temp") {
      throw new Error(`additive function control metadata is invalid for ${entry.signature}`);
    }
    if (new Set(entry.allowed_principals).size !== entry.allowed_principals.length
      || entry.allowed_principals.some((principal) => !ADDITIVE_PRINCIPALS.includes(principal))) {
      throw new Error(`additive function principal contract is invalid for ${entry.signature}`);
    }

    const acl = parseExecuteAcl(migration, entry.signature);
    if (JSON.stringify(acl.allowed) !== JSON.stringify([...entry.allowed_principals].sort())) {
      throw new Error(`additive function grant drift for ${entry.signature}`);
    }
    for (const principal of ["public", ...PRINCIPALS]) {
      if (!entry.allowed_principals.includes(principal) && !acl.revoked.has(principal)) {
        throw new Error(`additive function revoke is missing for ${entry.signature}: ${principal}`);
      }
    }

    if (entry.owner) {
      const ownerStatement = collapseSql(
        `alter function ${entry.signature} owner to ${entry.owner}`,
      );
      if (!collapseSql(migration).includes(ownerStatement)) {
        throw new Error(`additive function owner drift for ${entry.signature}`);
      }
    }
  }

  return functions;
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

function assertAdditiveEnvironment(additiveContract, currentRows) {
  const currentMap = new Map(currentRows.map((row) => [row.signature, row]));
  const present = additiveContract.filter((entry) => currentMap.has(entry.signature));
  if (present.length === 0) return "pre-deployment";
  if (present.length !== additiveContract.length) {
    const missing = additiveContract
      .filter((entry) => !currentMap.has(entry.signature))
      .map((entry) => entry.signature);
    throw new Error(`partially deployed additive function contract: ${missing.join(", ")}`);
  }

  for (const entry of additiveContract) {
    const row = currentMap.get(entry.signature);
    const actualAllowed = ADDITIVE_PRINCIPALS.filter(
      (principal) => row[`${principal}_execute`],
    );
    if (row.public_execute
      || JSON.stringify(actualAllowed) !== JSON.stringify(entry.allowed_principals)) {
      throw new Error(`additive exact principal drift for ${entry.signature}`);
    }
    if ((entry.security_mode === "definer") !== row.prosecdef) {
      throw new Error(`additive security mode drift for ${entry.signature}`);
    }
    const searchPath = (row.proconfig.match(/search_path=([^}]*)/u)?.[1] ?? "")
      .replace(/["}]/gu, "")
      .split(",")
      .map((value) => value.trim());
    if (JSON.stringify(searchPath) !== JSON.stringify(entry.safe_search_path)) {
      throw new Error(`additive function search_path drift for ${entry.signature}`);
    }
    if (entry.owner && row.owner !== entry.owner) {
      throw new Error(`additive function owner drift for ${entry.signature}`);
    }
  }

  return "post-migration";
}

function assertEnvironment(inventory, environment, currentRows, additiveContract) {
  const environmentState = inventory.environment_states?.[environment];
  const currentMap = new Map(currentRows.map((row) => [row.signature, row]));
  const inventorySignatures = new Set([
    ...inventory.functions.map((entry) => entry.signature),
    ...additiveContract.map((entry) => entry.signature),
  ]);
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
const additiveMigration = await readFile(ADDITIVE_MIGRATION_PATH, "utf8");
const additiveManifest = JSON.parse(await readFile(ADDITIVE_MANIFEST_PATH, "utf8"));
const applicationContract = parseApplicationContract(migration);
const additiveContract = assertAdditiveContract(
  applicationContract,
  additiveManifest,
  additiveMigration,
);
if (contractOnly) {
  if (mode !== "check" || useLinkedRemote) {
    throw new Error("--contract-only cannot be combined with write or remote modes");
  }
}
const recordedInventory = mode === "check"
  ? JSON.parse(await readFile(INVENTORY_PATH, "utf8"))
  : null;
if (recordedInventory) {
  assertApplicationContract(recordedInventory, applicationContract);
  for (const environment of Object.keys(
    recordedInventory.environment_baseline_sha256,
  )) {
    assertRecordedEnvironmentPolicy(recordedInventory, environment);
  }
}
if (contractOnly) {
  console.warn(
    "security function authorization contracts are valid; "
      + `${additiveContract.length} pre-deployment additive application functions classified`,
  );
  process.exit(0);
}
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
  const inventory = recordedInventory;
  for (const [environment, rows] of Object.entries(environments)) {
    assertEnvironment(inventory, environment, rows, additiveContract);
  }
  const additiveStates = Object.entries(environments).map(([environment, rows]) =>
    `${environment}:${assertAdditiveEnvironment(additiveContract, rows)}`);
  console.warn(
    `security function authorization inventory is valid for ${Object.keys(environments).join("+")}; `
      + `${additiveContract.length} pre-deployment additive application functions `
      + `classified (${additiveStates.join(",")})`,
  );
}
