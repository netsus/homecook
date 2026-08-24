import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const MIGRATION_SUFFIX = "_full_local_core_owner_read_rls.sql";

const TABLE_SPECS = [
  {
    table: "users",
    policy: "users_select_own",
    userExpression: "id = auth.uid()",
  },
  {
    table: "recipe_books",
    policy: "recipe_books_select_own",
    userExpression: "user_id = auth.uid()",
  },
  {
    table: "recipe_book_items",
    policy: "recipe_book_items_select_owned_book",
    userExpression:
      "exists (select 1 from public.recipe_books as recipe_book where recipe_book.id = recipe_book_items.book_id and recipe_book.user_id = auth.uid())",
  },
  {
    table: "meal_plan_columns",
    policy: "meal_plan_columns_select_own",
    userExpression: "user_id = auth.uid()",
  },
  {
    table: "meals",
    policy: "meals_select_own",
    userExpression: "user_id = auth.uid()",
  },
  {
    table: "cooking_sessions",
    policy: "cooking_sessions_select_own",
    userExpression: "user_id = auth.uid()",
  },
  {
    table: "cooking_session_meals",
    policy: "cooking_session_meals_select_owned_session",
    userExpression:
      "exists (select 1 from public.cooking_sessions as cooking_session where cooking_session.id = cooking_session_meals.session_id and cooking_session.user_id = auth.uid())",
  },
] as const;

function migrationName() {
  const name = readdirSync(MIGRATIONS_DIR)
    .filter((value) => value.endsWith(MIGRATION_SUFFIX))
    .sort()
    .at(-1);

  expect(name, "owner-read migration is missing").toBeTruthy();
  return name!;
}

function migrationSql() {
  return readFileSync(join(MIGRATIONS_DIR, migrationName()), "utf8");
}

function priorMigrationSql() {
  const target = migrationName();
  return readdirSync(MIGRATIONS_DIR)
    .filter((value) => value.endsWith(".sql") && value < target)
    .sort()
    .map((value) => readFileSync(join(MIGRATIONS_DIR, value), "utf8"))
    .join("\n");
}

describe("full-local core owner-read RLS migration", () => {
  it("adds the focused PostgreSQL runner script to package.json", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["test:full-local-core-owner-read-rls:postgres"]).toBe(
      "node scripts/run-full-local-core-owner-read-rls-postgres-integration.mjs",
    );
    expect(
      existsSync(
        join(
          process.cwd(),
          "scripts/run-full-local-core-owner-read-rls-postgres-integration.mjs",
        ),
      ),
    ).toBe(true);
  });

  it("shows the ACL and policy gap before the repair migration", () => {
    const sql = priorMigrationSql();

    for (const { table, policy } of TABLE_SPECS) {
      expect(sql).not.toMatch(
        new RegExp(`create policy\\s+${policy}\\s+on\\s+public\\.${table}`, "i"),
      );
      expect(sql).not.toMatch(
        new RegExp(`grant\\s+select\\s+on\\s+public\\.${table}\\s+to\\s+authenticated`, "i"),
      );
      expect(sql).not.toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      );
    }
  });

  it("adds authenticated owner-only SELECT with RLS and keeps direct writes revoked", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/alter\s+table[\s\S]*?(?<!no )force row level security/i);

    for (const { table, policy, userExpression } of TABLE_SPECS) {
      expect(sql).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+no\\s+force\\s+row\\s+level\\s+security`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${policy}\\s+on\\s+public\\.${table}`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`create\\s+policy\\s+${policy}\\s+on\\s+public\\.${table}[\\s\\S]*for\\s+select[\\s\\S]*to\\s+authenticated[\\s\\S]*using\\s*\\(${userExpression.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`revoke\\s+select\\s+on\\s+public\\.${table}\\s+from\\s+anon`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`grant\\s+select\\s+on\\s+public\\.${table}\\s+to\\s+authenticated`, "i"),
      );
    }
  });
});
