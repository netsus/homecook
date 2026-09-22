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
const args = process.argv.slice(2);
if (args.some((arg) => !["--beta-flow-gaps", "--food-catalog-search"].includes(arg)) || args.length > 1) {
  throw new Error("Supported options: --beta-flow-gaps or --food-catalog-search");
}
const verifyBetaFlowGaps = args.includes("--beta-flow-gaps");
const verifyFoodCatalogSearch = args.includes("--food-catalog-search");
// Preserve CLI-created ownership for historical migrations. Only these reviewed
// production-admin changes require replacement rights over dedicated RPC owners.
const adminMigrations = new Set([
  "20260919001000_ingredient_search_normalization.sql",
  "20260922000000_youtube_catalog_after_ingredient_search.sql",
  "20260922010000_youtube_fractional_quantity.sql",
  "20260922021000_recipe_product_nutrition.sql",
]);
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
  const version = run("pnpm", buildSupabaseCliArgs(["--version"], cliOptions), { label: "Pinned Supabase CLI" });
  assertPinnedSupabaseCliVersion(version.stdout);
  assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
  started = true;
  run("pnpm", buildIsolatedSupabaseStartArgs(isolated.rootDir, {
    cliPackage: RUNTIME_SUPABASE_CLI_PACKAGE, services: [],
  }), { label: "Bare isolated Supabase startup" });
  assertOwnedDockerResources(isolated.projectId, { env: commandEnv });
  assertNoIsolatedDockerOom(isolated.projectId, { env: commandEnv });

  const migrations = (await readdir(pendingDir)).filter((name) => /^\d+_.*\.sql$/u.test(name)).sort();
  if (migrations.length === 0) throw new Error("No migrations found for catalog verification");
  // Keep extension GUC registration in one backend while reproducing each
  // migration's original session authority and per-file transaction boundary.
  const sqlBatch = [];
  for (const name of migrations) {
    const role = adminMigrations.has(name) ? "supabase_admin" : "postgres";
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
  run("pnpm", [
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
  ], {
    label: "Current catalog integration", cwd: repositoryRoot, timeout: 120_000, inherit: true,
    env: {
      ...commandEnv,
      HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL: isolated.databaseUrl,
      HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID: isolated.projectId,
    },
  });
  if (verifyFoodCatalogSearch) {
    run("pnpm", [
      "exec", "vitest", "run", "tests/food-catalog-search-cold-backend.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=45000",
    ], {
      label: "Cold search backend PostgREST integration", cwd: repositoryRoot,
      timeout: 120_000, inherit: true,
      env: { ...commandEnv, HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL: isolated.databaseUrl,
        HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID: isolated.projectId },
    });
  }
  if (verifyBetaFlowGaps) {
    // This real PostgREST suite commits an isolated generation promotion. Run it
    // after the rollback-only suites; never undo that protected state transition.
    run("pnpm", [
      "exec", "vitest", "run", "tests/recipe-snapshot-live-readers.integration.test.ts",
      "--pool=forks", "--maxWorkers=1", "--testTimeout=30000",
    ], {
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
    const stopped = run("pnpm", buildSupabaseCliArgs(["stop", "--no-backup"], cliOptions), {
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
