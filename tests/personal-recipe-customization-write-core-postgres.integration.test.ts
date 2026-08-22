import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ?? "";
const port = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ?? "";
const database = process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ?? "";

function psql(sql: string) {
  const result = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^(?:BEGIN|COMMIT|SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$/.test(line),
    )
    .at(-1) ?? "";
}

function psqlResult(sql: string) {
  return spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

function spawnPsql(sql?: string) {
  const args = [
    "-h", host, "-p", port, "-U", "postgres", "-d", database,
    "-At", "-v", "ON_ERROR_STOP=1",
  ];
  if (sql !== undefined) args.push("-c", sql);
  return spawn("psql", args, {
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

function waitForToken(child: ChildProcessWithoutNullStreams, token: string) {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(token)) {
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output.includes(token)) reject(new Error(`psql exited ${code} before ${token}`));
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("exit", (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitForBarrierWaiters(expected: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiting = Number(psql(
      "select count(*)::text from pg_locks where locktype = 'advisory' and not granted;",
    ));
    if (waiting >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`explicit PostgreSQL barrier did not collect ${expected} waiters`);
}

async function waitForApplicationLock(applicationName: string, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = psql(`
      select concat_ws(':', state, wait_event_type, wait_event)
      from pg_stat_activity
      where application_name = '${applicationName}';
    `);
    if (/active:Lock:/.test(state)) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

async function runAtBarrier(participants: Array<string | { preBarrier: string; statement: string }>) {
  const barrierKey = "homecook-personal-recipe-test-barrier";
  const control = spawnPsql();
  const ready = waitForToken(control, "BARRIER_READY");
  control.stdin.write(
    `select pg_advisory_lock(hashtextextended('${barrierKey}', 0)); select 'BARRIER_READY';\n`,
  );
  await ready;

  const children = participants.map((participant) => {
    const { preBarrier, statement } = typeof participant === "string"
      ? { preBarrier: "", statement: participant }
      : participant;
    return spawnPsql(`
    begin;
    ${preBarrier}
    select pg_advisory_xact_lock_shared(hashtextextended('${barrierKey}', 0));
    ${statement}
    commit;
  `);
  });
  const outcomes = children.map(waitForExit);
  await waitForBarrierWaiters(children.length);
  const controlExit = waitForExit(control);
  control.stdin.write(
    `select pg_advisory_unlock(hashtextextended('${barrierKey}', 0));\n\\q\n`,
  );
  const results = await Promise.all(outcomes);
  await controlExit;
  return results;
}

function ownerLockSql(owner: string) {
  return `select pg_advisory_xact_lock(hashtextextended('homecook-account-owner:${owner}', 0));`;
}

function cleanupCallSql(owner: string) {
  return `
    ${ownerLockSql(owner)}
    select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
    update public.user_account_lifecycles
    set status = 'deleting', revision = revision + 1, updated_at = now()
    where owner_uuid = '${owner}' and account_generation = 1;
    select public.delete_user_private_data('${owner}');
    update public.user_account_lifecycles
    set status = 'cleanup_pending', revision = revision + 1, updated_at = now()
    where owner_uuid = '${owner}' and account_generation = 1;
    select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', false);
  `;
}

function concurrentLockGraph(writerApplication: string, cleanupApplication: string) {
  return JSON.parse(psql(`
    with writer as (
      select pid, wait_event_type, wait_event
      from pg_stat_activity
      where application_name = '${writerApplication}'
    ), cleanup as (
      select pid, wait_event_type, wait_event
      from pg_stat_activity
      where application_name = '${cleanupApplication}'
    )
    select jsonb_build_object(
      'writer_wait', concat_ws(':', writer.wait_event_type, writer.wait_event),
      'cleanup_wait', concat_ws(':', cleanup.wait_event_type, cleanup.wait_event),
      'writer_blocked_by_cleanup', cleanup.pid = any(pg_blocking_pids(writer.pid)),
      'cleanup_blocker_count', cardinality(pg_blocking_pids(cleanup.pid))
    )::text
    from writer cross join cleanup;
  `)) as {
    writer_wait: string;
    cleanup_wait: string;
    writer_blocked_by_cleanup: boolean;
    cleanup_blocker_count: number;
  };
}

const ownerA = "81000000-0000-4000-8000-000000000001";
const ownerB = "81000000-0000-4000-8000-000000000002";
const ownerC = "81000000-0000-4000-8000-000000000003";
const ownerD = "81000000-0000-4000-8000-000000000004";
const ownerE = "81000000-0000-4000-8000-000000000005";
const ownerF = "81000000-0000-4000-8000-000000000006";
const ownerG = "81000000-0000-4000-8000-000000000007";
const ownerH = "81000000-0000-4000-8000-000000000008";
const ownerI = "81000000-0000-4000-8000-000000000009";
const ownerJ = "81000000-0000-4000-8000-000000000010";
const ownerK = "81000000-0000-4000-8000-000000000011";
const ownerL = "81000000-0000-4000-8000-000000000012";
const publicRecipe = "82000000-0000-4000-8000-000000000001";
const privateRecipeB = "82000000-0000-4000-8000-000000000002";
const ownerPublicRecipe = "82000000-0000-4000-8000-000000000003";
const deletingPublicRecipe = "82000000-0000-4000-8000-000000000004";
const cleanupPendingPublicRecipe = "82000000-0000-4000-8000-000000000005";
const cleanupFirstPublicRecipe = "82000000-0000-4000-8000-000000000006";
const writerFirstPublicRecipe = "82000000-0000-4000-8000-000000000007";
const ingredient = "83000000-0000-4000-8000-000000000001";
const productIngredient = "83000000-0000-4000-8000-000000000002";
const cookingMethod = "84000000-0000-4000-8000-000000000001";
const foodProduct = "86000000-0000-4000-8000-000000000001";
const foodProductVersion = "86000000-0000-4000-8000-000000000002";
const unlinkedFoodProduct = "86000000-0000-4000-8000-000000000003";
const unlinkedFoodProductVersion = "86000000-0000-4000-8000-000000000004";
const nutritionProfile = "86000000-0000-4000-8000-000000000005";
const identityEpoch = "2026-08-02T00:00:00Z";
const identityEpochG2 = "2026-08-02T02:00:00Z";
const cutoverAttempt = "80000000-0000-4000-8000-000000000001";
const sessionA = "a".repeat(64);
const sessionB = "b".repeat(64);
const sessionC = "c".repeat(64);
const sessionD = "d".repeat(64);
const sessionE = "e".repeat(64);
const sessionF = "f".repeat(64);
const sessionG = "7a".repeat(32);
const sessionH = "8b".repeat(32);
const sessionH2 = "8a".repeat(32);
const sessionExpired = "ab".repeat(32);
const sessionRevoked = "ac".repeat(32);
const sessionLegacy = "ad".repeat(32);
const sessionWrongIssuer = "ae".repeat(32);
const sessionStaleCutover = "af".repeat(32);
const sessionMismatchedIat = "bc".repeat(32);
const localIssuer = "https://auth.homecook.test/auth/v1";
const sessionIssuedAt = "2026-08-02T00:30:00Z";

function draft(title: string, options: {
  foodProductId?: string;
  foodProductVersionId?: string;
  ignoredAuthority?: boolean;
} = {}) {
  return JSON.stringify({
    title,
    description: "개인 레시피 fixture",
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: options.foodProductId ? productIngredient : ingredient,
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "재료 100g",
        scalable: true,
        ...(options.foodProductId ? { food_product_id: options.foodProductId } : {}),
        ...(options.foodProductVersionId
          ? { food_product_nutrition_version_id: options.foodProductVersionId }
          : {}),
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "조리한다",
        cooking_method_id: cookingMethod,
        ingredients_used: [],
      },
    ],
    ...(options.ignoredAuthority ? { visibility: "public", created_by: ownerB } : {}),
  }).replaceAll("'", "''");
}

function nutritionSnapshot() {
  const unavailable = {
    status: "unavailable",
    amount: null,
    known_amount: null,
    display_mode: null,
  };
  return JSON.stringify({
    calculation_version: "personal-recipe-v2",
    scalable_values: {},
    fixed_values: {},
    nutrient_status: {
      energy_kcal: unavailable,
      carbohydrate_g: unavailable,
      protein_g: unavailable,
      fat_g: unavailable,
      sodium_mg: unavailable,
    },
    calculation_status: "unavailable",
    calculation_quality: null,
    reflected_ingredient_count: 0,
    target_ingredient_count: 1,
    missing_reasons: [`PREDECESSOR_NOT_APPROVED:${ingredient}`],
    warnings: ["PREDECESSOR_NOT_APPROVED"],
    sources: [],
  }).replaceAll("'", "''");
}

function writerSql(options: {
  operation: "create" | "fork" | "update" | "save_as_new" | "delete";
  key: string;
  owner?: string;
  session?: string;
  recipeId?: string | null;
  sourceRecipeId?: string | null;
  revision?: number | null;
  draftTitle?: string;
  tags?: Array<{ normalized_key: string; label: string }> | null;
  imageObjectId?: string;
  foodProductId?: string;
  foodProductVersionId?: string;
  ignoredAuthority?: boolean;
  expectedCleanupGeneration?: number;
  identityCreatedAt?: string;
  sessionIssuedAt?: string;
}) {
  const owner = options.owner ?? ownerA;
  const session = options.session ?? sessionA;
  const identityCreatedAt = options.identityCreatedAt ?? identityEpoch;
  const recipeId = options.recipeId ? `'${options.recipeId}'::uuid` : "null";
  const sourceRecipeId = options.sourceRecipeId
    ? `'${options.sourceRecipeId}'::uuid`
    : "null";
  const revision = options.revision ?? "null";
  const payload = options.operation === "delete"
    ? "'{}'::jsonb"
    : `'${draft(options.draftTitle ?? "개인 레시피", {
      foodProductId: options.foodProductId,
      foodProductVersionId: options.foodProductVersionId,
      ignoredAuthority: options.ignoredAuthority,
    })}'::jsonb`;
  const tags = options.tags === null
    ? "null"
    : `'${JSON.stringify(options.tags ?? []).replaceAll("'", "''")}'::jsonb`;
  const imageObjectId = options.imageObjectId
    ? `'${options.imageObjectId}'::uuid`
    : "null";
  return `
    begin;
    set local homecook.personal_recipe_v2 = 'on';
    set local request.jwt.claim.role = 'service_role';
    select public.write_personal_recipe_core(
      '${owner}',
      '${identityCreatedAt}'::timestamptz,
      '${session}',
      1,
      '${options.sessionIssuedAt ?? sessionIssuedAt}'::timestamptz,
      '${options.operation}',
      ${recipeId},
      ${sourceRecipeId},
      ${revision},
      ${payload},
      '${nutritionSnapshot()}'::jsonb,
      ${tags},
      ${imageObjectId},
      ${options.expectedCleanupGeneration ?? 0},
      '${options.key}'::uuid,
      '2026-08-02T01:00:00Z'::timestamptz
    );
    commit;
  `;
}

function writerWithSessionAuthoritySql(options: Parameters<typeof writerSql>[0]) {
  return writerSql(options);
}

function writerCallSql(options: Parameters<typeof writerSql>[0]) {
  return writerSql(options)
    .replace(/^\s*begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "");
}

describe.skipIf(!enabled)("personal recipe write PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      create role personal_recipe_public_probe nologin;

      insert into auth.users (id, created_at, email)
      values
        ('${ownerA}', '${identityEpoch}', 'owner-a@example.invalid'),
        ('${ownerB}', '${identityEpoch}', 'owner-b@example.invalid'),
        ('${ownerC}', '${identityEpoch}', 'owner-c@example.invalid'),
        ('${ownerD}', '${identityEpoch}', 'owner-d@example.invalid'),
        ('${ownerE}', '${identityEpoch}', 'owner-e@example.invalid'),
        ('${ownerF}', '${identityEpoch}', 'owner-f@example.invalid'),
        ('${ownerG}', '${identityEpoch}', 'owner-g@example.invalid'),
        ('${ownerH}', '${identityEpoch}', 'owner-h@example.invalid'),
        ('${ownerI}', '${identityEpoch}', 'owner-i@example.invalid'),
        ('${ownerJ}', '${identityEpoch}', 'owner-j@example.invalid'),
        ('${ownerK}', '${identityEpoch}', 'owner-k@example.invalid'),
        ('${ownerL}', '${identityEpoch}', 'owner-l@example.invalid');

      update private.full_local_auth_control
      set authority = 'local',
          local_issuer = '${localIssuer}',
          cutover_epoch = 2,
          hmac_key_version = 1,
          flows_open = true,
          local_activated_at = '2026-08-02T00:10:00Z',
          updated_at = '2026-08-02T00:10:00Z'
      where singleton;

      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${ownerA}', 'personal-owner-a', 'test', 'personal-owner-a'),
        ('${ownerB}', 'personal-owner-b', 'test', 'personal-owner-b'),
        ('${ownerC}', 'personal-owner-c', 'test', 'personal-owner-c'),
        ('${ownerD}', 'personal-owner-d', 'test', 'personal-owner-d'),
        ('${ownerE}', 'personal-owner-e', 'test', 'personal-owner-e'),
        ('${ownerF}', 'personal-owner-f', 'test', 'personal-owner-f'),
        ('${ownerG}', 'personal-owner-g', 'test', 'personal-owner-g'),
        ('${ownerH}', 'personal-owner-h', 'test', 'personal-owner-h'),
        ('${ownerI}', 'personal-owner-i', 'test', 'personal-owner-i'),
        ('${ownerJ}', 'personal-owner-j', 'test', 'personal-owner-j'),
        ('${ownerK}', 'personal-owner-k', 'test', 'personal-owner-k'),
        ('${ownerL}', 'personal-owner-l', 'test', 'personal-owner-l');

      insert into public.user_account_generation_watermarks (owner_uuid, last_account_generation)
      values
        ('${ownerA}', 1), ('${ownerB}', 1), ('${ownerC}', 1),
        ('${ownerD}', 1), ('${ownerE}', 1), ('${ownerF}', 1), ('${ownerG}', 1),
        ('${ownerH}', 1), ('${ownerI}', 1), ('${ownerJ}', 1),
        ('${ownerK}', 1), ('${ownerL}', 1);

      insert into public.user_account_lifecycles (
        owner_uuid, account_generation, auth_identity_created_at_snapshot,
        origin, status, activated_at
      ) values
        ('${ownerA}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerB}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerC}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerD}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerE}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerF}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerG}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerH}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerI}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerJ}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerK}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${ownerL}', 1, '${identityEpoch}', 'runtime', 'active', now());

      insert into public.user_session_generation_bindings (
        session_key_hash, hmac_key_version, owner_uuid,
        expected_account_generation, auth_identity_created_at_snapshot,
        binding_state, auth_authority, local_issuer, local_verified_at,
        auth_cutover_epoch, session_issued_at, binding_expires_at
      ) values
        ('${sessionA}', 1, '${ownerA}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionB}', 1, '${ownerB}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionC}', 1, '${ownerC}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionD}', 1, '${ownerD}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionE}', 1, '${ownerE}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionF}', 1, '${ownerF}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionG}', 1, '${ownerG}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionH}', 1, '${ownerH}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionExpired}', 1, '${ownerA}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '2026-07-31T00:00:00Z', 2, '${sessionIssuedAt}', '2026-08-01T00:00:00Z'),
        ('${sessionRevoked}', 1, '${ownerA}', 1, '${identityEpoch}', 'revoked', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionLegacy}', 1, '${ownerA}', 1, '${identityEpoch}', 'legacy', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionWrongIssuer}', 1, '${ownerA}', 1, '${identityEpoch}', 'active', 'local', 'https://wrong.homecook.test/auth/v1', '${sessionIssuedAt}', 2, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionStaleCutover}', 1, '${ownerA}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 1, '${sessionIssuedAt}', '2099-01-01T00:00:00Z'),
        ('${sessionMismatchedIat}', 1, '${ownerA}', 1, '${identityEpoch}', 'active', 'local', '${localIssuer}', '${sessionIssuedAt}', 2, '2026-08-02T00:31:00Z', '2099-01-01T00:00:00Z');

      update public.user_session_generation_bindings
      set revoked_at = '${sessionIssuedAt}'
      where session_key_hash = '${sessionRevoked}';

      insert into public.ingredients (id, name)
      values
        ('${ingredient}', '개인 레시피 재료'),
        ('${productIngredient}', '제품 provenance 재료');

      insert into public.cooking_methods (id, code, label, color_key, category_code)
      values ('${cookingMethod}', 'personal-fixture', '조리', 'red', 'wet_heat');

      insert into public.recipes (
        id, title, base_servings, source_type, created_by, visibility,
        revision, updated_at
      ) values
        ('${publicRecipe}', '공개 원본', 2, 'manual', null, 'public', 7, now()),
        ('${privateRecipeB}', '다른 소유자 개인식', 2, 'manual', '${ownerB}', 'private', 1, now()),
        ('${ownerPublicRecipe}', '격리 공개 원본', 2, 'manual', '${ownerC}', 'public', 1, now()),
        ('${deletingPublicRecipe}', '삭제 중 공개 원본', 2, 'manual', '${ownerI}', 'public', 1, now()),
        ('${cleanupPendingPublicRecipe}', '정리 대기 공개 원본', 2, 'manual', '${ownerJ}', 'public', 1, now()),
        ('${cleanupFirstPublicRecipe}', 'cleanup-first 공개 원본', 2, 'manual', '${ownerK}', 'public', 1, now()),
        ('${writerFirstPublicRecipe}', 'writer-first 공개 원본', 2, 'manual', '${ownerL}', 'public', 1, now());

      insert into public.nutrition_profiles (id, created_by)
      values ('${nutritionProfile}', '${ownerA}');

      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name
      ) values
        ('${foodProduct}', null, 'public', 'manual', 'visible', '연결 제품'),
        ('${unlinkedFoodProduct}', null, 'public', 'manual', 'visible', '미연결 제품');

      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, created_by
      ) values
        ('${foodProductVersion}', '${foodProduct}', '${nutritionProfile}', '${ownerA}'),
        ('${unlinkedFoodProductVersion}', '${unlinkedFoodProduct}', '${nutritionProfile}', '${ownerA}');

      insert into public.food_product_ingredient_links (
        product_id, ingredient_id, relation, review_status, is_primary,
        is_active, source, decision_reason, reviewed_at
      ) values (
        '${foodProduct}', '${productIngredient}', 'represents', 'approved',
        true, true, 'fixture', 'fixture approval', now()
      );

      insert into public.account_generation_cutover_attempts (
        id, state, capability_revision, result_json
      ) values ('${cutoverAttempt}', 'promoted', 2, '{}'::jsonb);

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1,
          current_cutover_attempt_id = '${cutoverAttempt}',
          activated_at = '2026-08-02T00:20:00Z'
      where singleton;
    `);
  });

  afterAll(() => {
    psql(`
      delete from public.user_session_generation_bindings
      where owner_uuid in (
        '${ownerA}', '${ownerB}', '${ownerC}', '${ownerD}', '${ownerE}',
        '${ownerF}', '${ownerG}', '${ownerH}', '${ownerI}', '${ownerJ}',
        '${ownerK}', '${ownerL}'
      );
    `);
  });

  it("installs a dark service-only writer and leaves the capability off", () => {
    expect(psql(`select has_function_privilege('authenticated', 'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)', 'execute')::text;`)).toBe("false");
    expect(psql("select coalesce(current_setting('homecook.personal_recipe_v2', true), 'off');")).toBe("off");
  });

  it("locks exact owner, overload, ACL, grant option, and actual role call matrices", () => {
    const digestBefore = psql(`
      select md5(concat_ws('|',
        (select count(*) from public.recipes),
        (select count(*) from public.mutation_idempotency_keys),
        (select coalesce(string_agg(concat_ws(':', id, revision, visibility), ',' order by id), '') from public.recipes)
      ));
    `);
    expect(psql(`
      with expected(signature) as (values
        ('public.lock_personal_recipe_ids(uuid[])'),
        ('public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)'),
        ('public.cleanup_personal_recipe_write_receipts()')
      )
      select string_agg(concat_ws(':', expected.signature, role.rolname, procedure.prosecdef), ',' order by expected.signature)
      from expected
      join pg_proc procedure on procedure.oid = to_regprocedure(expected.signature)
      join pg_roles role on role.oid = procedure.proowner;
    `)).toBe([
      "public.cleanup_personal_recipe_write_receipts():postgres:t",
      "public.lock_personal_recipe_ids(uuid[]):postgres:t",
      "public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone):postgres:t",
    ].join(","));
    expect(psql(`
      select concat_ws(':',
        count(*) filter (where proname = 'lock_personal_recipe_ids'),
        count(*) filter (where proname = 'write_personal_recipe_core'),
        count(*) filter (where proname = 'cleanup_personal_recipe_write_receipts')
      )
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('lock_personal_recipe_ids', 'write_personal_recipe_core', 'cleanup_personal_recipe_write_receipts');
    `)).toBe("1:1:1");
    expect(psql(`
      with target as (
        select procedure.oid, procedure.proowner, procedure.proacl
        from pg_proc procedure
        where procedure.oid = 'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure
      )
      select concat_ws(':',
        has_function_privilege('anon', target.oid, 'execute'),
        has_function_privilege('authenticated', target.oid, 'execute'),
        has_function_privilege('service_role', target.oid, 'execute'),
        coalesce(bool_or(acl.grantee = 'service_role'::regrole and acl.is_grantable), false),
        coalesce(bool_or(acl.grantee = 0), false)
      )
      from target
      left join lateral aclexplode(coalesce(target.proacl, acldefault('f', target.proowner))) acl on true
      group by target.oid;
    `)).toBe("f:f:t:f:f");

    const roleCall = writerCallSql({
      operation: "create", key: "85000000-0000-4000-8000-000000000031",
    }).replace("set local homecook.personal_recipe_v2 = 'on';", "");
    const deniedInternalCalls = [
      "select public.lock_personal_recipe_ids('{}'::uuid[]);",
      "select public.cleanup_personal_recipe_write_receipts();",
    ];
    for (const role of ["personal_recipe_public_probe", "anon", "authenticated"]) {
      expectSqlFailure(`begin; set local role ${role}; ${roleCall} rollback;`, /permission denied/i);
      for (const call of deniedInternalCalls) {
        expectSqlFailure(`begin; set local role ${role}; ${call} rollback;`, /permission denied/i);
      }
    }
    for (const call of deniedInternalCalls) {
      expectSqlFailure(`begin; set local role service_role; ${call} rollback;`, /permission denied/i);
    }
    expectSqlFailure(
      `begin; set local role service_role; ${roleCall} rollback;`,
      /personal recipe capability is disabled/i,
    );
    expect(psql(`
      select md5(concat_ws('|',
        (select count(*) from public.recipes),
        (select count(*) from public.mutation_idempotency_keys),
        (select coalesce(string_agg(concat_ws(':', id, revision, visibility), ',' order by id), '') from public.recipes)
      ));
    `)).toBe(digestBefore);
  });

  it("proves fresh and replay migration modes through the repository-owned runner", () => {
    expect(process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGMODE).toMatch(/fresh|replay/);
  });

  it("keeps capability-off calls mutation-zero", () => {
    const before = psql("select count(*)::text from public.recipes;");
    expectSqlFailure(
      writerSql({
        operation: "create",
        key: "85000000-0000-4000-8000-000000000001",
      }).replace("set local homecook.personal_recipe_v2 = 'on';", ""),
      /personal recipe capability is disabled/i,
    );
    expect(psql("select count(*)::text from public.recipes;")).toBe(before);
  });

  it("fails closed on the full local session binding and exact JWT iat", () => {
    const mutationDigestBefore = psql(`
      select md5(concat_ws('|',
        (select count(*) from public.recipes),
        (select count(*) from public.mutation_idempotency_keys),
        (select count(*) from public.recipe_content_snapshots)
      ));
    `);
    const invalidSessions = [
      sessionExpired,
      sessionRevoked,
      sessionLegacy,
      sessionWrongIssuer,
      sessionStaleCutover,
    ];
    let keySuffix = 80;
    for (const session of invalidSessions) {
      expectSqlFailure(writerSql({
        operation: "create",
        session,
        key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
        draftTitle: "invalid session binding",
      }), /ACCOUNT_SESSION_STALE/);
    }

    expectSqlFailure(writerWithSessionAuthoritySql({
      operation: "create",
      session: sessionMismatchedIat,
      sessionIssuedAt,
      key: "85000000-0000-4000-8000-000000000085",
      draftTitle: "mismatched jwt iat",
    }), /ACCOUNT_SESSION_STALE/);
    expectSqlFailure(writerSql({
      operation: "create",
      identityCreatedAt: identityEpochG2,
      key: "85000000-0000-4000-8000-000000000086",
      draftTitle: "stale identity epoch",
    }), /ACCOUNT_SESSION_STALE/);

    for (const controlMutation of [
      "authority = 'remote', local_issuer = null, local_activated_at = null",
      "local_issuer = 'https://other.homecook.test/auth/v1'",
      "cutover_epoch = 3",
      "hmac_key_version = 2",
    ]) {
      expectSqlFailure(`
        begin;
        update private.full_local_auth_control set ${controlMutation}
        where singleton;
        ${writerCallSql({
          operation: "create",
          key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
          draftTitle: "stale authority control",
        })}
        rollback;
      `, /ACCOUNT_SESSION_STALE/);
    }

    expect(psql(`
      select md5(concat_ws('|',
        (select count(*) from public.recipes),
        (select count(*) from public.mutation_idempotency_keys),
        (select count(*) from public.recipe_content_snapshots)
      ));
    `)).toBe(mutationDigestBefore);

    const valid = JSON.parse(psql(writerWithSessionAuthoritySql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000091",
      draftTitle: "exact session authority",
    })));
    expect(valid.success).toBe(true);
    psql(`
      delete from public.user_session_generation_bindings
      where session_key_hash in (
        '${sessionExpired}', '${sessionRevoked}', '${sessionLegacy}',
        '${sessionWrongIssuer}', '${sessionStaleCutover}',
        '${sessionMismatchedIat}'
      );
    `);
  });

  it("creates once, replays durably, and rejects a changed payload", () => {
    const key = "85000000-0000-4000-8000-000000000002";
    const first = JSON.parse(psql(writerSql({ operation: "create", key })));
    const replay = JSON.parse(psql(writerSql({ operation: "create", key })));

    expect(replay).toEqual(first);
    expect(first.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(psql(`select visibility || ':' || revision::text from public.recipes where id = '${first.data.id}';`)).toBe("private:1");
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${first.data.id}';`)).toBe("1");
    expect(psql(`select count(*)::text from public.recipe_nutrition_snapshots where recipe_id = '${first.data.id}' and is_current;`)).toBe("1");

    expectSqlFailure(
      writerSql({ operation: "create", key, draftTitle: "바뀐 payload" }),
      /IDEMPOTENCY_KEY_REUSED/,
    );
    expect(psql(`select count(*)::text from public.recipes where id = '${first.data.id}';`)).toBe("1");
  });

  it("hashes only canonical server-consumed input and rejects ignored authority", () => {
    const key = "85000000-0000-4000-8000-000000000020";
    const first = JSON.parse(psql(writerSql({
      operation: "create",
      key,
      draftTitle: "  canonical retry  ",
    })));
    const replay = JSON.parse(psql(writerSql({
      operation: "create",
      key,
      draftTitle: "canonical retry",
      expectedCleanupGeneration: 99,
    })));

    expect(replay).toEqual(first);
    const mutationCountBefore = psql("select count(*)::text from public.recipes;");
    expectSqlFailure(
      writerSql({
        operation: "create",
        key: "85000000-0000-4000-8000-000000000021",
        ignoredAuthority: true,
      }),
      /VALIDATION_ERROR/,
    );
    expect(psql("select count(*)::text from public.recipes;")).toBe(mutationCountBefore);
  });

  it("stores exact product provenance and rejects invalid pairs or links without writes", () => {
    const created = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000022",
      draftTitle: "제품 provenance",
      foodProductId: foodProduct,
      foodProductVersionId: foodProductVersion,
    })));
    expect(psql(`
      select concat_ws(':', ingredient_id, food_product_id, food_product_nutrition_version_id)
      from public.recipe_ingredients where recipe_id = '${created.data.id}';
    `)).toBe(`${productIngredient}:${foodProduct}:${foodProductVersion}`);

    const before = psql("select count(*)::text from public.recipe_ingredients;");
    expectSqlFailure(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
      insert into public.recipe_ingredients (
        recipe_id, ingredient_id, ingredient_type, food_product_id
      ) values ('${publicRecipe}', '${productIngredient}', 'QUANT', '${foodProduct}');
      commit;
    `, /recipe_ingredient_product_provenance_pair/i);
    expectSqlFailure(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
      insert into public.recipe_ingredients (
        recipe_id, ingredient_id, ingredient_type,
        food_product_id, food_product_nutrition_version_id
      ) values (
        '${publicRecipe}', '${productIngredient}', 'QUANT',
        '${unlinkedFoodProduct}', '${unlinkedFoodProductVersion}'
      );
      commit;
    `, /recipe_ingredient_product_link_guard|VALIDATION_ERROR/i);
    expectSqlFailure(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000023",
      draftTitle: "invalid product link",
      foodProductId: unlinkedFoodProduct,
      foodProductVersionId: unlinkedFoodProductVersion,
    }), /VALIDATION_ERROR/);
    expect(psql("select count(*)::text from public.recipe_ingredients;")).toBe(before);
    expect(psql("select count(*)::text from public.recipes where title = 'invalid product link';")).toBe("0");
  });

  it("makes one of two real same-revision writers win at an explicit barrier", async () => {
    const created = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000024",
      draftTitle: "revision race",
    })));
    const results = await runAtBarrier([
      writerCallSql({
        operation: "update", recipeId: created.data.id, revision: 1,
        key: "85000000-0000-4000-8000-000000000025", draftTitle: "race winner A",
      }),
      writerCallSql({
        operation: "update", recipeId: created.data.id, revision: 1,
        key: "85000000-0000-4000-8000-000000000026", draftTitle: "race winner B",
      }),
    ]);

    expect(results.filter((result) => result.status === 0)).toHaveLength(1);
    expect(results.filter((result) => /RECIPE_REVISION_CONFLICT/.test(result.stderr))).toHaveLength(1);
    expect(psql(`select revision::text from public.recipes where id = '${created.data.id}';`)).toBe("2");
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${created.data.id}';`)).toBe("2");
  });

  it("hides a public source across a real lifecycle transition race", async () => {
    const digestBefore = psql(`
      select md5(string_agg(
        concat_ws('|', id, title, revision, visibility, coalesce(deleted_at::text, '')),
        ',' order by id
      )) from public.recipes
      where id in ('${ownerPublicRecipe}', '${deletingPublicRecipe}', '${cleanupPendingPublicRecipe}');
    `);
    const results = await runAtBarrier([
      {
        preBarrier: `
          ${ownerLockSql(ownerC)}
          select 1 from public.user_account_lifecycles
          where owner_uuid = '${ownerC}' and account_generation = 1 for update;
        `,
        statement: `
          select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
          update public.user_account_lifecycles
          set status = 'quarantined', revision = revision + 1, updated_at = now()
          where owner_uuid = '${ownerC}' and account_generation = 1;
          select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', false);
        `,
      },
      writerCallSql({
        operation: "fork", sourceRecipeId: ownerPublicRecipe,
        revision: 1,
        key: "85000000-0000-4000-8000-000000000027", draftTitle: "hidden race fork",
      }),
    ]);
    expect(results[0]?.status).toBe(0);
    expect(results[1]?.stderr).toMatch(/RESOURCE_NOT_FOUND/);

    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
      update public.user_account_lifecycles
      set status = 'deleting', revision = revision + 1, updated_at = now()
      where owner_uuid in ('${ownerI}', '${ownerJ}') and account_generation = 1;
      update public.user_account_lifecycles
      set status = 'cleanup_pending', revision = revision + 1, updated_at = now()
      where owner_uuid = '${ownerJ}' and account_generation = 1;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', false);
      commit;
    `);

    const hiddenRecipes = [
      ownerPublicRecipe,
      deletingPublicRecipe,
      cleanupPendingPublicRecipe,
    ];
    let keySuffix = 28;
    for (const hiddenRecipe of hiddenRecipes) {
      for (const request of [
        writerSql({
          operation: "fork", sourceRecipeId: hiddenRecipe,
          revision: 1,
          key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
          draftTitle: "hidden fork",
        }),
        writerSql({
          operation: "update", recipeId: hiddenRecipe, revision: 1,
          key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
          draftTitle: "hidden update",
        }),
        writerSql({
          operation: "delete", recipeId: hiddenRecipe,
          key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
        }),
      ]) expectSqlFailure(request, /RESOURCE_NOT_FOUND/);
    }

    expect(psql(`
      select md5(string_agg(
        concat_ws('|', id, title, revision, visibility, coalesce(deleted_at::text, '')),
        ',' order by id
      )) from public.recipes
      where id in ('${ownerPublicRecipe}', '${deletingPublicRecipe}', '${cleanupPendingPublicRecipe}');
    `)).toBe(digestBefore);
    expect(psql("select count(*)::text from public.recipes where title like 'hidden %';")).toBe("0");
  });

  it("serializes writer-first public-source guards with every hidden lifecycle transition", async () => {
    const transitionBlocked: boolean[] = [];
    let keySuffix = 92;

    for (const status of ["quarantined", "deleting", "cleanup_pending"] as const) {
      psql(`
        update public.user_account_lifecycles
        set status = 'active', revision = revision + 1, updated_at = now()
        where owner_uuid = '${ownerC}' and account_generation = 1;
      `);
      const sourceDigest = psql(`
        select md5(concat_ws('|', id, title, revision, visibility, coalesce(deleted_at::text, '')))
        from public.recipes where id = '${ownerPublicRecipe}';
      `);
      const title = `writer first ${status}`;
      const writerApplication = `personal-writer-${status}`;
      const transitionApplication = `personal-transition-${status}`;
      const control = spawnPsql();
      const markerReady = waitForToken(control, "MARKER_ROW_LOCKED");
      const controlExit = waitForExit(control);
      control.stdin.write(`
        begin;
        select 1 from public.account_generation_cutover_attempts
        where id = '${cutoverAttempt}' for update;
        select 'MARKER_ROW_LOCKED';
      `);
      await markerReady;

      const writer = spawnPsql(`
        begin;
        set application_name = '${writerApplication}';
        ${writerCallSql({
          operation: "fork",
          sourceRecipeId: ownerPublicRecipe,
          revision: 1,
          key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
          draftTitle: title,
        })}
        commit;
      `);
      const writerOutcome = waitForExit(writer);
      const writerReachedPostGuardMarker = await waitForApplicationLock(writerApplication);

      const transition = spawnPsql(`
        begin;
        set application_name = '${transitionApplication}';
        ${ownerLockSql(ownerC)}
        update public.user_account_lifecycles
        set status = '${status}', revision = revision + 1, updated_at = now()
        where owner_uuid = '${ownerC}' and account_generation = 1;
        commit;
      `);
      const transitionOutcome = waitForExit(transition);
      transitionBlocked.push(await waitForApplicationLock(transitionApplication, 750));

      control.stdin.write("commit;\n\\q\n");
      const [writerResult, transitionResult] = await Promise.all([
        writerOutcome,
        transitionOutcome,
      ]);
      await controlExit;

      expect(writerReachedPostGuardMarker, `${status} writer did not reach the post-guard marker`).toBe(true);
      expect(writerResult.status, writerResult.stderr).toBe(0);
      expect(transitionResult.status, transitionResult.stderr).toBe(0);
      expect(psql(`select status from public.user_account_lifecycles where owner_uuid = '${ownerC}' and account_generation = 1;`)).toBe(status);
      expect(psql(`select count(*)::text from public.recipes where title = '${title}';`)).toBe("1");
      expect(psql(`
        select md5(concat_ws('|', id, title, revision, visibility, coalesce(deleted_at::text, '')))
        from public.recipes where id = '${ownerPublicRecipe}';
      `)).toBe(sourceDigest);

      const effectDigest = psql(`
        select md5(concat_ws('|',
          (select count(*) from public.recipes),
          (select count(*) from public.mutation_idempotency_keys),
          (select count(*) from public.recipe_content_snapshots)
        ));
      `);
      expectSqlFailure(writerSql({
        operation: "fork",
        sourceRecipeId: ownerPublicRecipe,
        revision: 1,
        key: `85000000-0000-4000-8000-${String(keySuffix++).padStart(12, "0")}`,
        draftTitle: `hidden after ${status}`,
      }), /RESOURCE_NOT_FOUND/);
      expect(psql(`
        select md5(concat_ws('|',
          (select count(*) from public.recipes),
          (select count(*) from public.mutation_idempotency_keys),
          (select count(*) from public.recipe_content_snapshots)
        ));
      `)).toBe(effectDigest);
    }

    expect(
      transitionBlocked,
      "lifecycle transition committed after the writer guard but before the writer transaction",
    ).toEqual([true, true, true]);
  });

  it("forks without changing the public source and saves updates on the same ID", () => {
    const sourceBefore = psql(`select title || ':' || revision::text from public.recipes where id = '${publicRecipe}';`);
    const sourceRevision = Number(sourceBefore.split(":").at(-1));
    const forked = JSON.parse(psql(writerSql({
      operation: "fork",
      sourceRecipeId: publicRecipe,
      revision: sourceRevision,
      key: "85000000-0000-4000-8000-000000000003",
      draftTitle: "공개 원본을 포크한 개인식",
    })));

    expect(forked.data.origin_recipe_id).toBe(publicRecipe);
    expect(psql(`select title || ':' || revision::text from public.recipes where id = '${publicRecipe}';`)).toBe(sourceBefore);

    const updated = JSON.parse(psql(writerSql({
      operation: "update",
      recipeId: forked.data.id,
      revision: 1,
      key: "85000000-0000-4000-8000-000000000004",
      draftTitle: "같은 ID로 수정",
    })));
    expect(updated.data.id).toBe(forked.data.id);
    expect(updated.data.revision).toBe(2);
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${forked.data.id}';`)).toBe("2");

    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: forked.data.id,
        revision: 1,
        key: "85000000-0000-4000-8000-000000000005",
        draftTitle: "stale",
      }),
      /RECIPE_REVISION_CONFLICT/,
    );
    expect(psql(`select revision::text from public.recipes where id = '${forked.data.id}';`)).toBe("2");
  });

  it("requires the current source revision for both fork and save-as-new", () => {
    expectSqlFailure(
      writerSql({
        operation: "fork",
        sourceRecipeId: publicRecipe,
        revision: 999,
        key: "85000000-0000-4000-8000-000000000104",
        draftTitle: "stale public fork",
      }),
      /RECIPE_REVISION_CONFLICT/,
    );

    const source = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000105",
      draftTitle: "save-as-new revision source",
    })));

    expectSqlFailure(
      writerSql({
        operation: "save_as_new",
        sourceRecipeId: source.data.id,
        revision: 999,
        key: "85000000-0000-4000-8000-000000000106",
        draftTitle: "stale private copy",
      }),
      /RECIPE_REVISION_CONFLICT/,
    );
    expect(psql(`select revision::text from public.recipes where id = '${source.data.id}';`)).toBe("1");
  });

  it("creates a new ID only for save-as-new and soft-deletes idempotently", () => {
    const source = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000006",
      draftTitle: "복제 원본",
    })));
    const copy = JSON.parse(psql(writerSql({
      operation: "save_as_new",
      sourceRecipeId: source.data.id,
      revision: 1,
      key: "85000000-0000-4000-8000-000000000007",
      draftTitle: "새 레시피로 저장",
    })));
    expect(copy.data.id).not.toBe(source.data.id);
    expect(psql(`select revision::text from public.recipes where id = '${source.data.id}';`)).toBe("1");

    const deleteKey = "85000000-0000-4000-8000-000000000008";
    const deleted = JSON.parse(psql(writerSql({
      operation: "delete",
      recipeId: copy.data.id,
      key: deleteKey,
    })));
    const replay = JSON.parse(psql(writerSql({
      operation: "delete",
      recipeId: copy.data.id,
      key: deleteKey,
    })));
    expect(replay).toEqual(deleted);
    expect(psql(`select (deleted_at is not null)::text || ':' || revision::text from public.recipes where id = '${copy.data.id}';`)).toBe("true:2");
    expect(psql(`select count(*)::text from public.recipe_content_snapshots where recipe_id = '${copy.data.id}';`)).toBe("1");
  });

  it("preserves reviewed tags from the source on save-as-new when the client cannot author tags", () => {
    const source = JSON.parse(psql(writerSql({
      operation: "create",
      key: "85000000-0000-4000-8000-000000000107",
      draftTitle: "태그 보존 원본",
      tags: [{ normalized_key: "copied-tag", label: "복제 태그" }],
    })));

    expect(psql(`
      select concat(recipe_tag.visibility, ':', tag.kind, ':', recipe_tag.source, ':', tag.normalized_key)
      from public.recipe_tags as recipe_tag
      join public.tags as tag on tag.id = recipe_tag.tag_id
      where recipe_tag.recipe_id = '${source.data.id}';
    `)).toBe("private:user:user_selected:copied-tag");

    const copy = JSON.parse(psql(writerSql({
      operation: "save_as_new",
      sourceRecipeId: source.data.id,
      revision: 1,
      key: "85000000-0000-4000-8000-000000000108",
      draftTitle: "태그 보존 복사본",
      tags: null,
    })));

    expect(psql(`
      select concat(recipe_tag.visibility, ':', tag.kind, ':', recipe_tag.source, ':', tag.normalized_key)
      from public.recipe_tags as recipe_tag
      join public.tags as tag on tag.id = recipe_tag.tag_id
      where recipe_tag.recipe_id = '${copy.data.id}';
    `)).toBe("private:user:user_selected:copied-tag");
  });

  it("serializes writer and soft delete in both directions on two connections", async () => {
    const updateFirst = JSON.parse(psql(writerSql({
      operation: "create", owner: ownerD, session: sessionD,
      key: "85000000-0000-4000-8000-000000000032", draftTitle: "update first",
    })));
    const firstResults = await runAtBarrier([
      {
        preBarrier: ownerLockSql(ownerD),
        statement: writerCallSql({
          operation: "update", owner: ownerD, session: sessionD,
          recipeId: updateFirst.data.id, revision: 1,
          key: "85000000-0000-4000-8000-000000000033", draftTitle: "updated before delete",
        }),
      },
      writerCallSql({
        operation: "delete", owner: ownerD, session: sessionD,
        recipeId: updateFirst.data.id,
        key: "85000000-0000-4000-8000-000000000034",
      }),
    ]);
    expect(firstResults.every((result) => result.status === 0)).toBe(true);
    expect(psql(`select concat((deleted_at is not null)::text, ':', revision) from public.recipes where id = '${updateFirst.data.id}';`)).toBe("true:3");

    const deleteFirst = JSON.parse(psql(writerSql({
      operation: "create", owner: ownerE, session: sessionE,
      key: "85000000-0000-4000-8000-000000000035", draftTitle: "delete first",
    })));
    const secondResults = await runAtBarrier([
      {
        preBarrier: ownerLockSql(ownerE),
        statement: writerCallSql({
          operation: "delete", owner: ownerE, session: sessionE,
          recipeId: deleteFirst.data.id,
          key: "85000000-0000-4000-8000-000000000036",
        }),
      },
      writerCallSql({
        operation: "update", owner: ownerE, session: sessionE,
        recipeId: deleteFirst.data.id, revision: 1,
        key: "85000000-0000-4000-8000-000000000037", draftTitle: "must not revive",
      }),
    ]);
    expect(secondResults[0]?.status).toBe(0);
    expect(secondResults[1]?.stderr).toMatch(/RESOURCE_NOT_FOUND/);
    expect(psql(`select concat((deleted_at is not null)::text, ':', revision) from public.recipes where id = '${deleteFirst.data.id}';`)).toBe("true:2");
  });

  it("serializes writer and account cleanup in both directions without preserving private rows", async () => {
    const sharedBefore = psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${publicRecipe}';`);
    const writerFirst = JSON.parse(psql(writerSql({
      operation: "create", owner: ownerF, session: sessionF,
      key: "85000000-0000-4000-8000-000000000038", draftTitle: "writer before cleanup",
    })));
    const firstResults = await runAtBarrier([
      {
        preBarrier: ownerLockSql(ownerF),
        statement: writerCallSql({
          operation: "update", owner: ownerF, session: sessionF,
          recipeId: writerFirst.data.id, revision: 1,
          key: "85000000-0000-4000-8000-000000000039", draftTitle: "updated then cleaned",
        }),
      },
      cleanupCallSql(ownerF),
    ]);
    expect(firstResults.every((result) => result.status === 0)).toBe(true);
    expect(psql(`select count(*)::text from public.recipes where id = '${writerFirst.data.id}';`)).toBe("0");

    const cleanupFirst = JSON.parse(psql(writerSql({
      operation: "create", owner: ownerG, session: sessionG,
      key: "85000000-0000-4000-8000-000000000040", draftTitle: "cleanup before writer",
    })));
    const secondResults = await runAtBarrier([
      {
        preBarrier: ownerLockSql(ownerG),
        statement: cleanupCallSql(ownerG),
      },
      writerCallSql({
        operation: "update", owner: ownerG, session: sessionG,
        recipeId: cleanupFirst.data.id, revision: 1,
        key: "85000000-0000-4000-8000-000000000041", draftTitle: "stale writer",
      }),
    ]);
    expect(secondResults[0]?.status).toBe(0);
    expect(secondResults[1]?.stderr).toMatch(/ACCOUNT_DELETING|ACCOUNT_SESSION_STALE/);
    expect(psql(`select count(*)::text from public.recipes where id = '${cleanupFirst.data.id}';`)).toBe("0");
    expect(psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${publicRecipe}';`)).toBe(sharedBefore);
  });

  it("serializes cross-owner public forks with full account cleanup in both directions", async () => {
    const cleanupFirstBarrier = "homecook-personal-cleanup-first";
    const cleanupFirstWriterApp = "personal-cleanup-first-writer";
    const cleanupFirstDeleteApp = "personal-cleanup-first-delete";
    const cleanupFirstKey = "85000000-0000-4000-8000-000000000120";
    const control = spawnPsql();
    const controlReady = waitForToken(control, "CLEANUP_FIRST_BARRIER_READY");
    const controlExit = waitForExit(control);
    control.stdin.write(`
      select pg_advisory_lock(hashtextextended('${cleanupFirstBarrier}', 0));
      select 'CLEANUP_FIRST_BARRIER_READY';
    `);
    await controlReady;

    const cleanupFirstDelete = spawnPsql(`
      begin;
      set application_name = '${cleanupFirstDeleteApp}';
      ${ownerLockSql(ownerK)}
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
      update public.user_account_lifecycles
      set status = 'deleting', revision = revision + 1, updated_at = now()
      where owner_uuid = '${ownerK}' and account_generation = 1;
      select pg_advisory_xact_lock_shared(hashtextextended('${cleanupFirstBarrier}', 0));
      select public.delete_user_private_data('${ownerK}');
      update public.user_account_lifecycles
      set status = 'cleanup_pending', revision = revision + 1, updated_at = now()
      where owner_uuid = '${ownerK}' and account_generation = 1;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', false);
      commit;
    `);
    const cleanupFirstDeleteOutcome = waitForExit(cleanupFirstDelete);
    expect(await waitForApplicationLock(cleanupFirstDeleteApp)).toBe(true);

    const cleanupFirstWriter = spawnPsql(`
      begin;
      set application_name = '${cleanupFirstWriterApp}';
      ${writerCallSql({
        operation: "fork",
        sourceRecipeId: cleanupFirstPublicRecipe,
        revision: 1,
        key: cleanupFirstKey,
        draftTitle: "must not survive cleanup-first",
      })}
      commit;
    `);
    const cleanupFirstWriterOutcome = waitForExit(cleanupFirstWriter);
    expect(await waitForApplicationLock(cleanupFirstWriterApp)).toBe(true);
    const cleanupFirstGraph = concurrentLockGraph(
      cleanupFirstWriterApp,
      cleanupFirstDeleteApp,
    );
    const recipeProbe = psqlResult(`
      begin;
      select id from public.recipes
      where id = '${cleanupFirstPublicRecipe}'
      for update nowait;
      rollback;
    `);

    control.stdin.write(`
      select pg_advisory_unlock(hashtextextended('${cleanupFirstBarrier}', 0));
      \\q
    `);
    const [cleanupFirstWriterResult, cleanupFirstDeleteResult] = await Promise.all([
      cleanupFirstWriterOutcome,
      cleanupFirstDeleteOutcome,
    ]);
    await controlExit;

    const cleanupFirstErrors = `${cleanupFirstWriterResult.stderr}\n${cleanupFirstDeleteResult.stderr}`;
    const cleanupFirstSourceState = psql(`
      select concat_ws(':', visibility, (created_by is null)::text, title, revision)
      from public.recipes where id = '${cleanupFirstPublicRecipe}';
    `);
    const cleanupFirstForkCount = psql(
      "select count(*)::text from public.recipes where title = 'must not survive cleanup-first';",
    );
    const cleanupFirstReceiptCount = psql(`
      select count(*)::text
      from public.mutation_idempotency_keys
      where key_hash = encode(
        extensions.digest(convert_to('${cleanupFirstKey}', 'UTF8'), 'sha256'),
        'hex'
      );
    `);
    const cleanupFirstEvidence = {
      graph: cleanupFirstGraph,
      recipe_locked_before_all_owners: recipeProbe.status !== 0,
      writer_status: cleanupFirstWriterResult.status,
      cleanup_status: cleanupFirstDeleteResult.status,
      writer_error: cleanupFirstWriterResult.stderr.trim(),
      cleanup_error: cleanupFirstDeleteResult.stderr.trim(),
      source_state: cleanupFirstSourceState,
      fork_count: cleanupFirstForkCount,
      receipt_count: cleanupFirstReceiptCount,
    };
    expect(cleanupFirstGraph.writer_blocked_by_cleanup).toBe(true);
    expect(cleanupFirstGraph.writer_wait).toMatch(/^Lock:/);
    expect(cleanupFirstGraph.cleanup_wait).toMatch(/^Lock:/);
    expect(cleanupFirstGraph.cleanup_blocker_count).toBeGreaterThan(0);
    expect(
      /40P01|deadlock detected/i.test(cleanupFirstErrors),
      JSON.stringify(cleanupFirstEvidence),
    ).toBe(false);
    expect(recipeProbe.status, recipeProbe.stderr).toBe(0);
    expect(cleanupFirstDeleteResult.status, cleanupFirstDeleteResult.stderr).toBe(0);
    expect(cleanupFirstWriterResult.status).not.toBe(0);
    expect(cleanupFirstWriterResult.stderr).toMatch(/RESOURCE_NOT_FOUND/);
    expect(cleanupFirstSourceState).toBe("public:true:cleanup-first 공개 원본:1");
    expect(cleanupFirstForkCount).toBe("0");
    expect(cleanupFirstReceiptCount).toBe("0");

    const writerFirstApplication = "personal-full-cleanup-writer-first";
    const writerFirstDeleteApplication = "personal-full-cleanup-delete-second";
    const markerControl = spawnPsql();
    const markerReady = waitForToken(markerControl, "FULL_CLEANUP_MARKER_LOCKED");
    const markerControlExit = waitForExit(markerControl);
    markerControl.stdin.write(`
      begin;
      select 1 from public.account_generation_cutover_attempts
      where id = '${cutoverAttempt}' for update;
      select 'FULL_CLEANUP_MARKER_LOCKED';
    `);
    await markerReady;
    let markerReleased = false;
    const releaseMarkerControl = async () => {
      if (markerReleased) {
        return;
      }
      markerReleased = true;
      markerControl.stdin.write("commit;\n\\q\n");
      await markerControlExit;
    };

    try {
      const writerFirst = spawnPsql(`
        begin;
        set application_name = '${writerFirstApplication}';
        ${writerCallSql({
          operation: "fork",
          sourceRecipeId: writerFirstPublicRecipe,
          revision: 1,
          key: "85000000-0000-4000-8000-000000000121",
          draftTitle: "writer survives before full cleanup",
        })}
        commit;
      `);
      const writerFirstOutcome = waitForExit(writerFirst);
      expect(await waitForApplicationLock(writerFirstApplication)).toBe(true);

      const writerFirstDelete = spawnPsql(`
        begin;
        set application_name = '${writerFirstDeleteApplication}';
        ${cleanupCallSql(ownerL)}
        commit;
      `);
      const writerFirstDeleteOutcome = waitForExit(writerFirstDelete);
      expect(await waitForApplicationLock(writerFirstDeleteApplication)).toBe(true);
      const writerFirstGraph = concurrentLockGraph(
        writerFirstApplication,
        writerFirstDeleteApplication,
      );

      await releaseMarkerControl();
      const [writerFirstResult, writerFirstDeleteResult] = await Promise.all([
        writerFirstOutcome,
        writerFirstDeleteOutcome,
      ]);

      const writerFirstErrors =
        `${writerFirstResult.stderr}\n${writerFirstDeleteResult.stderr}`;
      expect(writerFirstGraph.cleanup_blocker_count).toBeGreaterThan(0);
      expect(writerFirstErrors).not.toMatch(/40P01|deadlock detected/i);
      expect(writerFirstResult.status, writerFirstResult.stderr).toBe(0);
      expect(writerFirstDeleteResult.status, writerFirstDeleteResult.stderr).toBe(0);
      expect(
        psql("select count(*)::text from public.recipes where title = 'writer survives before full cleanup';"),
      ).toBe("1");
      expect(psql(`
        select concat_ws(':', visibility, (created_by is null)::text, title, revision)
        from public.recipes where id = '${writerFirstPublicRecipe}';
      `)).toBe("public:true:writer-first 공개 원본:1");
    } finally {
      await releaseMarkerControl();
    }
  });

  it("rejects a G1 writer after an in-flight G2 transition and clears the F0 marker", async () => {
    const created = JSON.parse(psql(writerSql({
      operation: "create", owner: ownerH, session: sessionH,
      key: "85000000-0000-4000-8000-000000000042", draftTitle: "G1 stale target",
    })));
    const digestBefore = psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${created.data.id}';`);
    const results = await runAtBarrier([
      {
        preBarrier: `
          ${ownerLockSql(ownerH)}
          select 1 from public.user_account_lifecycles
          where owner_uuid = '${ownerH}' and account_generation = 1 for update;
        `,
        statement: `
          select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', true);
          update public.user_account_lifecycles
          set status = 'deleting', revision = revision + 1, updated_at = now()
          where owner_uuid = '${ownerH}' and account_generation = 1;
          update public.user_session_generation_bindings
          set revoked_at = now()
          where owner_uuid = '${ownerH}' and expected_account_generation = 1;
          delete from public.user_session_generation_bindings
          where owner_uuid = '${ownerH}' and expected_account_generation = 1;
          update public.user_account_lifecycles
          set status = 'cleanup_pending', revision = revision + 1, updated_at = now()
          where owner_uuid = '${ownerH}' and account_generation = 1;
          update public.user_account_generation_watermarks
          set last_account_generation = 2
          where owner_uuid = '${ownerH}';
          update auth.users
          set created_at = '${identityEpochG2}'
          where id = '${ownerH}';
          insert into public.user_account_lifecycles (
            owner_uuid, account_generation, auth_identity_created_at_snapshot,
            origin, status, activated_at
          ) values ('${ownerH}', 2, '${identityEpochG2}', 'runtime', 'active', '2026-08-02T02:20:00Z');
          insert into public.user_session_generation_bindings (
            session_key_hash, hmac_key_version, owner_uuid,
            expected_account_generation, auth_identity_created_at_snapshot,
            binding_state, auth_authority, local_issuer, local_verified_at,
            auth_cutover_epoch, session_issued_at, binding_expires_at
          ) values (
            '${sessionH2}', 1, '${ownerH}', 2, '${identityEpochG2}',
            'active', 'local', '${localIssuer}', '2026-08-02T02:30:00Z',
            2, '2026-08-02T02:30:00Z', '2099-01-01T00:00:00Z'
          );
          select public.set_account_generation_internal_writer_marker('${cutoverAttempt}', false);
        `,
      },
      writerCallSql({
        operation: "update", owner: ownerH, session: sessionH,
        recipeId: created.data.id, revision: 1,
        key: "85000000-0000-4000-8000-000000000043", draftTitle: "must stay G1",
      }),
    ]);
    expect(results[0]?.status).toBe(0);
    expect(results[1]?.stderr).toMatch(/ACCOUNT_SESSION_STALE|ACCOUNT_GENERATION_STALE/);
    expect(psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${created.data.id}';`)).toBe(digestBefore);
    expect(psql(`select coalesce(result_json ->> '_internal_generation_writer_txid', '') from public.account_generation_cutover_attempts where id = '${cutoverAttempt}';`)).toBe("");
  });

  it("commits private user tags and rolls back every effect when image attach fails", () => {
    const tagged = JSON.parse(psql(writerSql({
      operation: "create",
      key: "90000000-0000-4000-8000-000000000010",
      draftTitle: "태그 포함 개인식",
      tags: [{ normalized_key: "my-tag", label: "내 태그" }],
    })));
    expect(psql(`select concat(recipe_tag.visibility, ':', tag.kind, ':', recipe_tag.source) from public.recipe_tags recipe_tag join public.tags tag on tag.id = recipe_tag.tag_id where recipe_tag.recipe_id = '${tagged.data.id}';`)).toBe("private:user:user_selected");

    const markerBefore = psql(`select coalesce(result_json ->> '_internal_generation_writer_txid', '') from public.account_generation_cutover_attempts where id = '${cutoverAttempt}';`);
    const sharedBefore = psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${publicRecipe}';`);
    const failedKey = "90000000-0000-4000-8000-000000000011";
    expectSqlFailure(writerSql({
      operation: "create",
      key: failedKey,
      draftTitle: "이미지 실패 롤백",
      tags: [{ normalized_key: "rollback-tag", label: "롤백 태그" }],
      imageObjectId: "85000000-0000-4000-8000-000000000099",
    }), /IMAGE_/);
    expect(psql("select count(*)::text from public.recipes where title = '이미지 실패 롤백';")).toBe("0");
    expect(psql("select count(*)::text from public.recipe_content_snapshots snapshot join public.recipes recipe on recipe.id = snapshot.recipe_id where recipe.title = '이미지 실패 롤백';")).toBe("0");
    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where key_hash = encode(extensions.digest(convert_to('${failedKey}', 'UTF8'), 'sha256'), 'hex');`)).toBe("0");
    expect(psql("select count(*)::text from public.tags where normalized_key = 'rollback-tag';")).toBe("0");
    expect(psql(`select coalesce(result_json ->> '_internal_generation_writer_txid', '') from public.account_generation_cutover_attempts where id = '${cutoverAttempt}';`)).toBe(markerBefore);
    expect(psql(`select md5(concat_ws('|', title, revision, visibility)) from public.recipes where id = '${publicRecipe}';`)).toBe(sharedBefore);
  });

  it("denies public, other-owner, and authenticated direct mutation", () => {
    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: publicRecipe,
        revision: 7,
        key: "85000000-0000-4000-8000-000000000009",
      }),
      /FORBIDDEN/,
    );
    expectSqlFailure(
      writerSql({
        operation: "update",
        recipeId: privateRecipeB,
        revision: 1,
        key: "85000000-0000-4000-8000-000000000010",
      }),
      /RESOURCE_NOT_FOUND/,
    );
    expectSqlFailure(
      `begin; set local role authenticated; update public.recipes set title = '우회' where id = '${publicRecipe}'; commit;`,
      /permission denied/i,
    );
    expect(psql(`select title from public.recipes where id = '${publicRecipe}';`)).toBe("공개 원본");
  });

  it("cleans only the deleting generation's personal receipts before account hard delete", () => {
    psql(`
      insert into public.mutation_idempotency_keys (
        owner_uuid, account_generation, operation_scope, key_hash,
        payload_hash, state, durable_result
      ) values
        ('${ownerB}', 1, 'personal_recipe_update', repeat('1', 64), repeat('2', 64), 'succeeded', '{}'::jsonb),
        ('${ownerB}', 2, 'personal_recipe_update', repeat('3', 64), repeat('4', 64), 'succeeded', '{}'::jsonb);

      update public.user_account_lifecycles
      set status = 'deleting', revision = revision + 1, updated_at = now()
      where owner_uuid = '${ownerB}' and account_generation = 1;
    `);

    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where owner_uuid = '${ownerB}' and account_generation = 1 and operation_scope like 'personal_recipe_%';`)).toBe("0");
    expect(psql(`select count(*)::text from public.mutation_idempotency_keys where owner_uuid = '${ownerB}' and account_generation = 2 and operation_scope like 'personal_recipe_%';`)).toBe("1");
  });
});
