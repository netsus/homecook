import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";

const useLinkedRemote = process.argv.includes("--linked-remote");
const useProductionSafe = process.argv.includes("--production-safe");
const linkedRoot = useLinkedRemote
  ? resolveSecurityFunctionLinkedRoot()
  : process.cwd();
const databaseUrl = process.env.SECURITY_FUNCTION_DATABASE_URL
  ?? (useLinkedRemote ? null : "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const databaseEnvironment = useLinkedRemote
  ? readLinkedDatabaseEnvironment()
  : process.env;
if (process.argv.includes("--check-linked-environment")) {
  console.warn("linked Supabase database environment is available");
  process.exit(0);
}
const actorA = randomUUID();
const actorB = randomUUID();
const targetId = runPsql("select id from public.recipes order by id limit 1") || randomUUID();

const anonMutationCalls = [
  {
    signature: "public.complete_cooking_session(uuid, uuid, uuid[])",
    sql: `select public.complete_cooking_session('${targetId}', '${actorA}', '{}'::uuid[])`,
  },
  {
    signature: "public.complete_shopping_list(uuid, uuid, uuid[])",
    sql: `select public.complete_shopping_list('${targetId}', '${actorA}', null)`,
  },
  {
    signature: "public.complete_standalone_cooking(uuid, uuid, integer, uuid[])",
    sql: `select public.complete_standalone_cooking('${targetId}', '${actorA}', 1, '{}'::uuid[])`,
  },
  {
    signature: "public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer)",
    sql: `select public.create_shopping_list_from_payload('${actorA}', 'denied', current_date, current_date, false, '{}'::uuid[], '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0)`,
  },
  {
    signature: "public.delete_user_private_data(uuid)",
    sql: `select public.delete_user_private_data('${actorA}')`,
  },
  {
    signature: "public.increment_recipe_view_count(uuid)",
    sql: `select * from public.increment_recipe_view_count('${targetId}')`,
  },
  {
    signature: "public.register_youtube_ingredient(text, text, text, text)",
    sql: "select public.register_youtube_ingredient('denied ingredient', '기타', null, null)",
  },
  {
    signature: "public.register_youtube_ingredient(text, text, text, text, text)",
    sql: "select public.register_youtube_ingredient('denied ingredient', '기타', 'frozen_ready_drink_other', null, null)",
  },
];

function runPsql(sql, { expectFailure = false } = {}) {
  const connectionArgs = databaseUrl ? [databaseUrl] : [];
  const result = spawnSync(
    "psql",
    [
      ...connectionArgs,
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
      "-c",
      sql,
    ],
    { encoding: "utf8", env: databaseEnvironment },
  );

  if (expectFailure) {
    if (result.status === 0) {
      throw new Error(`expected PostgreSQL call to fail: ${sql}`);
    }
    if (!/permission denied|requires service_role|FORBIDDEN/u.test(result.stderr)) {
      throw new Error(`unexpected PostgreSQL denial: ${result.stderr.trim()}`);
    }
    if (useProductionSafe && !/\b42501\b/u.test(result.stderr)) {
      throw new Error(`expected SQLSTATE 42501 denial: ${result.stderr.trim()}`);
    }
    return result.stderr;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "PostgreSQL command failed");
  }
  return result.stdout.trim();
}

function readLinkedDatabaseEnvironment() {
  const dryRun = spawnSync(
    "pnpm",
    ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
    { cwd: linkedRoot, encoding: "utf8" },
  );
  if (dryRun.status !== 0) {
    throw new Error("linked Supabase database environment is unavailable");
  }

  const environment = { ...process.env };
  let matched = 0;
  for (const line of dryRun.stdout.split(/\r?\n/u)) {
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

function runPsqlAsync(sql) {
  const connectionArgs = databaseUrl ? [databaseUrl] : [];
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        ...connectionArgs,
        "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
        "-c", "begin; set local role service_role; set local \"request.jwt.claim.role\" = 'service_role'",
        "-c", sql,
        "-c", "commit",
      ],
      { env: databaseEnvironment },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "PostgreSQL command failed"));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function databaseChecksum() {
  const snapshot = runPsql(`
    select pg_catalog.jsonb_build_object(
      'users', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)) from public.users row_value where id = '${actorA}'), '[]'::jsonb),
      'recipes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.recipes row_value where id = '${targetId}' or created_by = '${actorA}'), '[]'::jsonb),
      'recipe_likes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.recipe_likes row_value where user_id = '${actorA}' or recipe_id = '${targetId}'), '[]'::jsonb),
      'recipe_books', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.recipe_books row_value where user_id = '${actorA}'), '[]'::jsonb),
      'meals', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.meals row_value where user_id = '${actorA}' or recipe_id = '${targetId}'), '[]'::jsonb),
      'shopping_lists', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.shopping_lists row_value where id = '${targetId}' or user_id = '${actorA}'), '[]'::jsonb),
      'shopping_list_items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.shopping_list_items row_value where shopping_list_id = '${targetId}'), '[]'::jsonb),
      'pantry_items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.pantry_items row_value where user_id = '${actorA}'), '[]'::jsonb),
      'cooking_sessions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.cooking_sessions row_value where id = '${targetId}' or user_id = '${actorA}'), '[]'::jsonb),
      'leftover_dishes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.leftover_dishes row_value where id = '${targetId}' or user_id = '${actorA}' or recipe_id = '${targetId}'), '[]'::jsonb),
      'food_products', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.food_products row_value where owner_user_id = '${actorA}'), '[]'::jsonb),
      'product_planner_entries', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.product_planner_entries row_value where user_id = '${actorA}'), '[]'::jsonb),
      'ingredients', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.ingredients row_value where standard_name in ('denied ingredient', 'security hotfix rollback probe')), '[]'::jsonb),
      'ingredient_synonyms', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by id) from public.ingredient_synonyms row_value where synonym in ('denied ingredient', 'security hotfix rollback probe')), '[]'::jsonb)
    )
  `);
  return createHash("sha256").update(snapshot).digest("hex");
}

