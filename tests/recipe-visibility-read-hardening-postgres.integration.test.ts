import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_RECIPE_VISIBILITY_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_VISIBILITY_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_VISIBILITY_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_VISIBILITY_PGDATABASE ?? "";
const MIGRATION_PATH =
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql";
const MANAGED_IMAGE_REGISTRY_MIGRATION_PATH =
  "supabase/migrations/20260724110000_recipe_managed_image_registry_foundation.sql";
const IMAGE_CLEANUP_OUTBOX_MIGRATION_PATH =
  "supabase/migrations/20260724120000_recipe_image_cleanup_outbox.sql";
const IMAGE_UPLOAD_RESERVATION_MIGRATION_PATH =
  "supabase/migrations/20260724130000_recipe_image_upload_reservation.sql";

const OWNER_ACTIVE = "00000000-0000-4000-8000-000000000201";
const OWNER_QUARANTINED = "00000000-0000-4000-8000-000000000202";
const OWNER_REACTIVATED = "00000000-0000-4000-8000-000000000203";

const RECIPE_SYSTEM = "00000000-0000-4000-8000-000000000001";
const RECIPE_ACTIVE_PUBLIC = "00000000-0000-4000-8000-000000000002";
const RECIPE_ACTIVE_PRIVATE = "00000000-0000-4000-8000-000000000003";
const RECIPE_QUARANTINED = "00000000-0000-4000-8000-000000000004";
const RECIPE_DELETED = "00000000-0000-4000-8000-000000000005";
const RECIPE_REACTIVATED = "00000000-0000-4000-8000-000000000006";

const TAG_SYSTEM = "00000000-0000-4000-8000-000000000101";
const TAG_PRIVATE_ONLY = "00000000-0000-4000-8000-000000000102";
const TAG_PENDING = "00000000-0000-4000-8000-000000000103";

const IMAGE_PRIVATE = "00000000-0000-4000-8000-000000000301";
const IMAGE_PUBLIC_SHARED = "00000000-0000-4000-8000-000000000302";
const IMAGE_ATTEMPT_TOKEN = "00000000-0000-4000-8000-000000000303";
const IMAGE_REFERENCE = "00000000-0000-4000-8000-000000000304";
const IMAGE_CONSUMER = "00000000-0000-4000-8000-000000000305";
const IMAGE_CLEANUP_FOUND = "00000000-0000-4000-8000-000000000308";
const IMAGE_CLEANUP_ABSENT = "00000000-0000-4000-8000-000000000309";
const IMAGE_CLEANUP_LEASE_ONE = "00000000-0000-4000-8000-000000000310";
const IMAGE_CLEANUP_LEASE_TWO = "00000000-0000-4000-8000-000000000311";
const IMAGE_CLEANUP_LEASE_THREE = "00000000-0000-4000-8000-000000000312";
const IMAGE_CLEANUP_REFERENCE = "00000000-0000-4000-8000-000000000313";
const IMAGE_CLEANUP_CONSUMER = "00000000-0000-4000-8000-000000000314";
const IMAGE_UPLOAD_KEY = "00000000-0000-4000-8000-000000000315";
const IMAGE_UPLOAD_ISOLATION_KEY = "00000000-0000-4000-8000-000000000316";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
    },
  });
}

function psqlFileResult(filePath: string, user = "migration_runner") {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", user,
    "-d", database,
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-f", filePath,
  ], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
    },
  });
}

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function asRole(role: "anon" | "authenticated", sql: string, subject = "") {
  return psql(`
    begin;
    set local role ${role};
    select set_config('request.jwt.claim.sub', '${subject}', true);
    ${sql}
    rollback;
  `);
}

function asRoleResult(
  role: "anon" | "authenticated",
  sql: string,
  subject = "",
) {
  return psqlResult(`
    begin;
    set local role ${role};
    select set_config('request.jwt.claim.sub', '${subject}', true);
    ${sql}
    rollback;
  `);
}

