#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureDockerRunning } from "./lib/local-docker.mjs";
import {
  RUNTIME_SUPABASE_CLI_PACKAGE,
  assertNoIsolatedDockerOom,
  assertNoIsolatedDockerResources,
  assertOwnedDockerResources,
  assertPinnedSupabaseCliVersion,
  buildIsolatedSupabaseStartArgs,
  buildSupabaseCliArgs,
  createIsolatedSupabaseProject,
  readPinnedLocalDockerTarget,
  removeIsolatedDockerResources,
} from "./lib/local-supabase-isolated-runtime.mjs";

const repositoryRoot = process.cwd();
const pnpmEntrypoint = process.env.npm_execpath?.endsWith(".cjs")
  ? process.env.npm_execpath
  : null;
const pnpmCommand = pnpmEntrypoint ? process.execPath : "pnpm";
const pnpmArgs = (commandArgs) => pnpmEntrypoint
  ? [pnpmEntrypoint, ...commandArgs]
  : commandArgs;
const args = process.argv.slice(2);
if (args.some((arg) => !["--beta-flow-gaps", "--food-catalog-search", "--ingredient-resolution"].includes(arg)) || args.length > 1) {
  throw new Error("Supported options: --beta-flow-gaps, --food-catalog-search or --ingredient-resolution");
}
const verifyBetaFlowGaps = args.includes("--beta-flow-gaps");
const verifyFoodCatalogSearch = args.includes("--food-catalog-search");
const verifyIngredientResolution = args.includes("--ingredient-resolution");
// Preserve CLI-created ownership for historical migrations. Only these reviewed
// production-admin changes require replacement rights over dedicated RPC owners.
const adminMigrations = new Set([
  "20260919001000_ingredient_search_normalization.sql",
  "20260922000000_youtube_catalog_after_ingredient_search.sql",
  "20260922010000_youtube_fractional_quantity.sql",
  "20260922021000_recipe_product_nutrition.sql",
  "20261009090000_ingredient_canonical_search.sql",
  "20261009200000_youtube_ingredient_resolution.sql",
]);
const pieceUnitMigration = "20261009130000_ingredient_piece_unit_evidence.sql";
// The long-lived 212-migration database renamed this exact predecessor while
// its reviewed search_path was pg_catalog,public. A fresh replay builds the
// same body and authority from the current historical files but carries an
// extra pg_temp config item. Reproduce only that proven legacy alias shape;
// every source/authority/postimage check below fails closed on other drift.
const pieceUnitFreshReplayPredecessorFixture = `
do $piece_unit_fresh_replay_predecessor$
declare
  v_signature regprocedure :=
    'private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)'::regprocedure;
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
    into strict v_definition
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_signature
    and pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
    and procedure.proacl = array['postgres=X/postgres']::aclitem[]
    and procedure.prosecdef
    and procedure.provolatile = 's'
    and procedure.proconfig = array['search_path=pg_catalog, public, pg_temp']::text[]
    and pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(procedure.prosrc, 'UTF8'), 'sha256'
    ), 'hex') = '12d47c748c9b09f7fafdfa4c09404ec4570d06f3e6f5059d22d6af2f3e338074';
  if pg_catalog.md5(v_definition) <> '4afb4fcc84f7da82ee0a442266d4a504' then
    raise exception 'PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_DRIFT'
      using errcode = '55000';
  end if;
  alter function private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)
    set search_path = pg_catalog, public;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(v_signature)) <>
      '86f9d5ecc2b115aadc00df99dfd70d58'
    or pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.pg_get_functiondef(v_signature), 'UTF8'), 'sha256'
    ), 'hex') <> '06159ee35b958c1980c962aca09dda551949b3dcea9bc989a99971fc7990b88b' then
    raise exception 'PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_RESTORE_FAILED'
      using errcode = '55000';
  end if;
end;
$piece_unit_fresh_replay_predecessor$;
`;
const dockerTarget = readPinnedLocalDockerTarget({ ambient: process.env });
const pinnedEnv = { ...process.env, DOCKER_HOST: dockerTarget.docker_host };
for (const key of ["DOCKER_CONTEXT", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY"]) delete pinnedEnv[key];
await ensureDockerRunning({ env: pinnedEnv });
// Always create our own target. No external DB URL or project id is accepted.
const isolated = await createIsolatedSupabaseProject(repositoryRoot);
const cliOptions = { workdir: isolated.rootDir, cliPackage: RUNTIME_SUPABASE_CLI_PACKAGE };
let commandEnv;
let started = false;

function run(command, args, { label, input, cwd = isolated.rootDir, timeout = 300_000, env = commandEnv, allowFailure = false, inherit = false, staticSqlDiagnostics = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, env, input, encoding: "utf8", timeout, killSignal: "SIGTERM",
    stdio: inherit ? "inherit" : "pipe",
    maxBuffer: 16 * 1024 * 1024,
  });
  // Only repository SQL diagnostics are safe to expose. Supabase startup output
  // can include credentials and remains suppressed.
  if (!allowFailure && (result.status !== 0 || result.error)) {
    const detail = staticSqlDiagnostics ? String(result.stderr ?? "").trim().slice(-2000) : "";
    const replayFile = staticSqlDiagnostics
      ? [...String(result.stdout ?? "").matchAll(/^REPLAY ([a-z0-9_.-]+)$/gmu)].at(-1)?.[1]
      : undefined;
    throw new Error(`${label ?? command}${replayFile ? ` (${replayFile})` : ""} failed (status ${result.status ?? result.error?.code ?? "unknown"})${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

try {
  commandEnv = await isolated.buildCommandEnv(pinnedEnv, { dockerHost: dockerTarget.docker_host });
  if (!/^hcg_\d+_[a-f0-9]{6}$/u.test(isolated.projectId)) throw new Error("Invalid isolated project id");
  const migrationsDir = path.join(isolated.rootDir, "supabase/migrations");
  const pendingDir = path.join(isolated.rootDir, "migrations-pending");
  const seedPath = path.join(isolated.rootDir, "supabase/seed.sql");
  const pendingSeedPath = path.join(isolated.rootDir, "seed-pending.sql");
  await rename(migrationsDir, pendingDir);
  await mkdir(migrationsDir);
  await rename(seedPath, pendingSeedPath);
  await writeFile(seedPath, "", { mode: 0o600 });
  const version = run(pnpmCommand, pnpmArgs(buildSupabaseCliArgs(["--version"], cliOptions)), { label: "Pinned Supabase CLI" });
  assertPinnedSupabaseCliVersion(version.stdout);
  assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
  started = true;
  run(pnpmCommand, pnpmArgs(buildIsolatedSupabaseStartArgs(isolated.rootDir, {
    cliPackage: RUNTIME_SUPABASE_CLI_PACKAGE, services: [],
  })), { label: "Bare isolated Supabase startup" });
  assertOwnedDockerResources(isolated.projectId, { env: commandEnv });
  assertNoIsolatedDockerOom(isolated.projectId, { env: commandEnv });

  const migrations = (await readdir(pendingDir)).filter((name) => /^\d+_.*\.sql$/u.test(name)).sort();
  if (migrations.length === 0) throw new Error("No migrations found for catalog verification");
  // Keep extension GUC registration in one backend while reproducing each
  // migration's original session authority and per-file transaction boundary.
  const sqlBatch = [];
  for (const name of migrations) {
    const role = adminMigrations.has(name) ? "supabase_admin" : "postgres";
    if (name === pieceUnitMigration) {
      sqlBatch.push("\\echo REPLAY piece-unit-reviewed-predecessor-fixture\nset session authorization postgres;\nbegin;\n",
        pieceUnitFreshReplayPredecessorFixture,
        "\ncommit;\nreset session authorization;\n");
    }
    sqlBatch.push(`\\echo REPLAY ${name}\nset session authorization ${role};\nbegin;\n`,
      await readFile(path.join(pendingDir, name), "utf8"), "\ncommit;\nreset session authorization;\n");
  }
  sqlBatch.push("\\echo REPLAY seed.sql\nset session authorization postgres;\nbegin;\n",
    await readFile(pendingSeedPath, "utf8"), "\ncommit;\nreset session authorization;\n");
  run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
    label: "Isolated migration replay", input: sqlBatch.join(""), staticSqlDiagnostics: true,
  });
  assertNoIsolatedDockerOom(isolated.projectId, { env: commandEnv });
  console.warn(JSON.stringify({ projectId: isolated.projectId, migrationCount: migrations.length, migrationSha256: isolated.migrationSha256 }));
  if (verifyIngredientResolution) {
    const reviewedIngredientId = "d8e4b087-3629-4f58-8ccd-2185a07d3da5";
    run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
      label: "YouTube ingredient reviewed-catalog rows",
      input: `begin;
update public.ingredients
set standard_name = '맛술 (격리 이전 ID)'
where standard_name = '맛술' and id <> '${reviewedIngredientId}'::uuid;
insert into public.ingredients (id, standard_name, category, category_code, default_unit)
values ('${reviewedIngredientId}', '맛술', '양념', null, null)
on conflict (id) do update set standard_name = excluded.standard_name;
insert into public.ingredients (id, standard_name, category, category_code, default_unit)
select fixture.id, fixture.standard_name, '기타', null, null
from (values
  ('00000000-0000-4000-8100-000000001001'::uuid, '두부'),
  ('00000000-0000-4000-8100-000000001003'::uuid, '파스타면'),
  ('00000000-0000-4000-8100-000000001004'::uuid, '바질 잎'),
  ('00000000-0000-4000-8100-000000001005'::uuid, '올리브 오일')
) fixture(id, standard_name)
where not exists (select 1 from public.ingredients existing where existing.standard_name = fixture.standard_name)
on conflict (standard_name) do nothing;
insert into public.ingredient_synonyms (ingredient_id, synonym)
select id, '스파게티면' from public.ingredients where standard_name = '파스타면'
on conflict (ingredient_id, synonym) do nothing;
commit;`,
      staticSqlDiagnostics: true,
    });
    run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
      label: "YouTube ingredient exact-name baseline",
      input: await readFile(path.join(repositoryRoot, "tests/sql/youtube-ingredient-resolution-baseline.sql"), "utf8"),
      staticSqlDiagnostics: true,
    });
  }
  run(pnpmCommand, pnpmArgs([
    "exec", "vitest", "run", "tests/youtube-extraction-current-catalog.integration.test.ts",
    ...(verifyBetaFlowGaps ? [
      "tests/recipe-product-selection-postgres.integration.test.ts",
      "tests/recipe-product-nutrition.integration.test.ts",
    ] : []),
    ...(verifyFoodCatalogSearch ? [
      "tests/food-catalog-search-candidates-postgres.integration.test.ts",
      "tests/recipe-product-selection-postgres.integration.test.ts",
      "tests/recipe-product-nutrition.integration.test.ts",
    ] : []),
    "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
  ]), {
    label: "Current catalog integration", cwd: repositoryRoot, timeout: 120_000, inherit: true,
    env: {
      ...commandEnv,
      HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL: isolated.databaseUrl,
      HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID: isolated.projectId,
    },
  });
  if (verifyIngredientResolution) {
    const cutoverAttemptId = "00000000-0000-4000-8200-000000002001";
    run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
      label: "YouTube ingredient generation-writer fixture",
      input: `begin;
insert into public.account_generation_cutover_attempts (id, state, capability_revision, result_json)
select '${cutoverAttemptId}', 'promoted', revision + 1, '{}'::jsonb
from public.account_generation_capability_state where singleton and state <> 'generation_active'
on conflict (id) do update set result_json = '{}'::jsonb;
update public.account_generation_capability_state
set state = 'generation_active', revision = revision + 1,
  current_cutover_attempt_id = '${cutoverAttemptId}', activated_at = coalesce(activated_at, clock_timestamp()),
  updated_at = clock_timestamp()
where singleton and state <> 'generation_active';
commit;`,
      staticSqlDiagnostics: true,
    });
    run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
      label: "YouTube ingredient resolution idempotent replay",
      input: await readFile(path.join(pendingDir, "20261009200000_youtube_ingredient_resolution.sql"), "utf8"),
      staticSqlDiagnostics: true,
    });
    run("docker", ["exec", "-i", `supabase_db_${isolated.projectId}`, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--file=-"], {
      label: "YouTube ingredient resolution SQL parity",
      input: await readFile(path.join(repositoryRoot, "tests/sql/youtube-ingredient-resolution.sql"), "utf8"),
      staticSqlDiagnostics: true,
    });
  }
  if (verifyFoodCatalogSearch) {
    run(pnpmCommand, pnpmArgs([
      "exec", "vitest", "run", "tests/food-catalog-search-cold-backend.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=45000",
    ]), {
      label: "Cold search backend PostgREST integration", cwd: repositoryRoot,
      timeout: 120_000, inherit: true,
      env: { ...commandEnv, HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL: isolated.databaseUrl,
        HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID: isolated.projectId },
    });
  }
  if (verifyBetaFlowGaps) {
    // This real PostgREST suite commits an isolated generation promotion. Run it
    // after the rollback-only suites; never undo that protected state transition.
    run(pnpmCommand, pnpmArgs([
      "exec", "vitest", "run", "tests/recipe-snapshot-live-readers.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
    ]), {
      label: "Snapshot activation PostgREST integration", cwd: repositoryRoot,
      timeout: 120_000, inherit: true,
      env: {
        ...commandEnv,
        HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL: isolated.databaseUrl,
        HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID: isolated.projectId,
      },
    });
  }
} finally {
  let cleaned = !started;
  if (started) {
    const stopped = run(pnpmCommand, pnpmArgs(buildSupabaseCliArgs(["stop", "--no-backup"], cliOptions)), {
      timeout: 60_000, allowFailure: true,
    });
    if (stopped.status === 0) {
      try {
        assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
        cleaned = true;
      } catch { /* Fall back to removal restricted to this owned project. */ }
    }
    if (!cleaned) {
      removeIsolatedDockerResources(isolated.projectId, { env: commandEnv });
      assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
      cleaned = true;
    }
  }
  if (cleaned) await isolated.removeFiles();
}
