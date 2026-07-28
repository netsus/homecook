import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RUNNER_PATH = path.join(
  process.cwd(),
  "scripts/run-recipe-visibility-read-hardening-postgres-integration.mjs",
);
const INTEGRATION_TEST_PATH = path.join(
  process.cwd(),
  "tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
);

describe("recipe visibility PostgreSQL gate", () => {
  it("has a non-skippable isolated PostgreSQL runner wired to the package script", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(
      packageJson.scripts?.["test:recipe-visibility-read-hardening:postgres"],
    ).toBe(
      "node scripts/run-recipe-visibility-read-hardening-postgres-integration.mjs",
    );
    expect(existsSync(RUNNER_PATH)).toBe(true);
    expect(existsSync(INTEGRATION_TEST_PATH)).toBe(true);

    if (!existsSync(RUNNER_PATH)) {
      return;
    }

    const runner = readFileSync(RUNNER_PATH, "utf8");
    expect(runner).toContain("POSTGRES_RUNTIME_UNAVAILABLE");
    expect(runner).toContain("mkdtempSync");
    expect(runner).toContain(
      "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724110000_recipe_managed_image_registry_foundation.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724140000_recipe_image_private_storage_boundary.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724150000_recipe_image_upload_compensation.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724200000_recipe_image_stale_scanner_cas.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724210000_recipe_image_terminal_tombstone_scan.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724250000_recipe_image_auth_deletion_readiness_authority.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724260000_recipe_image_auth_deletion_claim_authority.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724270000_recipe_image_auth_deletion_finalize_authority.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260724280000_recipe_image_auth_deletion_candidate_authority.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260725170000_recipe_image_read_projection_authority.sql",
    );
    expect(runner).toContain(
      "supabase/migrations/20260725180000_recipe_book_image_read_projection_authority.sql",
    );
    expect(runner).toContain(
      "create or replace function public.claim_auth_identity_deletion_outbox",
    );
    expect(runner).toContain(
      "create or replace function public.finalize_auth_identity_deletion_outbox",
    );
    expect(runner).toContain("create policy recipe_images_public_read");
    expect(runner).toContain("create policy recipe_images_insert_own");
    expect(runner).toContain("create policy recipe_images_update_own");
    expect(runner).toContain("create policy recipe_images_delete_own");
    expect(runner).toContain("for (const migrationPath of MIGRATION_PATHS)");
    expect(runner).toContain(
      "tests/recipe-visibility-read-hardening-postgres.integration.test.ts",
    );
    expect(runner).toContain("rmSync(root, { recursive: true, force: true })");
  });
});
