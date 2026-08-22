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
].join(path.delimiter);
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION =
  "supabase/migrations/20260822170000_personal_recipe_customization_write_core_derived_create.sql";
process.env.HOMECOOK_RECIPE_SNAPSHOT_POST_TARGET_MIGRATIONS = [
  "supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql",
  "supabase/migrations/20260803100000_recipe_future_scoped_internal_rpc_clients.sql",
  "supabase/migrations/20260803101000_recipe_content_snapshot_future_propagation.sql",
  "supabase/migrations/20260804100000_recipe_snapshot_entrypoint_projection.sql",
  "supabase/migrations/20260809100000_full_local_session_refresh_authority.sql",
  "supabase/migrations/20260809110000_full_local_request_transaction_and_youtube_scope.sql",
  "supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql",
  "supabase/migrations/20260811120000_full_local_session_observability.sql",
  "supabase/migrations/20260812143000_full_local_session_superseded_token_window.sql",
  "supabase/migrations/20260820120000_full_local_session_bounded_token_overlap.sql",
  "supabase/migrations/20260822173000_recipe_snapshot_public_fork_context.sql",
].join(path.delimiter);
process.env.HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_INTEGRATION_TEST =
  "tests/personal-recipe-customization-write-core-postgres.integration.test.ts";
process.env.HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS = "1";
process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS = "1";
process.env.HOMECOOK_COOKED_BATCH_SECURITY_FUNCTIONS = "1";

await import("./run-recipe-snapshot-authority-postgres-integration.mjs");
