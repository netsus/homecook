import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifestPath =
  "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json";

describe("recipe snapshot security function inventory", () => {
  it("adds every new or recreated function to the additive authorization contract", () => {
    expect(existsSync(manifestPath)).toBe(true);

    if (!existsSync(manifestPath)) {
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      slice?: string;
      migration?: string;
      table_read_authority_migration?: string;
      tables?: Array<{
        schema?: string;
        name?: string;
        owner?: string;
        rls_enabled?: boolean;
        force_rls?: boolean;
        allowed_acl?: Array<{
          principal?: string;
          privilege?: string;
          grantable?: boolean;
        }>;
        policies?: Array<{
          name?: string;
          command?: string;
          roles?: string[];
          permissive?: string;
          using?: string;
          check?: string;
        }>;
      }>;
      functions?: Array<{
        signature?: string;
        control_class?: string;
        effect?: string;
        exposure?: string;
        allowed_principals?: string[];
        security_mode?: string;
        safe_search_path?: string[];
        replaces_baseline?: boolean;
      }>;
    };
    const validator = readFileSync(
      "scripts/validate-security-function-authorization.mjs",
      "utf8",
    );

    expect(manifest.slice).toBe("recipe-snapshot-authority-foundation");
    expect(manifest.migration).toBe(
      "supabase/migrations/20260729170500_recipe_snapshot_authority_foundation.sql",
    );
    expect(manifest.table_read_authority_migration).toBe(
      "supabase/migrations/20260802120000_recipe_snapshot_consumer_read_authority.sql",
    );
    expect(manifest.tables).toEqual([
      expect.objectContaining({
        schema: "public",
        name: "recipe_content_snapshots",
        owner: "postgres",
        rls_enabled: true,
        force_rls: false,
        allowed_acl: [
          {
            principal: "authenticated",
            privilege: "SELECT",
            grantable: false,
          },
          {
            principal: "service_role",
            privilege: "SELECT",
            grantable: false,
          },
        ],
        policies: [expect.objectContaining({
          name: "recipe_content_snapshots_authenticated_read",
          command: "SELECT",
          roles: ["authenticated"],
          permissive: "PERMISSIVE",
          using: "owner_user_id is null or auth.uid() = owner_user_id",
          check: "",
        })],
      }),
      expect.objectContaining({
        schema: "public",
        name: "recipe_nutrition_snapshots",
        owner: "postgres",
        rls_enabled: true,
        force_rls: false,
      }),
    ]);
    expect(manifest.functions?.length ?? 0).toBeGreaterThan(0);
    expect(
      manifest.functions?.find(
        (entry) => entry.signature === "public.delete_user_private_data(uuid)",
      ),
    ).toMatchObject({
      control_class: "application-controlled",
      effect: "mutation",
      exposure: "service-internal",
      allowed_principals: ["service_role"],
      security_mode: "definer",
      safe_search_path: ["pg_catalog", "public", "pg_temp"],
      replaces_baseline: true,
    });
    expect(
      manifest.functions?.find(
        (entry) =>
          entry.signature === "public.protect_recipe_nutrition_snapshot()",
      ),
    ).toMatchObject({
      effect: "trigger/internal",
      allowed_principals: [],
      security_mode: "invoker",
      replaces_baseline: true,
    });
    expect(validator).toContain(
      "recipe-snapshot-authority-security-function-authorization-manifest.json",
    );
    expect(validator).toContain(
      "20260729170500_recipe_snapshot_authority_foundation.sql",
    );
  });
});
