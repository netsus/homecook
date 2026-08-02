import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const mealCreateRoutePath = join(process.cwd(), "app/api/v1/meals/route.ts");
const mealDetailRoutePath = join(
  process.cwd(),
  "app/api/v1/meals/[meal_id]/route.ts",
);
const shoppingCreateRoutePath = join(
  process.cwd(),
  "app/api/v1/shopping/lists/route.ts",
);

const auth5RpcArgs = [
  "p_owner_uuid",
  "p_auth_identity_created_at_snapshot",
  "p_session_key_hash",
  "p_hmac_key_version",
  "p_session_issued_at",
] as const;

function readRoute(path: string) {
  return readFileSync(path, "utf8");
}

function expectAuth5RpcArgs(source: string) {
  if (/\.\.\.buildSessionAuthorityRpcArgs\s*\(/.test(source)) {
    return;
  }

  for (const argument of auth5RpcArgs) {
    expect(source, `missing common RPC auth argument ${argument}`).toMatch(
      new RegExp(`\\b${argument}\\s*:`),
    );
  }
}

function expectSnapshotGroupedRecipePayload(
  routeSource: string,
  rpcWindow: string,
) {
  if (
    rpcWindow.includes("recipe_id") &&
    rpcWindow.includes("recipe_content_snapshot_id")
  ) {
    return;
  }

  const payloadReference = rpcWindow.match(
    /p_[a-z_]*(?:recipe|group)[a-z_]*\s*:\s*([A-Za-z_$][\w$]*)/i,
  )?.[1];
  expect(payloadReference, "shopping RPC recipe-group payload is missing").toBeTruthy();

  const declarationPatterns = [
    new RegExp(`const\\s+${payloadReference}\\b`),
    new RegExp(`function\\s+${payloadReference}\\b`),
  ];
  const declarationStart = declarationPatterns
    .map((pattern) => routeSource.search(pattern))
    .find((index) => index >= 0);
  expect(
    declarationStart,
    `cannot trace shopping RPC payload ${payloadReference}`,
  ).toBeGreaterThanOrEqual(0);

  const declaration = routeSource.slice(declarationStart, declarationStart + 2_000);
  expect(declaration).toContain("recipe_id");
  expect(declaration).toContain("recipe_content_snapshot_id");
}

function expectNoDirectTableMutation(
  source: string,
  table: string,
  operation: "insert" | "update" | "delete",
) {
  expect(source).not.toMatch(
    new RegExp(
      `\\.from\\(\\s*["']${table}["']\\s*\\)[\\s\\S]{0,240}\\.${operation}\\s*\\(`,
      "i",
    ),
  );
}

function commonWriterRpcWindows(source: string, resource: "meal" | "shopping") {
  const rpcName = resource === "meal"
    ? "write_future_meal_with_snapshot_authority"
    : "create_shopping_list_with_snapshot_authority";
  const pattern = new RegExp(
    `(?:\\.rpc\\(\\s*["']${rpcName}["']|\\bcallFuturePropagationRpc\\([\\s\\S]{0,160}?["']${rpcName}["'])`,
    "gi",
  );
  const matches = [...source.matchAll(pattern)];
  expect(matches.length, `missing ${resource} common writer RPC`).toBeGreaterThan(0);
  return matches.map((match) => source.slice(match.index, match.index + 2_500));
}

function readFuturePropagationMigration() {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
    .sort();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return readFileSync(join(migrationsDir, candidates.at(-1)!), "utf8");
}

describe("recipe shopping reconciliation", () => {
  it("keeps completed shopping immutable while preview still reports both incomplete and completed counts", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("incomplete_shopping_list_count");
    expect(sql).toContain("completed_shopping_list_count");
    expect(sql).toContain("replace_all_allowed");
    expect(sql).toContain("replace_all");
    expect(sql).toContain("keep");
  });

  it("reconciles shopping through the existing item identity surfaces instead of inventing new item schemas", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("shopping_list_items");
    expect(sql).toMatch(/ingredient_id|food_product_id/i);
    expect(sql).not.toMatch(/shopping_item_snapshot|shopping_item_replacement/i);
  });

  it("treats claimed targets as all-or-nothing replace_all failures instead of partial silent skips", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toContain("active_cooking_claim_count");
    expect(sql).toContain("MEAL_COOKING_ALREADY_STARTED");
    expect(sql).not.toMatch(/skip_claimed|ignore_claimed/i);
  });
});

describe("Stage 2 common writer route inventory", () => {
  it("moves POST /meals to one auth5 common RPC without a direct insert fallback and preserves its public shape", () => {
    const source = readRoute(mealCreateRoutePath);
    const postSource = source.slice(source.indexOf("async function postMeals"));

    const writerRpcWindows = commonWriterRpcWindows(postSource, "meal");
    writerRpcWindows.forEach(expectAuth5RpcArgs);
    expectNoDirectTableMutation(postSource, "meals", "insert");
    expect(postSource).toContain("MealCreateBody");
    expect(postSource).toContain("MealCreateData");
    expect(postSource).toMatch(/return ok\([\s\S]*status:\s*201/);
  });

  it("moves PATCH and DELETE /meals/{id} to auth5 common RPC writes without update/delete fallback", () => {
    const source = readRoute(mealDetailRoutePath);

    const writerRpcWindows = commonWriterRpcWindows(source, "meal");
    writerRpcWindows.forEach(expectAuth5RpcArgs);
    expectNoDirectTableMutation(source, "meals", "update");
    expectNoDirectTableMutation(source, "meals", "delete");
    expect(source).toContain("MealUpdateBody");
    expect(source).toContain("MealMutationData");
    expect(source).toContain("new Response(null, { status: 204 })");
  });

  it("moves POST /shopping/lists to one auth5 common RPC with snapshot grouping and no REST mutation fallback", () => {
    const source = readRoute(shoppingCreateRoutePath);
    const postStart = source.indexOf("export async function POST");
    const postEnd = source.indexOf("export async function GET", postStart);
    const postSource = source.slice(postStart, postEnd);

    const writerRpcWindows = commonWriterRpcWindows(postSource, "shopping");
    writerRpcWindows.forEach(expectAuth5RpcArgs);
    for (const [table, operations] of [
      ["shopping_lists", ["insert"]],
      ["shopping_list_recipes", ["insert"]],
      ["shopping_list_items", ["insert"]],
      ["meals", ["insert", "update"]],
    ] as const) {
      for (const operation of operations) {
        expectNoDirectTableMutation(postSource, table, operation);
      }
    }
    expect(postSource).not.toMatch(/typeof\s+dbClient\.rpc\s*===\s*["']function["']/);

    const [writerRpcWindow] = writerRpcWindows;
    expectSnapshotGroupedRecipePayload(source, writerRpcWindow);

    expect(postSource).toContain("ShoppingListCreateBody");
    expect(postSource).toContain("ShoppingListSummary");
    expect(postSource).toContain("ShoppingListAllPantryCompletionSummary");
    expect(postSource).toMatch(/status:\s*200/);
    expect(postSource).toMatch(/status:\s*201/);
  });

  it("locks shopping recipes in UUID order and groups by recipe plus immutable content snapshot", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toMatch(
      /recipe_id[\s\S]*order by[\s\S]*recipe_id::text\s+collate\s+"C"/i,
    );
    expect(sql).toMatch(
      /recipe_id[\s\S]{0,500}recipe_content_snapshot_id|recipe_content_snapshot_id[\s\S]{0,500}recipe_id/i,
    );
  });
});
