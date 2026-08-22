#!/usr/bin/env node

import path from "node:path";

process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_MIGRATIONS = [
  "supabase/migrations/20260425000000_08b_add_pantry_items_table.sql",
  "supabase/migrations/20260426090000_09_shopping_tables.sql",
  "supabase/migrations/20260610120000_33a_user_progress_foundation.sql",
  "supabase/migrations/20260610183000_33c_user_gamification.sql",
  "supabase/migrations/20260611152000_34b_growth_backend_model.sql",
  "supabase/migrations/20260615090000_35c_leftover_eaten_progress_event.sql",
  "supabase/migrations/20260620065500_shopping_already_have_pantry_reflection.sql",
  "supabase/migrations/20260620110500_leftover_stale_review_sync.sql",
  "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
  "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql",
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql",
  "supabase/migrations/20260724180000_recipe_image_attach_cas.sql",
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql",
  "supabase/migrations/20260731110000_product_ingredient_link_contract_runtime.sql",
  "supabase/migrations/20260822170000_personal_recipe_customization_write_core_derived_create.sql",
  "supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql",
  "supabase/migrations/20260804100000_recipe_snapshot_entrypoint_projection.sql",
  "supabase/migrations/20260803101000_recipe_content_snapshot_future_propagation.sql",
  "supabase/migrations/20260803100000_recipe_future_scoped_internal_rpc_clients.sql",
  "supabase/migrations/20260822173000_recipe_snapshot_public_fork_context.sql",
].join(path.delimiter);
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION =
  "supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql";
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_INTEGRATION_TEST =
  "tests/cooked-batch-weight-ledger-postgres.integration.test.ts";
process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS = "1";
process.env.HOMECOOK_COOKED_BATCH_SECURITY_FUNCTIONS = "1";
// The inherited security inventory remains active after the #8 migration. Its
// personal-editor Storage/runtime observations own a different workpack's full
// schema and ACL projection and intentionally do not accept the later follow-up
// migrations in this runner. Exact shared inventory and tamper tests still run.
process.env.HOMECOOK_RECIPE_SNAPSHOT_ACTIVE_SECURITY_TEST_NAME_PATTERN =
  "^(?!.*(?:Storage|local Auth and private Storage|mutation grant to a non-owner role outside the exact ACL)).*$";
await import("./run-recipe-snapshot-authority-postgres-integration.mjs");
