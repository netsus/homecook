import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const enabled = Boolean(databaseUrl && projectId);
const container = `supabase_db_${projectId}`;

const ownerId = "7c000000-0000-4000-8000-000000000001";
const viewerId = "7c000000-0000-4000-8000-00000000000a";
const savedId = "7c000000-0000-4000-8000-000000000002";
const extractionId = "7c000000-0000-4000-8000-000000000003";
const resolvedRowId = "7c000000-0000-4000-8000-000000000004";
const resolvedSourceId = "7c000000-0000-4000-8000-000000000005";
const unresolvedSourceId = "7c000000-0000-4000-8000-000000000006";

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-Atq",
    "-v",
    "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000 });

  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe.skipIf(!enabled)("YouTube saved recipe canonical bridge in PostgreSQL", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(
      /^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u,
    );
  });

  it("creates, publicly projects, updates, and snapshots one canonical recipe", () => {
    const result = psql(`
      begin;
      set local session_replication_role = replica;
      insert into auth.users (id, created_at, email)
      values
        ('${ownerId}', '2026-10-12T00:00:00Z', 'youtube-bridge@example.invalid'),
        ('${viewerId}', '2026-10-12T00:00:00Z', 'youtube-viewer@example.invalid');
      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${ownerId}', '유튜브 브리지 검증', 'google', 'youtube-bridge'),
        ('${viewerId}', '공개 레시피 플래너 검증', 'google', 'youtube-viewer');
      set local session_replication_role = origin;

      insert into public.tags (
        normalized_key, label, slug, kind, is_system, theme_eligible
      ) values (
        '간단요리', '간단요리', 'easy', 'semantic', true, true
      ) on conflict (normalized_key) do nothing;

      insert into public.youtube_saved_recipe_results (
        id, owner_user_id, account_generation, extraction_session_id,
        source_snapshot_json, editable_content_json, editable_content_hash,
        revision, created_at, updated_at
      ) values (
        '${savedId}', '${ownerId}', 1, '${extractionId}',
        jsonb_build_object(
          'youtube_url', 'https://www.youtube.com/watch?v=bridge-test',
          'youtube_video_id', 'bridge-test',
          'thumbnail_url', 'https://example.invalid/thumb.jpg',
          'extraction_methods', jsonb_build_array('description'),
          'extraction_meta_json', jsonb_build_object('provider', 'isolated-test'),
          'draft_json', jsonb_build_object('ingredients', jsonb_build_array(
            jsonb_build_object(
              'draft_ingredient_id', '${resolvedSourceId}',
              'standard_name', '양파',
              'resolution_status', 'resolved',
              'ingredient_id', (
                select ingredient.id from public.ingredients as ingredient
                where ingredient.standard_name = '양파' limit 1
              )
            ),
            jsonb_build_object(
              'draft_ingredient_id', '${unresolvedSourceId}',
              'standard_name', '검증용 미해결 재료',
              'resolution_status', 'unresolved'
            )
          ))
        ),
        jsonb_build_object(
          'title', '브리지 레시피',
          'base_servings', 2,
          'tags', jsonb_build_array('간단요리'),
          'ingredients', jsonb_build_array(
            jsonb_build_object(
              'row_id', '${resolvedRowId}',
              'source_draft_ingredient_id', '${resolvedSourceId}',
              'standard_name', '양파',
              'quantity_mode', 'quantity',
              'amount', 1,
              'unit', '개',
              'display_text', '양파 1개',
              'component_label', null
            ),
            jsonb_build_object(
              -- Deliberately collide the editable row ID with a real catalog
              -- UUID. The snapshot must still use a non-catalog identity.
              'row_id', (
                select ingredient.id from public.ingredients as ingredient
                where ingredient.standard_name = '양파' limit 1
              ),
              'source_draft_ingredient_id', '${unresolvedSourceId}',
              'standard_name', '검증용 미해결 재료',
              'quantity_mode', 'unknown',
              'amount', null,
              'unit', null,
              'display_text', '검증용 미해결 재료 약간',
              'component_label', null
            )
          ),
          'steps', jsonb_build_array(jsonb_build_object(
            'row_id', '7c000000-0000-4000-8000-000000000007',
            'source_step_index', 0,
            'instruction', '재료를 섞는다.',
            'component_label', null,
            'duration_text', null
          ))
        ),
        repeat('0', 64), 1,
        '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z'
      );

      do $bridge$
      declare
        v_saved public.youtube_saved_recipe_results%rowtype;
        v_recipe public.recipes%rowtype;
        v_source public.recipe_sources%rowtype;
        v_snapshot record;
        v_unresolved uuid;
        v_cutover_attempt_id uuid;
        v_pinned_snapshot_id uuid;
        v_viewer_snapshot_id uuid;
        v_public_detail jsonb;
      begin
        select * into strict v_saved
        from public.youtube_saved_recipe_results where id = '${savedId}';
        select * into strict v_recipe
        from public.recipes where id = v_saved.canonical_recipe_id;
        select * into strict v_source
        from public.recipe_sources where recipe_id = v_recipe.id;

        if v_recipe.created_by <> '${ownerId}'::uuid
          or v_recipe.visibility <> 'public'
          or v_recipe.source_type <> 'youtube'
          or v_recipe.title <> '브리지 레시피'
          or v_source.extraction_meta_json <> '{"youtube_saved_canonical_bridge":true}'::jsonb
          or v_source.extraction_meta_json ? 'youtube_saved_draft_id' then
          raise exception 'CANONICAL_BRIDGE_MISMATCH';
        end if;
        if not exists (
          select 1
          from public.recipe_tags as recipe_tag
          join public.tags as tag on tag.id = recipe_tag.tag_id
          where recipe_tag.recipe_id = v_recipe.id
            and tag.normalized_key = '간단요리'
            and recipe_tag.visibility = 'public'
            and recipe_tag.review_status = 'approved'
        ) or not exists (
          select 1
          from public.find_recipe_ids_by_public_tags('간단요리', null) as found
          where found.recipe_id = v_recipe.id
        ) then
          raise exception 'PUBLIC_TAG_SEARCH_MISMATCH';
        end if;

        select * into strict v_snapshot
        from public.build_recipe_content_snapshot_input(v_recipe.id);
        if jsonb_array_length(v_snapshot.ingredients_json) <> 2
          or v_snapshot.ingredients_json #>> '{0,ingredient_id}' <> (
            select ingredient.id::text from public.ingredients as ingredient
            where ingredient.standard_name = '양파' limit 1
          )
          or v_snapshot.ingredients_json #>> '{1,catalog_resolution_status}' <> 'unresolved'
          or v_snapshot.steps_json #>> '{0,instruction}' <> '재료를 섞는다.' then
          raise exception 'SAVED_SNAPSHOT_MISMATCH ingredients=% steps=%',
            v_snapshot.ingredients_json, v_snapshot.steps_json;
        end if;
        v_unresolved := (v_snapshot.ingredients_json #>> '{1,ingredient_id}')::uuid;
        if v_unresolved = (
            select ingredient.id from public.ingredients as ingredient
            where ingredient.standard_name = '양파' limit 1
          )
          or exists (select 1 from public.ingredients where id = v_unresolved) then
          raise exception 'UNRESOLVED_ID_PROMOTED_TO_CATALOG';
        end if;

        perform set_config(
          'request.headers',
          '{"x-homecook-internal-scope":"recipe-future-propagation"}',
          true
        );
        perform set_config('request.method', 'POST', true);
        perform set_config(
          'request.path',
          '/rpc/read_public_youtube_saved_recipe_detail',
          true
        );
        v_public_detail := public.read_public_youtube_saved_recipe_detail(v_recipe.id);
        if jsonb_array_length(v_public_detail -> 'ingredients') <> 2
          or v_public_detail #>> '{ingredients,0,standard_name}' <> '양파'
          or v_public_detail #>> '{steps,0,instruction}' <> '재료를 섞는다.'
          or (v_public_detail -> 'ingredients' -> 1) ? 'catalog_resolution_status'
          or (v_public_detail -> 'ingredients' -> 0) ? 'food_product_id'
          or v_public_detail ? 'owner_user_id'
          or v_public_detail ? 'draft_id'
          or v_public_detail ? 'source' then
          raise exception 'PUBLIC_DETAIL_PROJECTION_MISMATCH detail=%', v_public_detail;
        end if;
        if has_function_privilege(
          'anon',
          'public.read_public_youtube_saved_recipe_detail(uuid)',
          'EXECUTE'
        ) or has_function_privilege(
          'authenticated',
          'public.read_public_youtube_saved_recipe_detail(uuid)',
          'EXECUTE'
        ) or not has_function_privilege(
          'service_role',
          'public.read_public_youtube_saved_recipe_detail(uuid)',
          'EXECUTE'
        ) then
          raise exception 'PUBLIC_DETAIL_RPC_ACL_MISMATCH';
        end if;

        select capability.current_cutover_attempt_id
          into strict v_cutover_attempt_id
        from public.account_generation_capability_state as capability
        where capability.singleton and capability.state = 'generation_active';
        perform public.set_account_generation_internal_writer_marker(
          v_cutover_attempt_id,
          true
        );
        insert into public.meal_plan_columns (id, user_id, name, sort_order)
        values
          (
            '7c000000-0000-4000-8000-000000000008',
            '${ownerId}',
            '저녁',
            1
          ),
          (
            '7c000000-0000-4000-8000-00000000000b',
            '${viewerId}',
            '점심',
            1
          );
        insert into public.meals (
          id, user_id, recipe_id, plan_date, column_id, planned_servings, status
        ) values
          (
            '7c000000-0000-4000-8000-000000000009',
            '${ownerId}',
            v_recipe.id,
            '2026-10-13',
            '7c000000-0000-4000-8000-000000000008',
            2,
            'registered'
          ),
          (
            '7c000000-0000-4000-8000-00000000000c',
            '${viewerId}',
            v_recipe.id,
            '2026-10-13',
            '7c000000-0000-4000-8000-00000000000b',
            1,
            'registered'
          );
        perform public.set_account_generation_internal_writer_marker(
          v_cutover_attempt_id,
          false
        );
        select meal.recipe_content_snapshot_id
          into strict v_pinned_snapshot_id
        from public.meals as meal
        where meal.id = '7c000000-0000-4000-8000-000000000009';
        if v_pinned_snapshot_id is null
          or not exists (
            select 1
            from public.recipe_content_snapshots as snapshot
            where snapshot.id = v_pinned_snapshot_id
              and snapshot.owner_user_id is null
              and jsonb_array_length(snapshot.ingredients_json) = 2
          ) then
          raise exception 'PLANNER_SNAPSHOT_NOT_PINNED';
        end if;
        select meal.recipe_content_snapshot_id
          into strict v_viewer_snapshot_id
        from public.meals as meal
        where meal.id = '7c000000-0000-4000-8000-00000000000c';
        if v_viewer_snapshot_id is null
          or not exists (
            select 1
            from public.recipe_content_snapshots as snapshot
            where snapshot.id = v_viewer_snapshot_id
              and snapshot.owner_user_id is null
              and jsonb_array_length(snapshot.ingredients_json) = 2
          ) then
          raise exception 'OTHER_USER_PLANNER_SNAPSHOT_NOT_PINNED';
        end if;

        update public.youtube_saved_recipe_results
        set editable_content_json = jsonb_set(
              editable_content_json, '{title}', to_jsonb('수정된 브리지 레시피'::text)
            ),
            revision = 2,
            updated_at = '2026-10-12T01:00:00Z'
        where id = '${savedId}';
        select * into strict v_recipe from public.recipes where id = v_recipe.id;
        if v_recipe.title <> '수정된 브리지 레시피' or v_recipe.revision <> 2 then
          raise exception 'CANONICAL_UPDATE_MISMATCH';
        end if;

        begin
          update public.youtube_saved_recipe_results
          set canonical_recipe_id = gen_random_uuid()
          where id = '${savedId}';
          raise exception 'CANONICAL_ID_MUTATION_ACCEPTED';
        exception when check_violation then
          null;
        end;
      end;
      $bridge$;

      select 'youtube_saved_recipe_canonical_bridge_ok';
      rollback;
    `);

    expect(result).toBe("youtube_saved_recipe_canonical_bridge_ok");
  });

  it("backfills four owner rows without requiring or inventing a privacy choice", () => {
    const result = psql(`
      begin;
      set local session_replication_role = replica;
      insert into auth.users (id, created_at, email)
      values (
        '7d000000-0000-4000-8000-000000000001',
        '2026-10-12T00:00:00Z',
        'youtube-four-row-owner@example.invalid'
      );
      insert into public.users (id, nickname, social_provider, social_id)
      values (
        '7d000000-0000-4000-8000-000000000001',
        '기존 4건 검증',
        'google',
        'youtube-four-row-owner'
      );
      alter table public.youtube_saved_recipe_results
        alter column canonical_recipe_id drop not null;
      insert into public.youtube_saved_recipe_results (
        id, owner_user_id, account_generation, extraction_session_id,
        source_snapshot_json, editable_content_json, editable_content_hash,
        revision, created_at, updated_at
      )
      select fixture.saved_id,
             '7d000000-0000-4000-8000-000000000001'::uuid,
             1,
             fixture.extraction_id,
             jsonb_build_object(
               'youtube_url', 'https://www.youtube.com/watch?v=' || fixture.video_id,
               'youtube_video_id', fixture.video_id,
               'thumbnail_url', null,
               'extraction_methods', jsonb_build_array('description'),
               'draft_json', jsonb_build_object('ingredients', '[]'::jsonb)
             ),
             jsonb_build_object(
               'title', fixture.title,
               'base_servings', 2,
               'tags', '[]'::jsonb,
               'ingredients', '[]'::jsonb,
               'steps', '[]'::jsonb
             ),
             repeat('0', 64),
             1,
             '2026-10-12T00:00:00Z'::timestamptz,
             '2026-10-12T00:00:00Z'::timestamptz
      from (values
        ('7d000000-0000-4000-8000-000000000002'::uuid, '7d000000-0000-4000-8000-000000000012'::uuid, 'fixture0001', '기존 유튜브 레시피 1'),
        ('7d000000-0000-4000-8000-000000000003'::uuid, '7d000000-0000-4000-8000-000000000013'::uuid, 'fixture0002', '기존 유튜브 레시피 2'),
        ('7d000000-0000-4000-8000-000000000004'::uuid, '7d000000-0000-4000-8000-000000000014'::uuid, 'fixture0003', '기존 유튜브 레시피 3'),
        ('7d000000-0000-4000-8000-000000000005'::uuid, '7d000000-0000-4000-8000-000000000015'::uuid, 'fixture0004', '기존 유튜브 레시피 4')
      ) as fixture(saved_id, extraction_id, video_id, title);
      set local session_replication_role = origin;

      update public.youtube_saved_recipe_results
      set editable_content_json = editable_content_json
      where owner_user_id = '7d000000-0000-4000-8000-000000000001';

      do $four_rows$
      declare
        v_count integer;
      begin
        select count(*) into strict v_count
        from public.youtube_saved_recipe_results as saved
        join public.recipes as recipe on recipe.id = saved.canonical_recipe_id
        join public.recipe_sources as source on source.recipe_id = recipe.id
        where saved.owner_user_id = '7d000000-0000-4000-8000-000000000001'
          and recipe.created_by = saved.owner_user_id
          and recipe.visibility = 'public'
          and recipe.source_type = 'youtube'
          and source.extraction_meta_json = '{"youtube_saved_canonical_bridge":true}'::jsonb
          and not (saved.source_snapshot_json ?| array['visibility', 'privacy', 'is_public'])
          and not (saved.editable_content_json ?| array['visibility', 'privacy', 'is_public']);
        if v_count <> 4 then
          raise exception 'FOUR_ROW_BACKFILL_MISMATCH count=%', v_count;
        end if;
        if exists (
          select 1 from public.youtube_saved_recipe_results
          where owner_user_id = '7d000000-0000-4000-8000-000000000001'
            and canonical_recipe_id is null
        ) then
          raise exception 'FOUR_ROW_BACKFILL_LEFT_NULL_CANONICAL_ID';
        end if;
      end;
      $four_rows$;

      select 'youtube_saved_recipe_four_row_backfill_ok';
      rollback;
    `);

    expect(result).toBe("youtube_saved_recipe_four_row_backfill_ok");
  });
});