describe.runIf(enabled)("recipe visibility isolated PostgreSQL boundary", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);

    psql(`
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        status
      ) values
        ('${OWNER_ACTIVE}', 1, 'active'),
        ('${OWNER_QUARANTINED}', 1, 'cleanup_pending'),
        ('${OWNER_REACTIVATED}', 1, 'complete'),
        ('${OWNER_REACTIVATED}', 2, 'active');

      insert into public.recipes (
        id,
        title,
        source_type,
        created_by,
        visibility,
        deleted_at
      ) values
        ('${RECIPE_SYSTEM}', 'system', 'system', null, 'public', null),
        ('${RECIPE_ACTIVE_PUBLIC}', 'active public', 'manual', '${OWNER_ACTIVE}', 'public', null),
        ('${RECIPE_ACTIVE_PRIVATE}', 'active private', 'manual', '${OWNER_ACTIVE}', 'private', null),
        ('${RECIPE_QUARANTINED}', 'quarantined', 'manual', '${OWNER_QUARANTINED}', 'public', null),
        ('${RECIPE_DELETED}', 'deleted', 'manual', '${OWNER_ACTIVE}', 'public', now()),
        ('${RECIPE_REACTIVATED}', 'reactivated', 'manual', '${OWNER_REACTIVATED}', 'public', null);

      insert into public.recipe_sources (id, recipe_id)
      select gen_random_uuid(), id from public.recipes;
      insert into public.recipe_ingredients (id, recipe_id, ingredient_id)
      select gen_random_uuid(), id, gen_random_uuid() from public.recipes;
      insert into public.recipe_steps (id, recipe_id, step_number, instruction)
      select gen_random_uuid(), id, 1, 'step' from public.recipes;
      insert into public.recipe_step_cooking_methods (
        id,
        step_id,
        method_id,
        position
      )
      select gen_random_uuid(), id, gen_random_uuid(), 1
      from public.recipe_steps;

      insert into public.tags (
        id,
        normalized_key,
        label,
        kind,
        is_system,
        theme_eligible,
        usage_count
      ) values
        ('${TAG_SYSTEM}', 'visible', 'Visible', 'semantic', true, true, 99),
        ('${TAG_PRIVATE_ONLY}', 'private-only', 'Private only', 'user', false, false, 99),
        ('${TAG_PENDING}', 'pending-only', 'Pending only', 'user', false, false, 99);

      insert into public.recipe_tags (
        recipe_id,
        tag_id,
        visibility,
        review_status,
        sort_order
      ) values
        ('${RECIPE_ACTIVE_PUBLIC}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_ACTIVE_PRIVATE}', '${TAG_PRIVATE_ONLY}', 'public', 'approved', 0),
        ('${RECIPE_ACTIVE_PRIVATE}', '${TAG_PENDING}', 'private', 'pending', 1),
        ('${RECIPE_QUARANTINED}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_DELETED}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_REACTIVATED}', '${TAG_SYSTEM}', 'public', 'approved', 0);

      set local role service_role;
      select public.set_recipe_tags(
        '${RECIPE_ACTIVE_PRIVATE}',
        jsonb_build_array(
          jsonb_build_object(
            'normalized_key', 'private-only',
            'label', 'Private only',
            'kind', 'user',
            'visibility', 'public',
            'review_status', 'approved'
          ),
          jsonb_build_object(
            'normalized_key', 'pending-only',
            'label', 'Pending only',
            'kind', 'user',
            'visibility', 'private',
            'review_status', 'pending'
          )
        ),
        '${OWNER_ACTIVE}',
        'user_reviewed'
      );
      reset role;
    `);
  });

  it("keeps the guard function under an exact no-login least-privilege owner", () => {
    expect(psql(`
      select pg_get_userbyid(proc.proowner)
      from pg_catalog.pg_proc as proc
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'recipe_visibility_guard'
        and proc.proname = 'is_owner_publicly_visible';
    `)).toBe("homecook_recipe_visibility_guard_owner");

    expect(psql(`
      select concat_ws(
        ':',
        rolcanlogin,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolinherit,
        rolreplication,
        rolbypassrls
      )
      from pg_catalog.pg_roles
      where rolname = 'homecook_recipe_visibility_guard_owner';
    `)).toBe("f:f:f:f:f:f:f");

    const membershipMode =
      Number(psql("select current_setting('server_version_num');")) >= 160000
        ? "SET"
        : "MEMBER";
    expect(psql(`
      select concat_ws(
        ':',
        pg_has_role(
          'migration_runner',
          'homecook_recipe_visibility_guard_owner',
          '${membershipMode}'
        ),
        pg_has_role(
          'migration_runner',
          'homecook_recipe_visibility_guard_owner',
          'USAGE'
        ),
        has_schema_privilege(
          'homecook_recipe_visibility_guard_owner',
          'recipe_visibility_guard',
          'CREATE'
        )
      );
    `)).toBe("f:f:f");

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'homecook_recipe_visibility_guard_owner',
          'public.user_account_lifecycles',
          'SELECT'
        ),
        has_table_privilege(
          'homecook_recipe_visibility_guard_owner',
          'public.user_account_lifecycles',
          'INSERT'
        ),
        has_function_privilege(
          'service_role',
          'recipe_visibility_guard.is_owner_publicly_visible(uuid)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.find_recipe_ids_by_public_tags(text,text)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_public_recipe_tags(text,text,boolean,integer)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_home_theme_recipes(integer,integer)',
          'EXECUTE'
        )
      );
    `)).toBe("t:f:f:f:f:f");
  });

  it("applies latest-generation visibility to anon and owner detail reads", () => {
    expect(asRole("anon", `
      select string_agg(id::text, ',' order by id)
      from public.recipes;
    `)).toBe([
      RECIPE_SYSTEM,
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("authenticated", `
      select string_agg(id::text, ',' order by id)
      from public.recipes;
    `, OWNER_ACTIVE)).toBe([
      RECIPE_SYSTEM,
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_ACTIVE_PRIVATE,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("authenticated", `
      select count(*)::text
      from public.recipes
      where created_by = '${OWNER_QUARANTINED}';
    `, OWNER_QUARANTINED)).toBe("0");
  });

  it("forces public tag intents private for private or deleted parents", () => {
    const writerResult = psqlResult(`
      begin;
      set local role service_role;
      select public.set_recipe_tags(
        '${RECIPE_DELETED}',
        jsonb_build_array(
          jsonb_build_object(
            'normalized_key', 'deleted-widen-attempt',
            'label', 'Deleted widen attempt',
            'kind', 'user',
            'visibility', 'public',
            'review_status', 'approved'
          )
        ),
        '${OWNER_ACTIVE}',
        'user_reviewed'
      );
      commit;
    `);

    expect(writerResult.status, writerResult.stderr).toBe(0);
    expect(psql(`
      select concat_ws(
        ':',
        (
          select visibility
          from public.recipe_tags
          where recipe_id = '${RECIPE_ACTIVE_PRIVATE}'
            and tag_id = '${TAG_PRIVATE_ONLY}'
        ),
        (
          select recipe_tag.visibility
          from public.recipe_tags as recipe_tag
          join public.tags as tag
            on tag.id = recipe_tag.tag_id
          where recipe_tag.recipe_id = '${RECIPE_DELETED}'
            and tag.normalized_key = 'deleted-widen-attempt'
        ),
        (
          select usage_count
          from public.tags
          where id = '${TAG_PRIVATE_ONLY}'
        )
      );
    `)).toBe("private:private:0");

    const pendingWriterResult = psqlResult(`
      begin;
      set local role service_role;
      select public.set_recipe_tags(
        '${RECIPE_ACTIVE_PUBLIC}',
        jsonb_build_array(
          jsonb_build_object(
            'normalized_key', 'pending-widen-attempt',
            'label', 'Pending widen attempt',
            'kind', 'user',
            'visibility', 'public',
            'review_status', 'pending'
          )
        ),
        '${OWNER_ACTIVE}',
        'user_reviewed'
      );
      commit;
    `);

    expect(pendingWriterResult.status, pendingWriterResult.stderr).toBe(0);
    expect(psql(`
      select recipe_tag.visibility
      from public.recipe_tags as recipe_tag
      join public.tags as tag
        on tag.id = recipe_tag.tag_id
      where recipe_tag.recipe_id = '${RECIPE_ACTIVE_PUBLIC}'
        and tag.normalized_key = 'pending-widen-attempt';
    `)).toBe("public_pending");

    const restoreWriterResult = psqlResult(`
      begin;
      set local role service_role;
      select public.set_recipe_tags(
        '${RECIPE_ACTIVE_PUBLIC}',
        jsonb_build_array(
          jsonb_build_object(
            'normalized_key', 'visible',
            'label', 'Visible',
            'kind', 'semantic',
            'is_system', true,
            'theme_eligible', true,
            'visibility', 'public',
            'review_status', 'approved'
          )
        ),
        null,
        'system_suggested'
      );
      commit;
    `);
    expect(restoreWriterResult.status, restoreWriterResult.stderr).toBe(0);

    const directWriteResult = psqlResult(`
      begin;
      set local role service_role;
      update public.recipe_tags
      set visibility = 'public'
      where recipe_id = '${RECIPE_ACTIVE_PRIVATE}';
      rollback;
    `);

    expect(directWriteResult.status).not.toBe(0);
    expect(directWriteResult.stderr).toContain(
      "permission denied for table recipe_tags",
    );
  });

  it("keeps direct child and association reads bounded by the same parent", () => {
    for (const table of [
      "recipe_sources",
      "recipe_ingredients",
      "recipe_steps",
      "recipe_step_cooking_methods",
    ]) {
      expect(asRole("anon", `
        select count(*)::text from public.${table};
      `)).toBe("3");
    }

    expect(asRole("anon", `
      select count(*)::text from public.recipe_tags;
    `)).toBe("2");
    expect(asRole("anon", `
      select count(*)::text
      from public.tags
      where normalized_key = 'private-only';
    `)).toBe("0");
  });

  it("keeps hidden tag labels and raw usage counts out of public projections", () => {
    expect(psql(`
      select array_to_string(tags, ',')
      from public.recipes
      where id = '${RECIPE_ACTIVE_PRIVATE}';
    `)).toBe("Private only");

    const rawCountRead = asRoleResult("anon", `
      select usage_count::text
      from public.tags
      where normalized_key = 'visible';
    `);
    expect(rawCountRead.status).not.toBe(0);
    expect(rawCountRead.stderr).toMatch(/permission denied/i);
  });

  it("computes public tag search, count, and themes from live visible parents", () => {
    expect(asRole("anon", `
      select string_agg(recipe_id::text, ',' order by recipe_id)
      from public.find_recipe_ids_by_public_tags(null, 'visible');
    `)).toBe([
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("anon", `
      select normalized_key || ':' || usage_count::text
      from public.list_public_recipe_tags(null, null, null, 30)
      where normalized_key = 'visible';
    `)).toBe("visible:2");

    expect(asRole("anon", `
      select string_agg(id::text, ',' order by id)
      from public.list_home_theme_recipes(8, 10);
    `)).toBe([
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));
  });

  it("keeps managed image registry tables dark-shipped behind RLS and table ACLs", () => {
    expect(psql(`
      select string_agg(
        table_name || ':' || row_security,
        ','
        order by table_name
      )
      from (
        select
          class.relname as table_name,
          class.relrowsecurity::text as row_security
        from pg_catalog.pg_class as class
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relname in (
            'recipe_image_objects',
            'recipe_image_object_references'
          )
      ) as registry_tables;
    `)).toBe(
      "recipe_image_object_references:true,recipe_image_objects:true",
    );

    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of [
        "recipe_image_objects",
        "recipe_image_object_references",
      ]) {
        expect(psql(`
          select concat_ws(
            ':',
            has_table_privilege('${role}', 'public.${table}', 'SELECT'),
            has_table_privilege('${role}', 'public.${table}', 'INSERT'),
            has_table_privilege('${role}', 'public.${table}', 'UPDATE'),
            has_table_privilege('${role}', 'public.${table}', 'DELETE')
          );
        `)).toBe("f:f:f:f");
      }
    }
  });

  it("enforces private generation ownership and owner-neutral shared paths", () => {
    expect(psqlResult(`
      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        upload_attempt_token,
        cleanup_generation,
        upload_lease_expires_at
      ) values (
        '${IMAGE_PRIVATE}',
        '${OWNER_ACTIVE}',
        1,
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/${IMAGE_PRIVATE}.webp',
        'private',
        'pending_upload',
        '${IMAGE_ATTEMPT_TOKEN}',
        0,
        now() + interval '5 minutes'
      );

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        raw_sha256,
        byte_size,
        actual_mime_type,
        visibility,
        state,
        cleanup_generation
      ) values (
        '${IMAGE_PUBLIC_SHARED}',
        null,
        null,
        'recipe-images',
        'shared/${IMAGE_PUBLIC_SHARED}.webp',
        repeat('a', 64),
        3,
        'image/webp',
        'public_shared',
        'attached_public_shared',
        0
      );
    `).status).toBe(0);

    expect(psql(`
      select string_agg(
        id::text || ':' || coalesce(owner_uuid::text, 'neutral')
          || ':' || coalesce(account_generation::text, 'neutral')
          || ':' || visibility || ':' || state,
        ','
        order by id
      )
      from public.recipe_image_objects
      where id in ('${IMAGE_PRIVATE}', '${IMAGE_PUBLIC_SHARED}');
    `)).toBe([
      `${IMAGE_PRIVATE}:${OWNER_ACTIVE}:1:private:pending_upload`,
      `${IMAGE_PUBLIC_SHARED}:neutral:neutral:public_shared:attached_public_shared`,
    ].join(","));

    for (const invalidInsert of [
      `
        insert into public.recipe_image_objects (
          owner_uuid, account_generation, bucket_id, object_path,
          visibility, state, upload_attempt_token, upload_lease_expires_at
        ) values (
          null, null, 'recipe-images-private',
          'missing-owner.webp', 'private', 'pending_upload',
          gen_random_uuid(), now() + interval '5 minutes'
        );
      `,
      `
        insert into public.recipe_image_objects (
          owner_uuid, account_generation, bucket_id, object_path,
          raw_sha256, byte_size, actual_mime_type, visibility, state
        ) values (
          '${OWNER_ACTIVE}', 1, 'recipe-images',
          'shared/' || gen_random_uuid()::text || '.webp',
          repeat('b', 64), 3, 'image/webp',
          'public_shared', 'attached_public_shared'
        );
      `,
      `
        insert into public.recipe_image_objects (
          bucket_id, object_path, raw_sha256, byte_size,
          actual_mime_type, visibility, state
        ) values (
          'recipe-images-private',
          'shared/' || gen_random_uuid()::text || '.webp',
          repeat('c', 64), 3, 'image/webp',
          'public_shared', 'attached_public_shared'
        );
      `,
      `
        insert into public.recipe_image_objects (
          id, bucket_id, object_path, visibility, state, cleanup_generation
        ) values (
          '00000000-0000-4000-8000-000000000306',
          'recipe-images',
          'shared/00000000-0000-4000-8000-000000000306.webp',
          'public_shared',
          'cleanup_pending',
          1
        );
      `,
      `
        insert into public.recipe_image_objects (
          id, bucket_id, object_path, visibility, state,
          upload_attempt_token, upload_lease_expires_at
        ) values (
          '00000000-0000-4000-8000-000000000307',
          'recipe-images',
          'shared/00000000-0000-4000-8000-000000000307.webp',
          'public_shared',
          'pending_upload',
          gen_random_uuid(),
          now() + interval '5 minutes'
        );
      `,
    ]) {
      const result = psqlResult(`begin; ${invalidInsert} rollback;`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/violates check constraint/i);
    }
  });

  it("denies direct registry mutation and keeps references unique and restrictive", () => {
    for (const role of ["authenticated", "service_role"]) {
      const directMutation = psqlResult(`
        begin;
        set local role ${role};
        insert into public.recipe_image_objects (
          bucket_id,
          object_path,
          visibility,
          state,
          upload_attempt_token,
          upload_lease_expires_at
        ) values (
          'recipe-images',
          'shared/' || gen_random_uuid()::text || '.webp',
          'public_shared',
          'pending_upload',
          gen_random_uuid(),
          now() + interval '5 minutes'
        );
        rollback;
      `);

      expect(directMutation.status).not.toBe(0);
      expect(directMutation.stderr).toMatch(/permission denied/i);
    }

    expect(psqlResult(`
      insert into public.recipe_image_object_references (
        id,
        image_object_id,
        reference_type,
        consumer_id
      ) values (
        '${IMAGE_REFERENCE}',
        '${IMAGE_PUBLIC_SHARED}',
        'recipe_thumbnail',
        '${IMAGE_CONSUMER}'
      );
    `).status).toBe(0);

    const duplicateConsumer = psqlResult(`
      insert into public.recipe_image_object_references (
        image_object_id,
        reference_type,
        consumer_id
      ) values (
        '${IMAGE_PRIVATE}',
        'recipe_thumbnail',
        '${IMAGE_CONSUMER}'
      );
    `);
    expect(duplicateConsumer.status).not.toBe(0);
    expect(duplicateConsumer.stderr).toMatch(/duplicate key value/i);

    const referencedDelete = psqlResult(`
      delete from public.recipe_image_objects
      where id = '${IMAGE_PUBLIC_SHARED}';
    `);
    expect(referencedDelete.status).not.toBe(0);
    expect(referencedDelete.stderr).toMatch(/foreign key constraint/i);
  });

  it("replays the managed image registry migration without widening ACLs", () => {
    const replay = psqlFileResult(MANAGED_IMAGE_REGISTRY_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'service_role',
          'public.recipe_image_objects',
          'INSERT'
        ),
        has_table_privilege(
          'service_role',
          'public.recipe_image_object_references',
          'INSERT'
        ),
        (
          select count(*)::text
          from public.recipe_image_objects
          where id in ('${IMAGE_PRIVATE}', '${IMAGE_PUBLIC_SHARED}')
        ),
        (
          select count(*)::text
          from public.recipe_image_object_references
          where id = '${IMAGE_REFERENCE}'
        )
      );
    `)).toBe("f:f:2:1");
  });

  it("keeps first-404 cleanup out of normal claims until an ordered recheck", () => {
    expect(psqlResult(`
      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation
      ) values
        (
          '${IMAGE_CLEANUP_FOUND}',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/${IMAGE_CLEANUP_FOUND}.webp',
          'private',
          'cleanup_pending',
          1
        ),
        (
          '${IMAGE_CLEANUP_ABSENT}',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/${IMAGE_CLEANUP_ABSENT}.webp',
          'private',
          'cleanup_pending',
          1
        );
    `).status).toBe(0);

    const firstOutboxId = psql(`
      begin;
      set local role service_role;
      select public.enqueue_recipe_image_cleanup(
        '${IMAGE_CLEANUP_FOUND}',
        '${OWNER_ACTIVE}',
        1,
        1,
        'stale_upload'
      );
      commit;
    `);

    expect(psql(`
      begin;
      set local role service_role;
      select count(*)
      from public.claim_recipe_image_cleanup(
        1,
        '${IMAGE_CLEANUP_LEASE_ONE}',
        '2030-07-24T00:00:00Z'
      );
      commit;
    `)).toBe("1");

    expect(psql(`
      begin;
      set local role service_role;
      select public.authorize_recipe_image_cleanup_delete(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '${IMAGE_CLEANUP_LEASE_ONE}',
        '2030-07-24T00:00:30Z'
      );
      rollback;
    `)).toBe("t");

    expect(psqlResult(`
      insert into public.recipe_image_object_references (
        id,
        image_object_id,
        reference_type,
        consumer_id
      ) values (
        '${IMAGE_CLEANUP_REFERENCE}',
        '${IMAGE_CLEANUP_FOUND}',
        'recipe_thumbnail',
        '${IMAGE_CLEANUP_CONSUMER}'
      );
    `).status).toBe(0);

    expect(psql(`
      begin;
      set local role service_role;
      select public.authorize_recipe_image_cleanup_delete(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '${IMAGE_CLEANUP_LEASE_ONE}',
        '2030-07-24T00:00:30Z'
      );
      rollback;
    `)).toBe("f");

    expect(psqlResult(`
      delete from public.recipe_image_object_references
      where id = '${IMAGE_CLEANUP_REFERENCE}';
    `).status).toBe(0);

    expect(psql(`
      begin;
      set local role service_role;
      select public.observe_recipe_image_cleanup_not_found(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '${IMAGE_CLEANUP_LEASE_ONE}',
        '2030-07-24T00:01:00Z'
      );
      commit;
    `)).toBe("t");

    expect(psql(`
      select concat_ws(
        ':',
        outbox.state,
        outbox.lease_token is null,
        outbox.next_attempt_at = '2030-07-24T00:16:00Z'::timestamptz,
        object.state,
        object.not_found_observed_at = '2030-07-24T00:01:00Z'::timestamptz,
        object.late_upload_quarantine_until = '2030-07-24T00:16:00Z'::timestamptz
      )
      from public.storage_object_deletion_outbox as outbox
      join public.recipe_image_objects as object
        on object.bucket_id = outbox.bucket_id
       and object.object_path = outbox.object_path
      where outbox.id = '${firstOutboxId}';
    `)).toBe(
      "awaiting_not_found_recheck:t:t:not_found_observed:t:t",
    );

    expect(psql(`
      begin;
      set local role service_role;
      select count(*)
      from public.claim_recipe_image_cleanup(
        10,
        '${IMAGE_CLEANUP_LEASE_TWO}',
        '2030-07-24T00:02:00Z'
      )
      where outbox_id = '${firstOutboxId}';
      rollback;
    `)).toBe("0");

    expect(psql(`
      begin;
      set local role service_role;
      select public.recheck_recipe_image_cleanup_not_found(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        true,
        '2030-07-24T00:16:00Z'
      );
      commit;
    `)).toBe("pending");

    expect(psql(`
      select outbox.state || ':' || object.state
      from public.storage_object_deletion_outbox as outbox
      join public.recipe_image_objects as object
        on object.bucket_id = outbox.bucket_id
       and object.object_path = outbox.object_path
      where outbox.id = '${firstOutboxId}';
    `)).toBe("pending:cleanup_pending");

    expect(psql(`
      begin;
      set local role service_role;
      select count(*)
      from public.claim_recipe_image_cleanup(
        1,
        '${IMAGE_CLEANUP_LEASE_TWO}',
        '2030-07-24T00:16:00Z'
      )
      where outbox_id = '${firstOutboxId}';
      commit;
    `)).toBe("1");

    expect(psql(`
      begin;
      set local role service_role;
      select public.complete_recipe_image_cleanup_deleted(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '${IMAGE_CLEANUP_LEASE_TWO}',
        '2030-07-24T00:17:00Z'
      );
      commit;
    `)).toBe("t");

    expect(psql(`
      select outbox.state || ':' || outbox.terminal_result
        || ':' || object.state
      from public.storage_object_deletion_outbox as outbox
      join public.recipe_image_objects as object
        on object.bucket_id = outbox.bucket_id
       and object.object_path = outbox.object_path
      where outbox.id = '${firstOutboxId}';
    `)).toBe("succeeded:deleted:deleted");

    const secondOutboxId = psql(`
      begin;
      set local role service_role;
      select public.enqueue_recipe_image_cleanup(
        '${IMAGE_CLEANUP_ABSENT}',
        '${OWNER_ACTIVE}',
        1,
        1,
        'stale_upload'
      );
      commit;
    `);

    expect(psql(`
      begin;
      set local role service_role;
      select count(*)
      from public.claim_recipe_image_cleanup(
        1,
        '${IMAGE_CLEANUP_LEASE_THREE}',
        '2030-07-24T00:20:00Z'
      )
      where outbox_id = '${secondOutboxId}';
      commit;
    `)).toBe("1");

    expect(psql(`
      begin;
      set local role service_role;
      select public.observe_recipe_image_cleanup_not_found(
        '${secondOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '${IMAGE_CLEANUP_LEASE_THREE}',
        '2030-07-24T00:21:00Z'
      );
      commit;
    `)).toBe("t");

    expect(psql(`
      begin;
      set local role service_role;
      select public.recheck_recipe_image_cleanup_not_found(
        '${secondOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        false,
        '2030-07-24T00:36:00Z'
      );
      commit;
    `)).toBe("verified_not_found");

    expect(psql(`
      select outbox.state || ':' || outbox.terminal_result
        || ':' || object.state
      from public.storage_object_deletion_outbox as outbox
      join public.recipe_image_objects as object
        on object.bucket_id = outbox.bucket_id
       and object.object_path = outbox.object_path
      where outbox.id = '${secondOutboxId}';
    `)).toBe("succeeded:verified_not_found:verified_not_found");
  });

  it("fails cleanup lease and generation mismatches without mutation", () => {
    const outboxId = psql(`
      select id
      from public.storage_object_deletion_outbox
      where object_path = '${OWNER_ACTIVE}/1/${IMAGE_CLEANUP_FOUND}.webp';
    `);

    expect(psql(`
      begin;
      set local role service_role;
      select public.observe_recipe_image_cleanup_not_found(
        '${outboxId}',
        '${OWNER_ACTIVE}',
        2,
        1,
        '${IMAGE_CLEANUP_LEASE_THREE}',
        '2030-07-24T00:18:00Z'
      );
      rollback;
    `)).toBe("f");

    expect(psql(`
      select state || ':' || terminal_result
      from public.storage_object_deletion_outbox
      where id = '${outboxId}';
    `)).toBe("succeeded:deleted");
  });

  it("replays cleanup outbox DDL without granting direct mutation", () => {
    const replay = psqlFileResult(IMAGE_CLEANUP_OUTBOX_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'service_role',
          'public.storage_object_deletion_outbox',
          'INSERT'
        ),
        has_function_privilege(
          'authenticated',
          'public.claim_recipe_image_cleanup(integer,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.claim_recipe_image_cleanup(integer,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        (
          select count(*)::text
          from public.storage_object_deletion_outbox
          where terminal_result in ('deleted', 'verified_not_found')
        )
      );
    `)).toBe("f:f:t:2");
  });

  it("reserves, replays, takes over, finalizes, and releases one upload exactly once", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1,
          current_cutover_attempt_id =
            '00000000-0000-4000-8000-000000000399'
      where singleton;

      update public.user_account_lifecycles
      set auth_identity_created_at_snapshot = '2026-01-01T00:00:00Z'
      where owner_uuid = '${OWNER_ACTIVE}'
        and account_generation = 1;

      insert into public.user_session_generation_bindings (
        session_key_hash,
        hmac_key_version,
        owner_uuid,
        expected_account_generation,
        auth_identity_created_at_snapshot,
        revoked_at
      ) values (
        repeat('a', 64),
        1,
        '${OWNER_ACTIVE}',
        1,
        '2026-01-01T00:00:00Z',
        null
      )
      on conflict (hmac_key_version, session_key_hash)
      do update set revoked_at = null;

      set local role service_role;
      do $block$
      declare
        v_reserved jsonb;
        v_replay jsonb;
        v_takeover jsonb;
        v_finalized jsonb;
        v_object_id uuid;
        v_first_attempt uuid;
        v_takeover_attempt uuid;
      begin
        v_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_UPLOAD_KEY}',
          repeat('b', 64),
          repeat('c', 64),
          1024,
          'image/webp',
          'webp',
          '2030-07-24T01:00:00Z'
        );
        if v_reserved ->> 'outcome' <> 'reserved' then
          raise exception 'expected reserved outcome: %', v_reserved;
        end if;
        v_object_id := (v_reserved ->> 'object_id')::uuid;
        v_first_attempt := (v_reserved ->> 'attempt_token')::uuid;

        v_replay := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_UPLOAD_KEY}',
          repeat('b', 64),
          repeat('c', 64),
          1024,
          'image/webp',
          'webp',
          '2030-07-24T01:01:00Z'
        );
        if v_replay ->> 'outcome' <> 'live_replay'
          or (v_replay ->> 'object_id')::uuid <> v_object_id
          or (v_replay ->> 'attempt_token')::uuid <> v_first_attempt
          or (v_replay ->> 'retry_after_seconds')::integer <= 0 then
          raise exception 'live replay drift: %', v_replay;
        end if;

        begin
          perform public.finalize_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_UPLOAD_KEY}',
            v_first_attempt,
            0,
            '2030-07-24T01:05:01Z'
          );
          raise exception 'expired lease finalize unexpectedly succeeded';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        v_takeover := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_UPLOAD_KEY}',
          repeat('b', 64),
          repeat('c', 64),
          1024,
          'image/webp',
          'webp',
          '2030-07-24T01:06:00Z'
        );
        v_takeover_attempt := (v_takeover ->> 'attempt_token')::uuid;
        if v_takeover ->> 'outcome' <> 'takeover'
          or (v_takeover ->> 'object_id')::uuid <> v_object_id
          or v_takeover_attempt = v_first_attempt then
          raise exception 'takeover drift: %', v_takeover;
        end if;

        begin
          perform public.finalize_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_UPLOAD_KEY}',
            v_first_attempt,
            0,
            '2030-07-24T01:06:01Z'
          );
          raise exception 'stale finalize unexpectedly succeeded';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        v_finalized := public.finalize_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_UPLOAD_KEY}',
          v_takeover_attempt,
          0,
          '2030-07-24T01:06:02Z'
        );
        if v_finalized ->> 'state' <> 'uploaded_unlinked'
          or (v_finalized ->> 'object_id')::uuid <> v_object_id then
          raise exception 'finalize drift: %', v_finalized;
        end if;

        if public.release_recipe_image_upload_reservation(
          '${OWNER_ACTIVE}',
          1,
          v_object_id,
          '2030-07-24T01:06:03Z'
        ) then
          raise exception 'uploaded-unlinked reservation released too early';
        end if;

        reset role;
        update public.recipe_image_objects
        set state = 'attached_private',
            unlinked_cleanup_after = null
        where id = v_object_id
          and state = 'uploaded_unlinked';
        if not found then
          raise exception 'test attach transition did not win';
        end if;
        set local role service_role;

        if not public.release_recipe_image_upload_reservation(
          '${OWNER_ACTIVE}',
          1,
          v_object_id,
          '2030-07-24T01:06:04Z'
        ) then
          raise exception 'attached reservation release did not win';
        end if;
        if public.release_recipe_image_upload_reservation(
          '${OWNER_ACTIVE}',
          1,
          v_object_id,
          '2030-07-24T01:06:05Z'
        ) then
          raise exception 'quota release replay won twice';
        end if;
      end;
      $block$;

      reset role;

      do $block$
      declare
        v_active integer;
        v_requests integer;
      begin
        select
          counter.active_reservation_count,
          jsonb_array_length(counter.request_events)
        into v_active, v_requests
        from public.image_upload_quota_counters as counter
        where counter.owner_uuid = '${OWNER_ACTIVE}'
          and counter.account_generation = 1;

        if v_active <> 0 or v_requests <> 1 then
          raise exception 'quota replay/release drift: active %, requests %',
            v_active,
            v_requests;
        end if;
      end;
      $block$;

      rollback;
      select 'upload-cas-pass';
    `)).toBe("upload-cas-pass");
  });

  it("fails every pre-PUT quota boundary closed without charging the rejected attempt", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      update public.user_account_lifecycles
      set auth_identity_created_at_snapshot = '2026-01-01T00:00:00Z'
      where owner_uuid = '${OWNER_ACTIVE}'
        and account_generation = 1;

      insert into public.user_session_generation_bindings (
        session_key_hash,
        hmac_key_version,
        owner_uuid,
        expected_account_generation,
        auth_identity_created_at_snapshot,
        revoked_at
      ) values (
        repeat('a', 64),
        1,
        '${OWNER_ACTIVE}',
        1,
        '2026-01-01T00:00:00Z',
        null
      )
      on conflict (hmac_key_version, session_key_hash)
      do update set revoked_at = null;

      insert into public.image_upload_quota_counters (
        owner_uuid,
        account_generation
      ) values (
        '${OWNER_ACTIVE}',
        1
      );

      set local role service_role;
      do $block$
      declare
        v_result jsonb;
        v_key uuid;
        v_before_requests jsonb;
        v_before_bytes jsonb;
        v_before_active integer;
      begin
        reset role;
        update public.image_upload_quota_counters
        set request_events = (
              select jsonb_agg(
                jsonb_build_object(
                  'at',
                  '2030-07-24T01:00:00Z'::timestamptz
                )
              )
              from generate_series(1, 10)
            ),
            byte_events = '[]'::jsonb,
            active_reservation_count = 0
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;
        set local role service_role;

        foreach v_key in array array[
          '00000000-0000-4000-8000-000000000401'::uuid,
          '00000000-0000-4000-8000-000000000402'::uuid,
          '00000000-0000-4000-8000-000000000403'::uuid,
          '00000000-0000-4000-8000-000000000404'::uuid,
          '00000000-0000-4000-8000-000000000405'::uuid,
          '00000000-0000-4000-8000-000000000406'::uuid
        ]
        loop
          reset role;
          select request_events, byte_events, active_reservation_count
            into v_before_requests, v_before_bytes, v_before_active
          from public.image_upload_quota_counters
          where owner_uuid = '${OWNER_ACTIVE}'
            and account_generation = 1;
          set local role service_role;

          v_result := public.reserve_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            v_key,
            repeat('b', 64),
            repeat('c', 64),
            case v_key
              when '00000000-0000-4000-8000-000000000402'::uuid
                then 2097152
              else 1024
            end,
            'image/webp',
            'webp',
            '2030-07-24T01:01:00Z'
          );

          if v_result ->> 'outcome' <> 'limited'
            or (v_result ->> 'retry_after_seconds')::integer <= 0 then
            raise exception 'quota boundary did not fail closed for %: %',
              v_key,
              v_result;
          end if;

          reset role;
          if exists (
            select 1
            from public.mutation_idempotency_keys
            where owner_uuid = '${OWNER_ACTIVE}'
              and account_generation = 1
              and result_reference is not null
          ) then
            raise exception 'limited attempt created idempotency state';
          end if;
          if (
            select row(request_events, byte_events, active_reservation_count)
              is distinct from row(
                v_before_requests,
                v_before_bytes,
                v_before_active
              )
            from public.image_upload_quota_counters
            where owner_uuid = '${OWNER_ACTIVE}'
              and account_generation = 1
          ) then
            raise exception 'limited attempt changed quota counters';
          end if;

          if v_key = '00000000-0000-4000-8000-000000000401'::uuid then
            update public.image_upload_quota_counters
            set request_events = '[]'::jsonb,
                byte_events = jsonb_build_array(
                  jsonb_build_object(
                    'at',
                    '2030-07-24T01:00:00Z'::timestamptz,
                    'bytes',
                    103809024
                  )
                )
            where owner_uuid = '${OWNER_ACTIVE}'
              and account_generation = 1;
          elsif v_key = '00000000-0000-4000-8000-000000000402'::uuid then
            update public.image_upload_quota_counters
            set byte_events = '[]'::jsonb,
                active_reservation_count = 20
            where owner_uuid = '${OWNER_ACTIVE}'
              and account_generation = 1;
          elsif v_key = '00000000-0000-4000-8000-000000000403'::uuid then
            update public.image_upload_quota_counters
            set active_reservation_count = 0
            where owner_uuid = '${OWNER_ACTIVE}'
              and account_generation = 1;
            insert into public.storage_object_deletion_outbox (
              bucket_id,
              object_path,
              owner_uuid,
              account_generation,
              cleanup_generation,
              reason,
              state,
              next_attempt_at
            )
            select
              'recipe-images-private',
              'quota/backlog/' || series::text || '.webp',
              '${OWNER_ACTIVE}',
              1,
              1,
              'quota-test',
              'pending',
              '2030-07-24T01:01:00Z'
            from generate_series(1, 500) as series;
          elsif v_key = '00000000-0000-4000-8000-000000000404'::uuid then
            delete from public.storage_object_deletion_outbox;
            insert into public.storage_object_deletion_outbox (
              bucket_id,
              object_path,
              owner_uuid,
              account_generation,
              cleanup_generation,
              reason,
              state,
              next_attempt_at
            ) values (
              'recipe-images-private',
              'quota/oldest.webp',
              '${OWNER_ACTIVE}',
              1,
              1,
              'quota-test',
              'pending',
              '2030-07-24T00:44:59Z'
            );
          elsif v_key = '00000000-0000-4000-8000-000000000405'::uuid then
            delete from public.storage_object_deletion_outbox;
            insert into public.storage_object_deletion_outbox (
              bucket_id,
              object_path,
              owner_uuid,
              account_generation,
              cleanup_generation,
              reason,
              state,
              next_attempt_at
            ) values (
              'recipe-images-private',
              'quota/dead-letter.webp',
              '${OWNER_ACTIVE}',
              1,
              1,
              'quota-test',
              'dead_letter',
              '2030-07-24T01:01:00Z'
            );
          end if;
          set local role service_role;
        end loop;
      end;
      $block$;

      reset role;
      rollback;
      select 'upload-quota-pass';
    `)).toBe("upload-quota-pass");
  });

  it("rejects finalize outside READ COMMITTED without changing upload state", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      update public.user_account_lifecycles
      set auth_identity_created_at_snapshot = '2026-01-01T00:00:00Z'
      where owner_uuid = '${OWNER_ACTIVE}'
        and account_generation = 1;

      insert into public.user_session_generation_bindings (
        session_key_hash,
        hmac_key_version,
        owner_uuid,
        expected_account_generation,
        auth_identity_created_at_snapshot,
        revoked_at
      ) values (
        repeat('a', 64),
        1,
        '${OWNER_ACTIVE}',
        1,
        '2026-01-01T00:00:00Z',
        null
      )
      on conflict (hmac_key_version, session_key_hash)
      do update set revoked_at = null;

      set local role service_role;
      select public.reserve_recipe_image_upload(
        '${OWNER_ACTIVE}',
        '2026-01-01T00:00:00Z',
        repeat('a', 64),
        1,
        '${IMAGE_UPLOAD_ISOLATION_KEY}',
        repeat('d', 64),
        repeat('e', 64),
        2048,
        'image/webp',
        'webp',
        '2030-07-24T02:00:00Z'
      );

      reset role;
      commit;
      select 'isolation-fixture-pass';
    `)).toBe("isolation-fixture-pass");

    const objectId = psql(`
      select result_reference
      from public.mutation_idempotency_keys
      where owner_uuid = '${OWNER_ACTIVE}'
        and operation_scope = 'recipe_image_upload'
        and payload_hash = repeat('d', 64);
    `);
    const attemptToken = psql(`
      select attempt_token
      from public.mutation_idempotency_keys
      where result_reference = '${objectId}';
    `);

    try {
      expect(psql(`
        begin isolation level serializable;
        set local role service_role;

        do $block$
        begin
          begin
            perform public.finalize_recipe_image_upload(
              '${OWNER_ACTIVE}',
              '2026-01-01T00:00:00Z',
              repeat('a', 64),
              1,
              '${IMAGE_UPLOAD_ISOLATION_KEY}',
              '${attemptToken}',
              0,
              '2030-07-24T02:00:01Z'
            );
            raise exception 'serializable finalize unexpectedly succeeded';
          exception
            when sqlstate '25001' then
              null;
          end;
        end;
        $block$;

        reset role;

        do $block$
        begin
          if not exists (
            select 1
            from public.mutation_idempotency_keys
            where result_reference = '${objectId}'
              and state = 'in_progress'
              and attempt_token = '${attemptToken}'
          ) or not exists (
            select 1
            from public.recipe_image_objects
            where id = '${objectId}'
              and state = 'pending_upload'
              and upload_attempt_token = '${attemptToken}'
          ) then
            raise exception 'serializable finalize changed upload state';
          end if;
        end;
        $block$;

        rollback;
        select 'finalize-isolation-pass';
      `)).toBe("finalize-isolation-pass");
    } finally {
      expect(psql(`
        begin;
        delete from public.mutation_idempotency_keys
        where result_reference = '${objectId}';
        delete from public.recipe_image_objects
        where id = '${objectId}';
        delete from public.image_upload_quota_counters
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;
        delete from public.user_session_generation_bindings
        where owner_uuid = '${OWNER_ACTIVE}'
          and expected_account_generation = 1;
        update public.user_account_lifecycles
        set auth_identity_created_at_snapshot = null
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;
        update public.account_generation_capability_state
        set state = 'legacy',
            current_cutover_attempt_id = null,
            revision = revision + 1
        where singleton;
        commit;
        select 'isolation-cleanup-pass';
      `)).toBe("isolation-cleanup-pass");
    }
  });

  it("replays upload reservation DDL without direct table access", () => {
    const replay = psqlFileResult(IMAGE_UPLOAD_RESERVATION_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'service_role',
          'public.mutation_idempotency_keys',
          'INSERT'
        ),
        has_table_privilege(
          'service_role',
          'public.image_upload_quota_counters',
          'UPDATE'
        ),
        has_function_privilege(
          'authenticated',
          'public.reserve_recipe_image_upload(uuid,timestamp with time zone,text,integer,uuid,text,text,bigint,text,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.reserve_recipe_image_upload(uuid,timestamp with time zone,text,integer,uuid,text,text,bigint,text,text,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:f:t");
  });

  it("fails replay closed when the guard owner has an unexpected member", () => {
    const setup = psqlResult(`
      create role recipe_visibility_unexpected_member login;
      grant homecook_recipe_visibility_guard_owner
        to recipe_visibility_unexpected_member;
    `);
    expect(setup.status, setup.stderr).toBe(0);

    try {
      const replay = psqlFileResult(MIGRATION_PATH);

      expect(replay.status).not.toBe(0);
      expect(replay.stderr).toContain(
        "recipe visibility guard owner has unexpected members",
      );
    } finally {
      const cleanup = psqlResult(`
        revoke homecook_recipe_visibility_guard_owner
          from recipe_visibility_unexpected_member;
        drop role recipe_visibility_unexpected_member;
      `);
      expect(cleanup.status, cleanup.stderr).toBe(0);
    }

    const replayAfterCleanup = psqlFileResult(MIGRATION_PATH);
    expect(replayAfterCleanup.status, replayAfterCleanup.stderr).toBe(0);
  });

  it("fails replay closed on PostgreSQL 16 when the guard owner has an admin-only member", () => {
    if (Number(psql("show server_version_num")) < 160000) {
      return;
    }

    const setup = psqlResult(`
      create role recipe_visibility_admin_only login;
      grant homecook_recipe_visibility_guard_owner
        to recipe_visibility_admin_only
        with inherit false, set false, admin true;
    `);
    expect(setup.status, setup.stderr).toBe(0);

    try {
      const replay = psqlFileResult(MIGRATION_PATH);

      expect(replay.status).not.toBe(0);
      expect(replay.stderr).toContain(
        "recipe visibility guard owner has unexpected members",
      );
    } finally {
      const cleanup = psqlResult(`
        revoke homecook_recipe_visibility_guard_owner
          from recipe_visibility_admin_only;
        drop role recipe_visibility_admin_only;
      `);
      expect(cleanup.status, cleanup.stderr).toBe(0);
    }

    const replayAfterCleanup = psqlFileResult(MIGRATION_PATH);
    expect(replayAfterCleanup.status, replayAfterCleanup.stderr).toBe(0);
  });
});
