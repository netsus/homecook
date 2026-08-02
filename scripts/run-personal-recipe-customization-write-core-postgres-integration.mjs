#!/usr/bin/env node

import path from "node:path";

process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_MIGRATIONS = [
  "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
  "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql",
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
  "supabase/migrations/20260724180000_recipe_image_attach_cas.sql",
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql",
].join(path.delimiter);
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION =
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql";
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_INTEGRATION_TEST =
  "tests/personal-recipe-customization-write-core-postgres.integration.test.ts";

await import("./run-recipe-snapshot-authority-postgres-integration.mjs");
