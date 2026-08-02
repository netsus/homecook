import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql",
);

function migration() {
  expect(existsSync(migrationPath), "personal recipe write migration is missing").toBe(
    true,
  );
  return readFileSync(migrationPath, "utf8");
}

describe("personal recipe write security", () => {
  it("acquires the shared fence, owner, UUID-sorted recipe, and resource locks in order", () => {
    const sql = migration();
    const writer = sql.indexOf("create or replace function public.write_personal_recipe_core");
    const fence = sql.indexOf("homecook-account-generation-cutover", writer);
    const owner = sql.indexOf("homecook-account-owner:");
    const recipe = sql.indexOf("perform public.lock_personal_recipe_ids", owner);
    const resource = sql.indexOf("for update", recipe);

    expect(fence).toBeGreaterThan(-1);
    expect(owner).toBeGreaterThan(fence);
    expect(recipe).toBeGreaterThan(owner);
    expect(resource).toBeGreaterThan(recipe);
    expect(sql.slice(0, writer)).toMatch(/order by recipe_id::text collate "C"/i);
  });

  it("fails closed for lifecycle, session, generation, owner, public mutation, and deleted rows", () => {
    const sql = migration();

    for (const code of [
      "ACCOUNT_GENERATION_STALE",
      "ACCOUNT_SESSION_STALE",
      "ACCOUNT_CUTOVER_QUARANTINED",
      "ACCOUNT_DELETING",
      "RESOURCE_NOT_FOUND",
      "FORBIDDEN",
    ]) {
      expect(sql, `missing official failure ${code}`).toContain(code);
    }
    expect(sql).toMatch(/created_by is distinct from p_owner_uuid/i);
    expect(sql).toMatch(/visibility is distinct from 'private'/i);
    expect(sql).toMatch(/deleted_at is not null/i);
    expect(sql).toMatch(
      /recipe_visibility_guard\.is_owner_publicly_visible\(v_source\.created_by\)/i,
    );
    expect(sql).toMatch(
      /recipe_visibility_guard\.is_owner_publicly_visible\(v_recipe\.created_by\)/i,
    );
  });

  it("denies authenticated direct DML and never accepts client owner or visibility authority", () => {
    const sql = migration();

    expect(sql).toMatch(/revoke insert, update, delete[\s\S]*public\.recipes[\s\S]*authenticated/i);
    expect(sql).toMatch(/revoke insert, update, delete[\s\S]*public\.recipe_ingredients[\s\S]*authenticated/i);
    expect(sql).toMatch(/revoke insert, update, delete[\s\S]*public\.recipe_steps[\s\S]*authenticated/i);
    expect(sql).not.toMatch(/p_created_by|p_visibility|p_account_generation/i);
  });

  it("keeps managed image and tag effects inside the same transaction", () => {
    const sql = migration();

    expect(sql).toMatch(/attach_recipe_image_object/i);
    expect(sql).toMatch(/set_recipe_tags/i);
    expect(sql).toMatch(/p_image_object_id uuid/i);
    expect(sql).not.toMatch(/thumbnail_url\s*=\s*p_/i);
    expect(sql).toMatch(/exception[\s\S]*rollback|all effects roll back/i);
  });

  it("registers every new security-definer function in the authorization inventory", () => {
    const manifestPath = join(
      process.cwd(),
      "docs/security/personal-recipe-customization-write-core-security-function-authorization-manifest.json",
    );
    expect(existsSync(manifestPath), "security function manifest is missing").toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      functions: Array<{
        signature: string;
        allowed_principals: string[];
        owner?: string;
      }>;
    };
    expect(manifest.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signature: "public.enforce_recipe_ingredient_product_link()",
        allowed_principals: [],
        owner: "postgres",
      }),
      expect.objectContaining({
        signature: "public.lock_personal_recipe_ids(uuid[])",
        allowed_principals: [],
        owner: "postgres",
      }),
      expect.objectContaining({
        signature: expect.stringMatching(/^public\.write_personal_recipe_core\(/),
        allowed_principals: ["service_role"],
        owner: "postgres",
      }),
      expect.objectContaining({
        signature: "public.cleanup_personal_recipe_write_receipts()",
        allowed_principals: [],
        owner: "postgres",
      }),
    ]));

    const validator = readFileSync(
      join(process.cwd(), "scripts/validate-security-function-authorization.mjs"),
      "utf8",
    );
    expect(validator).toContain(
      "personal-recipe-customization-write-core-security-function-authorization-manifest.json",
    );

    const centralInventory = readFileSync(
      join(process.cwd(), "scripts/lib/full-local-security-inventory.mjs"),
      "utf8",
    );
    expect(centralInventory).toContain(
      "personal-recipe-customization-write-core-security-function-authorization-manifest.json",
    );

    const sql = migration();
    for (const signature of [
      "public.lock_personal_recipe_ids(uuid[])",
      "public.write_personal_recipe_core(uuid, timestamp with time zone, text, integer, text, uuid, uuid, bigint, jsonb, jsonb, jsonb, uuid, bigint, uuid, timestamp with time zone)",
      "public.cleanup_personal_recipe_write_receipts()",
    ]) {
      expect(sql).toContain(`alter function ${signature} owner to postgres`);
    }
  });
});