const anonMutationEvidence = [];
for (const { signature, sql } of anonMutationCalls) {
  const beforeChecksum = databaseChecksum();
  const transaction = useProductionSafe
    ? `begin read only; set local role anon; ${sql}; rollback;`
    : `begin; set local role anon; ${sql}; rollback;`;
  runPsql(transaction, { expectFailure: true });
  const afterChecksum = databaseChecksum();
  if (afterChecksum !== beforeChecksum) {
    throw new Error(`anon mutation checksum changed: ${signature}`);
  }
  anonMutationEvidence.push({
    signature,
    direct_call: "denied",
    before_checksum: beforeChecksum,
    after_checksum: afterChecksum,
    unchanged: true,
  });
}

if (useProductionSafe) {
  console.warn(JSON.stringify({
    mode: "production-safe",
    anon_mutation_signatures_checked: anonMutationCalls.length,
    anon_mutation_evidence: anonMutationEvidence,
  }, null, 2));
  process.exit(0);
}

runPsql(
  `begin;
   set local role authenticated;
   select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
   select pg_catalog.set_config('request.jwt.claim.sub', '${actorA}', true);
   select public.register_youtube_ingredient('denied ingredient', '기타', null, null);
   rollback;`,
  { expectFailure: true },
);

runPsql(
  `begin;
   set local role authenticated;
   select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
   select pg_catalog.set_config('request.jwt.claim.sub', '${actorA}', true);
   select public.list_food_products('${actorA}', null, null, null, 1);
   rollback;`,
);

runPsql(
  `begin;
   set local role authenticated;
   select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
   select pg_catalog.set_config('request.jwt.claim.sub', '${actorA}', true);
   select public.list_food_products('${actorB}', null, null, null, 1);
   rollback;`,
  { expectFailure: true },
);

runPsql(
  `begin;
   set local role service_role;
   select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
   select public.register_youtube_ingredient('security hotfix rollback probe', '기타', null, null);
   rollback;`,
);

runPsql(
  `begin;
   set local role service_role;
   select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
   select public.delete_user_private_data('${actorA}');
  rollback;`,
);

runPsql(
  `begin;
   set local role anon;
   select * from public.consume_youtube_ingredient_registration_rate_limit(
     '${actorA}', '${randomUUID()}', '${randomUUID()}', '/security-hotfix-probe'
   );
   rollback;`,
  { expectFailure: true },
);

const rateLimitActor = randomUUID();
let concurrentRateLimitResults;
try {
  concurrentRateLimitResults = await Promise.all(
    Array.from({ length: 21 }, () => runPsqlAsync(
      `select pg_catalog.concat(result ->> 'allowed', '|', result ->> 'attempt_count')
         from (
           select public.consume_youtube_ingredient_registration_rate_limit(
             '${rateLimitActor}', '${randomUUID()}', '${randomUUID()}', '/security-hotfix-concurrency-probe'
           ) as result
         ) rate_limit_result`,
    )),
  );
} finally {
  runPsql(
    `delete from public.operational_events
      where actor_user_id = '${rateLimitActor}'
        and event_type = 'youtube_ingredient_registration_attempt'`,
  );
}
const parsedRateLimitResults = concurrentRateLimitResults.map((result) => {
  const match = result.match(/^(true|false)\|(\d+)$/u);
  if (!match) throw new Error(`unexpected rate limit result: ${result}`);
  return { allowed: match[1] === "true", attemptCount: Number(match[2]) };
});
if (parsedRateLimitResults.filter((result) => result.allowed).length !== 20
  || parsedRateLimitResults.filter((result) => !result.allowed).length !== 1
  || Math.max(...parsedRateLimitResults.map((result) => result.attemptCount)) !== 21) {
  throw new Error("concurrent taxonomy rate limit did not enforce the exact 20-attempt ceiling");
}

console.warn(JSON.stringify({
  anon_mutation_signatures_checked: anonMutationCalls.length,
  anon_mutation_evidence: anonMutationEvidence,
  authenticated_taxonomy_direct: "denied",
  authenticated_self_read: "allowed",
  authenticated_cross_user_read: "denied",
  service_taxonomy: "allowed-and-rolled-back",
  service_account_cleanup: "allowed-and-rolled-back",
  taxonomy_rate_limit_anon_direct: "denied",
  taxonomy_rate_limit_concurrency: {
    attempts: parsedRateLimitResults.length,
    allowed: parsedRateLimitResults.filter((result) => result.allowed).length,
    denied: parsedRateLimitResults.filter((result) => !result.allowed).length,
    max_attempt_count: Math.max(...parsedRateLimitResults.map((result) => result.attemptCount)),
  },
}, null, 2));
