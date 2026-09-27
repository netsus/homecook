-- ONE-OFF OPERATION QUEUE ONLY. This is not a migration and must not run at deploy.
-- Before execution, verify the exact local production target and a restorable backup.
-- Run as the existing authorized database operator, with ON_ERROR_STOP enabled.
-- Never disable triggers/RLS or forge authenticated claims to make this file pass.
-- Any content, owner, schema or usage drift aborts the whole transaction.
-- Recipe components and consumed extraction provenance are preserved, not deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $cleanup$
DECLARE
  v_candidate_id constant uuid := '7b7b4f43-4a76-4b3e-b7ce-a5b4fb08d50b';
  v_keeper_id constant uuid := 'f7aa0961-519d-4f6c-b875-3806d396558a';
  v_video_id constant text := '_7TJTJJxID8';
  v_candidate public.recipes%rowtype;
  v_keeper public.recipes%rowtype;
  v_owners uuid[];
  v_owner uuid;
  v_cutover uuid;
  v_ingredient_hash text;
  v_keeper_ingredient_hash text;
  v_step_hash text;
  v_keeper_step_hash text;
  v_changed integer;
BEGIN
  -- Keep the existing cutover -> owner -> recipe lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  SELECT capability.current_cutover_attempt_id INTO v_cutover
  FROM public.account_generation_capability_state AS capability
  WHERE capability.singleton AND capability.state = 'generation_active'
  FOR KEY SHARE;
  IF v_cutover IS NULL THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_GENERATION_NOT_ACTIVE';
  END IF;

  SELECT array_agg(DISTINCT created_by ORDER BY created_by) INTO v_owners
  FROM public.recipes WHERE id IN (v_candidate_id, v_keeper_id);
  IF v_owners IS NULL OR array_position(v_owners, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_OWNER_DRIFT';
  END IF;
  FOREACH v_owner IN ARRAY v_owners LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('homecook-account-owner:' || v_owner::text, 0)
    );
    IF NOT EXISTS (
      SELECT 1 FROM public.user_account_lifecycles AS lifecycle
      JOIN auth.users AS auth_user ON auth_user.id = lifecycle.owner_uuid
        AND auth_user.created_at = lifecycle.auth_identity_created_at_snapshot
      WHERE lifecycle.owner_uuid = v_owner AND lifecycle.status = 'active'
        AND lifecycle.account_generation = (
          SELECT max(latest.account_generation)
          FROM public.user_account_lifecycles AS latest
          WHERE latest.owner_uuid = v_owner
        )
    ) THEN
      RAISE EXCEPTION 'TOFU_CLEANUP_OWNER_NOT_ACTIVE';
    END IF;
  END LOOP;

  -- FOR UPDATE also blocks new FK references until the decision is committed.
  PERFORM 1 FROM public.recipes
  WHERE id IN (v_candidate_id, v_keeper_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_candidate FROM public.recipes WHERE id = v_candidate_id;
  SELECT * INTO v_keeper FROM public.recipes WHERE id = v_keeper_id;
  IF v_candidate.id IS NULL OR v_keeper.id IS NULL
    OR v_candidate.deleted_at IS NOT NULL OR v_keeper.deleted_at IS NOT NULL
    OR v_candidate.title IS DISTINCT FROM '두부조림'
    OR v_keeper.title IS DISTINCT FROM '양념장이 맛있는 두부조림'
    OR v_candidate.source_type IS DISTINCT FROM 'youtube'
    OR v_keeper.source_type IS DISTINCT FROM 'youtube'
    OR v_candidate.visibility IS DISTINCT FROM 'public'
    OR v_keeper.visibility IS DISTINCT FROM 'public'
    OR v_candidate.base_servings IS DISTINCT FROM 2
    OR v_keeper.base_servings IS DISTINCT FROM 2
    OR v_candidate.revision IS DISTINCT FROM 1
    OR v_keeper.revision IS DISTINCT FROM 1
    OR v_candidate.description IS DISTINCT FROM v_keeper.description
    OR v_owners IS DISTINCT FROM (
      SELECT array_agg(DISTINCT created_by ORDER BY created_by)
      FROM public.recipes WHERE id IN (v_candidate_id, v_keeper_id)
    ) THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_RECIPE_DRIFT_OR_ALREADY_HIDDEN';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.recipes'::regclass AND NOT tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.recipes'::regclass AND NOT tgisinternal
        AND tgname = 'account_generation_legacy_mutation_fence'
        AND tgfoid = 'public.enforce_legacy_personal_mutation_fence()'::regprocedure
        AND tgenabled = 'O' AND tgtype = 31) THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_TRIGGER_DRIFT';
  END IF;

  -- Abort if a later schema adds any recipe-reference shape not reviewed here.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS referencing_table
      ON referencing_table.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = referencing_table.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.recipes'::regclass
      AND (
        namespace.nspname <> 'public'
        OR cardinality(constraint_row.conkey) <> 1
        OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = constraint_row.conrelid
            AND attribute.attnum = constraint_row.conkey[1]
            AND (
              (referencing_table.relname = 'recipes' AND attribute.attname = 'origin_recipe_id')
              OR (attribute.attname = 'recipe_id' AND referencing_table.relname = ANY (ARRAY[
                'cooking_session_meals', 'cooking_sessions', 'leftover_dishes', 'meals',
                'recipe_book_items', 'recipe_change_previews', 'recipe_content_snapshots',
                'recipe_ingredients', 'recipe_likes', 'recipe_nutrition_snapshots',
                'recipe_sources', 'recipe_steps', 'recipe_tags', 'shopping_list_recipes',
                'youtube_extraction_candidates', 'youtube_extraction_sessions'
              ]))
            )
        )
      )
  ) THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_REFERENCE_SCHEMA_DRIFT';
  END IF;

  IF EXISTS (SELECT 1 FROM public.recipe_book_items WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.meals WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.cooking_sessions WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.cooking_session_meals WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.leftover_dishes WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.shopping_list_recipes WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.recipe_likes WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.recipes WHERE origin_recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.recipe_change_previews WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.recipe_content_snapshots WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.recipe_nutrition_snapshots WHERE recipe_id = v_candidate_id)
    OR EXISTS (SELECT 1 FROM public.youtube_extraction_candidates WHERE recipe_id = v_candidate_id)
    OR v_candidate.save_count <> 0 OR v_candidate.plan_count <> 0
    OR v_candidate.cook_count <> 0 OR v_candidate.like_count <> 0 THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_CANDIDATE_HAS_REFERENCES';
  END IF;

  PERFORM 1 FROM public.recipe_sources
  WHERE recipe_id IN (v_candidate_id, v_keeper_id) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.recipe_sources
      WHERE recipe_id IN (v_candidate_id, v_keeper_id)) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.recipe_sources
      WHERE recipe_id = v_candidate_id AND youtube_video_id = v_video_id
        AND youtube_url = 'https://www.youtube.com/watch?v=_7TJTJJxID8')
    OR NOT EXISTS (SELECT 1 FROM public.recipe_sources
      WHERE recipe_id = v_keeper_id AND youtube_video_id = v_video_id
        AND youtube_url = 'https://www.youtube.com/watch?v=_7TJTJJxID8') THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_SOURCE_DRIFT';
  END IF;

  PERFORM 1 FROM public.recipe_ingredients
  WHERE recipe_id IN (v_candidate_id, v_keeper_id) ORDER BY id FOR SHARE;
  SELECT md5(jsonb_agg(to_jsonb(ingredient) - 'id' - 'recipe_id'
    ORDER BY sort_order, ingredient_id)::text) INTO v_ingredient_hash
  FROM public.recipe_ingredients AS ingredient WHERE recipe_id = v_candidate_id
  HAVING count(*) = 13;
  SELECT md5(jsonb_agg(to_jsonb(ingredient) - 'id' - 'recipe_id'
    ORDER BY sort_order, ingredient_id)::text) INTO v_keeper_ingredient_hash
  FROM public.recipe_ingredients AS ingredient WHERE recipe_id = v_keeper_id
  HAVING count(*) = 13;
  IF v_ingredient_hash IS DISTINCT FROM 'd9b37c40a3cdda83159e7e3b38b38e9e'
    OR v_keeper_ingredient_hash IS DISTINCT FROM v_ingredient_hash THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_INGREDIENT_DRIFT';
  END IF;

  -- Steps differ in wording and in splitting onion/scallion preparation (10/11).
  -- Pin both reviewed versions instead of claiming byte-for-byte equivalence.
  PERFORM 1 FROM public.recipe_steps
  WHERE recipe_id IN (v_candidate_id, v_keeper_id) ORDER BY id FOR SHARE;
  SELECT md5(jsonb_agg(to_jsonb(step) - 'id' - 'recipe_id' ORDER BY step_number)::text)
    INTO v_step_hash FROM public.recipe_steps AS step WHERE recipe_id = v_candidate_id
    HAVING count(*) = 10;
  SELECT md5(jsonb_agg(to_jsonb(step) - 'id' - 'recipe_id' ORDER BY step_number)::text)
    INTO v_keeper_step_hash FROM public.recipe_steps AS step WHERE recipe_id = v_keeper_id
    HAVING count(*) = 11;
  IF v_step_hash IS DISTINCT FROM '73f5871a17aa6a51042b095a8e363f54'
    OR v_keeper_step_hash IS DISTINCT FROM 'c1fdf644e2ec688490b26dc83cc34875' THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_STEP_DRIFT';
  END IF;

  PERFORM 1 FROM public.youtube_extraction_sessions
  WHERE recipe_id = v_candidate_id ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.youtube_extraction_sessions
      WHERE recipe_id = v_candidate_id) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.youtube_extraction_sessions
      WHERE recipe_id = v_candidate_id AND status = 'consumed'
        AND consumed_at IS NOT NULL AND youtube_video_id = v_video_id) THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_EXTRACTION_PROVENANCE_DRIFT';
  END IF;

  -- Reuse the existing approved curation writer; do not alter ACLs or triggers.
  IF EXISTS (SELECT 1 FROM public.account_generation_cutover_attempts
      WHERE id = v_cutover AND result_json ? '_internal_generation_writer_txid') THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_WRITER_ALREADY_IN_USE';
  END IF;
  PERFORM public.set_account_generation_internal_writer_marker(v_cutover, true);
  UPDATE public.recipes
  SET deleted_at = clock_timestamp(), updated_at = clock_timestamp(), revision = revision + 1
  WHERE id = v_candidate_id AND deleted_at IS NULL AND revision = v_candidate.revision;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_AFFECTED_ROW_MISMATCH';
  END IF;
  PERFORM public.set_account_generation_internal_writer_marker(v_cutover, false);

  IF (SELECT to_jsonb(recipe) FROM public.recipes AS recipe WHERE id = v_keeper_id)
       IS DISTINCT FROM to_jsonb(v_keeper)
    OR (SELECT to_jsonb(recipe) - 'deleted_at' - 'updated_at' - 'revision'
        FROM public.recipes AS recipe WHERE id = v_candidate_id)
       IS DISTINCT FROM (to_jsonb(v_candidate) - 'deleted_at' - 'updated_at' - 'revision') THEN
    RAISE EXCEPTION 'TOFU_CLEANUP_UNEXPECTED_RECIPE_CHANGE';
  END IF;
  RAISE NOTICE 'Duplicate tofu recipe hidden; keeper and all content/history rows preserved.';
END;
$cleanup$;
COMMIT;
