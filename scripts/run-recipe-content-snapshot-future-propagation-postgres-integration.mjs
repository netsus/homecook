#!/usr/bin/env node

import path from "node:path";
import { readdirSync } from "node:fs";

const migrationDirectory = path.join(process.cwd(), "supabase/migrations");
const targetMigrationName = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
  .sort()
  .at(-1);

if (!targetMigrationName) {
  throw new Error(
    "RED: recipe content snapshot future propagation migration is not implemented",
  );
}

const targetMigration = path.join("supabase/migrations", targetMigrationName);

process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_MIGRATIONS = [
  "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
  "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql",
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
  "supabase/migrations/20260724180000_recipe_image_attach_cas.sql",
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql",
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql",
].join(path.delimiter);
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION = targetMigration;
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_INTEGRATION_TEST =
  "tests/recipe-content-snapshot-future-propagation-postgres.integration.test.ts";
process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS = "1";

await import("./run-recipe-snapshot-authority-postgres-integration.mjs");
