import { spawn, spawnSync } from "node:child_process";

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
const IMAGE_PRIVATE_STORAGE_MIGRATION_PATH =
  "supabase/migrations/20260724140000_recipe_image_private_storage_boundary.sql";
const IMAGE_QUARANTINE_RECHECK_MIGRATION_PATH =
  "supabase/migrations/20260724220000_recipe_image_quarantine_recheck_authority.sql";
const IMAGE_NORMAL_DRAIN_MIGRATION_PATH =
  "supabase/migrations/20260724230000_recipe_image_normal_drain_authority.sql";
const IMAGE_EXPECTED_OWNER_SIGNAL_MIGRATION_PATH =
  "supabase/migrations/20260724240000_recipe_image_expected_owner_signal_authority.sql";
const IMAGE_AUTH_DELETION_READINESS_MIGRATION_PATH =
  "supabase/migrations/20260724250000_recipe_image_auth_deletion_readiness_authority.sql";
const IMAGE_AUTH_DELETION_CLAIM_MIGRATION_PATH =
  "supabase/migrations/20260724260000_recipe_image_auth_deletion_claim_authority.sql";
const IMAGE_AUTH_DELETION_FINALIZE_MIGRATION_PATH =
  "supabase/migrations/20260724270000_recipe_image_auth_deletion_finalize_authority.sql";
const IMAGE_AUTH_DELETION_CANDIDATE_MIGRATION_PATH =
  "supabase/migrations/20260724280000_recipe_image_auth_deletion_candidate_authority.sql";
const IMAGE_LIFECYCLE_COMPLETION_MIGRATION_PATH =
  "supabase/migrations/20260724290000_recipe_image_lifecycle_completion_authority.sql";
const IMAGE_LIFECYCLE_COMPLETION_CANDIDATE_MIGRATION_PATH =
  "supabase/migrations/20260724300000_recipe_image_lifecycle_completion_candidate_authority.sql";
const IMAGE_COMPACT_RETENTION_MIGRATION_PATH =
  "supabase/migrations/20260724310000_recipe_image_compact_retention_authority.sql";

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
const IMAGE_UPLOAD_COMPENSATION_KEY = "00000000-0000-4000-8000-000000000317";
const IMAGE_CANCEL_UPLOAD_KEY = "00000000-0000-4000-8000-000000000320";
const IMAGE_CANCEL_KEY = "00000000-0000-4000-8000-000000000321";
const IMAGE_CANCEL_OTHER_OWNER = "00000000-0000-4000-8000-000000000322";
const IMAGE_CANCEL_FINALIZED_UPLOAD_KEY =
  "00000000-0000-4000-8000-000000000325";
const IMAGE_CANCEL_FINALIZED_KEY =
  "00000000-0000-4000-8000-000000000326";
const IMAGE_ATTACH_UPLOAD_KEY =
  "00000000-0000-4000-8000-000000000327";
const IMAGE_ATTACH_RECIPE =
  "00000000-0000-4000-8000-000000000328";
const IMAGE_ATTACH_CANCEL_KEY =
  "00000000-0000-4000-8000-000000000329";
const IMAGE_CREATE_ATTACH_UPLOAD_KEY =
  "00000000-0000-4000-8000-000000000330";

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

function psqlAsync(sql: string, applicationName: string) {
  const child = spawn("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      PGAPPNAME: applicationName,
    },
  });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  return new Promise<{
    status: number | null;
    stderr: string;
    stdout: string;
  }>((resolve) => {
    child.on("close", (status) => {
      resolve({ status, stderr, stdout });
    });
  });
}

async function waitForPgSleep(applicationName: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (psql(`
      select exists (
        select 1
        from pg_catalog.pg_stat_activity
        where application_name = '${applicationName}'
          and wait_event = 'PgSleep'
      );
    `) === "t") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`${applicationName} did not acquire the race lock`);
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

  it("keeps managed private image Storage server-only and replay safe", () => {
    expect(psql(`
      select jsonb_build_object(
        'public', bucket.public,
        'file_size_limit', bucket.file_size_limit,
        'allowed_mime_types', bucket.allowed_mime_types
      )
      from storage.buckets as bucket
      where bucket.id = 'recipe-images-private';
    `)).toBe(
      '{"public": false, "file_size_limit": 5242880, "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]}',
    );

    expect(psql(`
      select count(*)
      from pg_catalog.pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          coalesce(qual, '') ilike '%recipe-images-private%'
          or coalesce(with_check, '') ilike '%recipe-images-private%'
      );
    `)).toBe("0");

    psql(`
      set local role service_role;
      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '00000000-0000-4000-8000-000000000399',
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/private.webp',
        '${OWNER_ACTIVE}'
      );
      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '00000000-0000-4000-8000-000000000398',
        'recipe-images',
        '${OWNER_ACTIVE}/public.webp',
        '${OWNER_ACTIVE}'
      );
      reset role;
    `);

    for (const role of ["anon", "authenticated"] as const) {
      const insert = asRoleResult(
        role,
        "insert into storage.objects (bucket_id, name) values ('recipe-images-private', 'blocked.webp');",
        OWNER_ACTIVE,
      );
      expect(insert.status).not.toBe(0);
      expect(insert.stderr).toMatch(/row-level security policy/i);

      const read = asRole(
        role,
        "select count(*) from storage.objects where bucket_id = 'recipe-images-private';",
        OWNER_ACTIVE,
      );
      expect(read).toBe("0");

      expect(asRole(
        role,
        `
          with changed as (
            update storage.objects
            set name = 'mutated.webp'
            where bucket_id = 'recipe-images-private'
            returning 1
          )
          select count(*) from changed;
        `,
        OWNER_ACTIVE,
      )).toBe("0");

      expect(asRole(
        role,
        `
          with removed as (
            delete from storage.objects
            where bucket_id = 'recipe-images-private'
            returning 1
          )
          select count(*) from removed;
        `,
        OWNER_ACTIVE,
      )).toBe("0");
    }

    expect(psql(`
      select count(*)
      from pg_catalog.pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'recipe_images_public_read',
          'recipe_images_insert_own',
          'recipe_images_update_own',
          'recipe_images_delete_own'
        );
    `)).toBe("4");
    expect(asRole(
      "anon",
      "select count(*) from storage.objects where bucket_id = 'recipe-images';",
    )).toBe("1");
    expect(asRole(
      "authenticated",
      `
        with changed as (
          update storage.objects
          set name = '${OWNER_ACTIVE}/updated.webp'
          where bucket_id = 'recipe-images'
          returning 1
        )
        select count(*) from changed;
      `,
      OWNER_ACTIVE,
    )).toBe("1");
    expect(asRole(
      "authenticated",
      `
        with created as (
          insert into storage.objects (
            bucket_id,
            name,
            owner_id
          ) values (
            'recipe-images',
            '${OWNER_ACTIVE}/new.webp',
            '${OWNER_ACTIVE}'
          )
          returning 1
        )
        select count(*) from created;
      `,
      OWNER_ACTIVE,
    )).toBe("1");
    expect(asRole(
      "authenticated",
      `
        with removed as (
          delete from storage.objects
          where bucket_id = 'recipe-images'
          returning 1
        )
        select count(*) from removed;
      `,
      OWNER_ACTIVE,
    )).toBe("1");

    const replay = psqlFileResult(IMAGE_PRIVATE_STORAGE_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);
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
      begin;
      set local role service_role;
      select *
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T00:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);

    expect(psqlResult(`
      begin isolation level repeatable read;
      set local role service_role;
      select *
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T00:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);

    expect(psqlResult(`
      begin isolation level repeatable read;
      set local role service_role;
      select public.recheck_claimed_recipe_image_cleanup_not_found(
        '${IMAGE_CLEANUP_FOUND}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '2030-07-24T00:05:00Z',
        false,
        '2030-07-24T00:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);

    expect(psqlResult(`
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
    `).status).toBe(0);

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
        false,
        '2030-07-24T00:16:00Z'
      );
      rollback;
    `)).toBe("");

    expect(psql(`
      select outbox.state || ':' || object.state
      from public.storage_object_deletion_outbox as outbox
      join public.recipe_image_objects as object
        on object.bucket_id = outbox.bucket_id
       and object.object_path = outbox.object_path
      where outbox.id = '${firstOutboxId}';
    `)).toBe("awaiting_not_found_recheck:not_found_observed");

    expect(psql(`
      begin;
      set local role service_role;
      select count(*)
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T00:16:00Z'
      )
      where outbox_id = '${firstOutboxId}'
        and claimed_next_attempt_at = '2030-07-24T00:21:00Z';
      commit;
    `)).toBe("1");

    expect(psql(`
      begin;
      set local role service_role;
      select public.recheck_claimed_recipe_image_cleanup_not_found(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '2030-07-24T00:20:00Z',
        true,
        '2030-07-24T00:16:00Z'
      );
      rollback;
    `)).toBe("");

    expect(psql(`
      begin;
      set local role service_role;
      select public.recheck_claimed_recipe_image_cleanup_not_found(
        '${firstOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '2030-07-24T00:21:00Z',
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
      select count(*)
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T00:36:00Z'
      )
      where outbox_id = '${secondOutboxId}'
        and claimed_next_attempt_at = '2030-07-24T00:41:00Z';
      commit;
    `)).toBe("1");

    expect(psql(`
      begin;
      set local role service_role;
      select public.recheck_claimed_recipe_image_cleanup_not_found(
        '${secondOutboxId}',
        '${OWNER_ACTIVE}',
        1,
        1,
        '2030-07-24T00:41:00Z',
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

  it("claims 51 due quarantine rechecks in ordered bounded batches without starvation", () => {
    expect(psql(`
      begin;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        not_found_observed_at,
        late_upload_quarantine_until
      )
      select
        (
          '10000000-0000-4000-8000-'
          || lpad(series.value::text, 12, '0')
        )::uuid,
        '${OWNER_ACTIVE}'::uuid,
        1,
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/10000000-0000-4000-8000-'
          || lpad(series.value::text, 12, '0')
          || '.webp',
        'private',
        'not_found_observed',
        100 + series.value,
        '2030-07-24T00:00:00Z'::timestamptz,
        '2030-07-24T00:15:00Z'::timestamptz
      from generate_series(1, 51) as series(value);

      insert into public.storage_object_deletion_outbox (
        id,
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
        (
          '20000000-0000-4000-8000-'
          || lpad(series.value::text, 12, '0')
        )::uuid,
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/10000000-0000-4000-8000-'
          || lpad(series.value::text, 12, '0')
          || '.webp',
        '${OWNER_ACTIVE}'::uuid,
        1,
        100 + series.value,
        'ordered_recheck_fixture',
        'awaiting_not_found_recheck',
        '2030-07-24T00:15:00Z'::timestamptz
          + series.value * interval '1 second'
      from generate_series(1, 51) as series(value);

      set local role service_role;

      create temp table first_recheck_claim on commit drop as
      select *
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T01:00:00Z'
      );

      create temp table second_recheck_claim on commit drop as
      select *
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        50,
        '2030-07-24T01:00:00Z'
      );

      select concat_ws(
        ':',
        (select count(*) from first_recheck_claim),
        (
          select min(outbox_id::text)
          from first_recheck_claim
        ),
        (
          select max(outbox_id::text)
          from first_recheck_claim
        ),
        (
          select bool_and(
            claimed_next_attempt_at = '2030-07-24T01:05:00Z'
          )
          from first_recheck_claim
        ),
        (select count(*) from second_recheck_claim),
        (
          select min(outbox_id::text)
          from second_recheck_claim
        )
      );

      rollback;
    `)).toBe(
      "50:20000000-0000-4000-8000-000000000001:"
      + "20000000-0000-4000-8000-000000000050:t:1:"
      + "20000000-0000-4000-8000-000000000051",
    );

    expect(psqlResult(`
      begin;
      set local role service_role;
      select *
      from public.claim_recipe_image_cleanup_not_found_rechecks(
        51,
        '2030-07-24T01:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);
  });

  it("recovers bounded normal-drain leases and fails exact attempts deterministically", () => {
    expect(psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'legacy',
          revision = revision + 1
      where singleton;
      set local role service_role;
      select *
      from public.claim_recipe_image_cleanup(
        1,
        '50000000-0000-4000-8000-000000000000',
        '2030-07-24T00:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);

    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1,
          current_cutover_attempt_id =
            '00000000-0000-4000-8000-000000000399'
      where singleton;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        not_found_observed_at,
        late_upload_quarantine_until
      ) values
        (
          '30000000-0000-4000-8000-000000000001',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000001.webp',
          'private',
          'cleanup_pending',
          201,
          null,
          null
        ),
        (
          '30000000-0000-4000-8000-000000000002',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000002.webp',
          'private',
          'cleanup_pending',
          202,
          null,
          null
        ),
        (
          '30000000-0000-4000-8000-000000000003',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000003.webp',
          'private',
          'not_found_observed',
          203,
          '2030-07-24T00:00:00Z',
          '2030-07-24T00:15:00Z'
        );

      insert into public.storage_object_deletion_outbox (
        id,
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        attempts,
        next_attempt_at,
        lease_token,
        lease_expires_at
      ) values
        (
          '40000000-0000-4000-8000-000000000001',
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000001.webp',
          '${OWNER_ACTIVE}',
          1,
          201,
          'expired_lease_fixture',
          'processing',
          1,
          '2030-07-24T00:00:00Z',
          '50000000-0000-4000-8000-000000000001',
          '2030-07-24T00:05:00Z'
        ),
        (
          '40000000-0000-4000-8000-000000000002',
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000002.webp',
          '${OWNER_ACTIVE}',
          1,
          202,
          'failed_due_fixture',
          'failed',
          9,
          '2030-07-24T00:06:00Z',
          null,
          null
        ),
        (
          '40000000-0000-4000-8000-000000000003',
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/30000000-0000-4000-8000-000000000003.webp',
          '${OWNER_ACTIVE}',
          1,
          203,
          'quarantine_fixture',
          'awaiting_not_found_recheck',
          1,
          '2030-07-24T00:01:00Z',
          null,
          null
        );

      set local role service_role;

      create temp table normal_claim on commit drop as
      select *
      from public.claim_recipe_image_cleanup(
        50,
        '50000000-0000-4000-8000-000000000002',
        '2030-07-24T00:10:00Z'
      );

      do $test$
      declare
        v_result text;
      begin
        if (select count(*) from normal_claim) <> 2 then
          raise exception 'normal claim did not recover exactly two due rows';
        end if;

        if exists (
          select 1
          from normal_claim
          where outbox_id = '40000000-0000-4000-8000-000000000003'
        ) then
          raise exception 'quarantine row reached normal claim';
        end if;

        select public.fail_recipe_image_cleanup(
          '40000000-0000-4000-8000-000000000001',
          '${OWNER_ACTIVE}',
          1,
          201,
          '50000000-0000-4000-8000-000000000001',
          'STALE_WORKER',
          '2030-07-24T00:10:30Z'
        ) into v_result;
        if v_result is not null then
          raise exception 'expired lease token remained authoritative';
        end if;

        select public.fail_recipe_image_cleanup(
          '40000000-0000-4000-8000-000000000001',
          '${OWNER_ACTIVE}',
          1,
          201,
          '50000000-0000-4000-8000-000000000002',
          'STORAGE_UNAVAILABLE',
          '2030-07-24T00:10:30Z'
        ) into v_result;
        if v_result is distinct from 'failed' then
          raise exception 'live lease did not enter failed retry';
        end if;

        select public.fail_recipe_image_cleanup(
          '40000000-0000-4000-8000-000000000002',
          '${OWNER_ACTIVE}',
          1,
          202,
          '50000000-0000-4000-8000-000000000002',
          'STORAGE_UNAVAILABLE',
          '2030-07-24T00:10:30Z'
        ) into v_result;
        if v_result is distinct from 'dead_letter' then
          raise exception 'tenth failed attempt did not dead-letter';
        end if;

      end;
      $test$;

      reset role;

      do $test$
      begin
        if (
          select concat_ws(
            ':',
            state,
            attempts,
            next_attempt_at = '2030-07-24T00:15:30Z',
            lease_token is null,
            last_error
          )
          from public.storage_object_deletion_outbox
          where id = '40000000-0000-4000-8000-000000000001'
        ) <> 'failed:2:t:t:STORAGE_UNAVAILABLE' then
          raise exception 'failed retry state drifted';
        end if;

        if (
          select state || ':' || attempts || ':' || last_error
          from public.storage_object_deletion_outbox
          where id = '40000000-0000-4000-8000-000000000002'
        ) <> 'dead_letter:10:STORAGE_UNAVAILABLE' then
          raise exception 'dead-letter state drifted';
        end if;
      end;
      $test$;

      set local role service_role;

      select concat_ws(
        ':',
        (
          select count(*)
          from public.claim_recipe_image_cleanup(
            50,
            '50000000-0000-4000-8000-000000000003',
            '2030-07-24T00:15:29Z'
          )
        ),
        (
          select count(*)
          from public.claim_recipe_image_cleanup(
            50,
            '50000000-0000-4000-8000-000000000004',
            '2030-07-24T00:15:30Z'
          )
          where outbox_id =
            '40000000-0000-4000-8000-000000000001'
        ),
        (
          select count(*)
          from public.claim_recipe_image_cleanup(
            50,
            '50000000-0000-4000-8000-000000000005',
            '2031-07-24T00:00:00Z'
          )
          where outbox_id =
            '40000000-0000-4000-8000-000000000002'
        )
      );

      rollback;
    `)).toBe("0:1:0");

    expect(psqlResult(`
      begin isolation level repeatable read;
      set local role service_role;
      select *
      from public.claim_recipe_image_cleanup(
        1,
        '50000000-0000-4000-8000-000000000006',
        '2030-07-24T00:00:00Z'
      );
      rollback;
    `).status).not.toBe(0);

    expect(psqlResult(`
      begin;
      set local role service_role;
      select public.fail_recipe_image_cleanup(
        '40000000-0000-4000-8000-000000000001',
        '${OWNER_ACTIVE}',
        1,
        201,
        '50000000-0000-4000-8000-000000000002',
        'unsafe free-form detail',
        '2030-07-24T00:10:30Z'
      );
      rollback;
    `).status).not.toBe(0);
  });

  it("replays cleanup outbox DDL without granting direct mutation", () => {
    const baselineReplay = psqlFileResult(IMAGE_CLEANUP_OUTBOX_MIGRATION_PATH);
    expect(baselineReplay.status, baselineReplay.stderr).toBe(0);
    const authorityReplay = psqlFileResult(IMAGE_NORMAL_DRAIN_MIGRATION_PATH);
    expect(authorityReplay.status, authorityReplay.stderr).toBe(0);

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
        has_function_privilege(
          'anon',
          'public.fail_recipe_image_cleanup(uuid,uuid,bigint,bigint,uuid,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.fail_recipe_image_cleanup(uuid,uuid,bigint,bigint,uuid,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.fail_recipe_image_cleanup(uuid,uuid,bigint,bigint,uuid,text,timestamp with time zone)',
          'EXECUTE'
        ),
        (
          select count(*)::text
          from public.storage_object_deletion_outbox
          where terminal_result in ('deleted', 'verified_not_found')
        )
      );
    `)).toBe("f:f:t:f:f:t:2");
  });

  it("replays quarantine recheck authority without widening direct access", () => {
    const replay = psqlFileResult(IMAGE_QUARANTINE_RECHECK_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'service_role',
          'public.storage_object_deletion_outbox',
          'SELECT'
        ),
        has_function_privilege(
          'authenticated',
          'public.claim_recipe_image_cleanup_not_found_rechecks(integer,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.claim_recipe_image_cleanup_not_found_rechecks(integer,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.recheck_claimed_recipe_image_cleanup_not_found(uuid,uuid,bigint,bigint,timestamp with time zone,boolean,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t:t");
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
        begin
          perform public.attach_recipe_image_object(
            '00000000-0000-4000-8000-000000000299',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_ATTACH_RECIPE}',
            '${IMAGE_PRIVATE}',
            0,
            '2030-07-24T03:00:00Z'
          );
          raise exception 'unclassified owner reached attach unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_CUTOVER_UNCLASSIFIED' then
              raise;
            end if;
        end;

        begin
          perform public.attach_recipe_image_object(
            '${OWNER_QUARANTINED}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_ATTACH_RECIPE}',
            '${IMAGE_PRIVATE}',
            0,
            '2030-07-24T03:00:00Z'
          );
          raise exception 'deleting owner reached attach unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_DELETING' then
              raise;
            end if;
        end;

        reset role;
        update public.user_account_lifecycles
        set status = 'quarantined'
        where owner_uuid = '${OWNER_QUARANTINED}'
          and account_generation = 1;
        set local role service_role;
        begin
          perform public.attach_recipe_image_object(
            '${OWNER_QUARANTINED}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_ATTACH_RECIPE}',
            '${IMAGE_PRIVATE}',
            0,
            '2030-07-24T03:00:00Z'
          );
          raise exception 'quarantined owner reached attach unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_CUTOVER_QUARANTINED' then
              raise;
            end if;
        end;

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

  it("compensates the exact failed upload once and opens durable cleanup", () => {
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
      do $block$
      declare
        v_reserved jsonb;
        v_compensated jsonb;
        v_replay jsonb;
        v_object_id uuid;
        v_attempt_token uuid;
        v_outbox_id uuid;
      begin
        v_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_UPLOAD_COMPENSATION_KEY}',
          repeat('d', 64),
          repeat('e', 64),
          2048,
          'image/webp',
          'webp',
          '2030-07-24T01:10:00Z'
        );
        v_object_id := (v_reserved ->> 'object_id')::uuid;
        v_attempt_token := (v_reserved ->> 'attempt_token')::uuid;

        v_compensated := public.compensate_recipe_image_upload(
          '${OWNER_ACTIVE}',
          1,
          '${IMAGE_UPLOAD_COMPENSATION_KEY}',
          v_object_id,
          v_attempt_token,
          0,
          'storage_upload_failed',
          '2030-07-24T01:10:01Z'
        );
        v_outbox_id := (v_compensated ->> 'outbox_id')::uuid;

        if v_compensated ->> 'outcome' <> 'cleanup_pending'
          or (v_compensated ->> 'object_id')::uuid <> v_object_id
          or (v_compensated ->> 'cleanup_generation')::bigint <> 1
          or v_outbox_id is null then
          raise exception 'compensation drift: %', v_compensated;
        end if;

        v_replay := public.compensate_recipe_image_upload(
          '${OWNER_ACTIVE}',
          1,
          '${IMAGE_UPLOAD_COMPENSATION_KEY}',
          v_object_id,
          v_attempt_token,
          0,
          'storage_upload_failed',
          '2030-07-24T01:10:02Z'
        );
        if v_replay is distinct from v_compensated then
          raise exception 'compensation replay drift: % <> %',
            v_replay,
            v_compensated;
        end if;

        begin
          perform public.finalize_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_UPLOAD_COMPENSATION_KEY}',
            v_attempt_token,
            0,
            '2030-07-24T01:10:03Z'
          );
          raise exception 'compensated upload finalized unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        reset role;
        if not exists (
          select 1
          from public.recipe_image_objects as object
          where object.id = v_object_id
            and object.state = 'cleanup_pending'
            and object.cleanup_generation = 1
            and object.upload_attempt_token is null
            and object.upload_lease_expires_at is null
        ) then
          raise exception 'compensated object state drift';
        end if;
        if not exists (
          select 1
          from public.mutation_idempotency_keys as idempotency
          where idempotency.result_reference = v_object_id
            and idempotency.state = 'failed_terminal'
            and idempotency.terminal_result = 'cleanup_pending'
            and idempotency.quota_released_at
              = '2030-07-24T01:10:01Z'::timestamptz
            and idempotency.durable_result ->> 'outbox_id'
              = v_outbox_id::text
        ) then
          raise exception 'compensated idempotency state drift';
        end if;
        if not exists (
          select 1
          from public.storage_object_deletion_outbox as outbox
          where outbox.id = v_outbox_id
            and outbox.cleanup_generation = 1
            and outbox.reason = 'storage_upload_failed'
            and outbox.state = 'pending'
        ) then
          raise exception 'compensation outbox drift';
        end if;
        if (
          select row(
            counter.active_reservation_count,
            jsonb_array_length(counter.request_events)
          ) is distinct from row(0, 1)
          from public.image_upload_quota_counters as counter
          where counter.owner_uuid = '${OWNER_ACTIVE}'
            and counter.account_generation = 1
        ) then
          raise exception 'compensation quota drift';
        end if;
      end;
      $block$;

      rollback;
      select 'upload-compensation-pass';
    `)).toBe("upload-compensation-pass");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select public.compensate_recipe_image_upload(
        '${OWNER_ACTIVE}',
        1,
        '${IMAGE_UPLOAD_COMPENSATION_KEY}',
        '00000000-0000-4000-8000-000000000318',
        '00000000-0000-4000-8000-000000000319',
        0,
        'storage_upload_failed',
        '2030-07-24T01:11:00Z'
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toMatch(
      /recipe image upload compensation requires READ COMMITTED/i,
    );
  });

  it("attaches one exact live image atomically and blocks stale competitors", () => {
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

      insert into public.recipes (
        id,
        title,
        base_servings,
        source_type,
        created_by,
        visibility
      ) values (
        '${IMAGE_ATTACH_RECIPE}',
        'managed image attach fixture',
        2,
        'manual',
        '${OWNER_ACTIVE}',
        'private'
      );

      set local role service_role;
      do $block$
      declare
        v_reserved jsonb;
        v_finalized jsonb;
        v_attached jsonb;
        v_object_id uuid;
        v_attempt_token uuid;
        v_before text;
        v_after text;
      begin
        v_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_ATTACH_UPLOAD_KEY}',
          repeat('2', 64),
          repeat('3', 64),
          4096,
          'image/webp',
          'webp',
          '2030-07-24T03:00:00Z'
        );
        v_object_id := (v_reserved ->> 'object_id')::uuid;
        v_attempt_token := (v_reserved ->> 'attempt_token')::uuid;

        v_finalized := public.finalize_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_ATTACH_UPLOAD_KEY}',
          v_attempt_token,
          0,
          '2030-07-24T03:00:01Z'
        );
        if v_finalized ->> 'state' <> 'uploaded_unlinked' then
          raise exception 'attach fixture finalize drift: %', v_finalized;
        end if;

        reset role;
        select md5(
          row(
            object.state,
            object.cleanup_generation,
            object.unlinked_cleanup_after,
            (
              select count(*)
              from public.recipe_image_object_references as reference
              where reference.image_object_id = object.id
            )
          )::text
        )
          into v_before
        from public.recipe_image_objects as object
        where object.id = v_object_id;
        set local role service_role;

        begin
          perform public.attach_recipe_image_object(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('b', 64),
            1,
            '${IMAGE_ATTACH_RECIPE}',
            v_object_id,
            0,
            '2030-07-24T03:00:02Z'
          );
          raise exception 'stale session attached image unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_SESSION_STALE' then
              raise;
            end if;
        end;

        begin
          perform public.attach_recipe_image_object(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${RECIPE_ACTIVE_PUBLIC}',
            v_object_id,
            0,
            '2030-07-24T03:00:02Z'
          );
          raise exception 'public recipe attached private image unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_VISIBILITY_MISMATCH' then
              raise;
            end if;
        end;

        begin
          perform public.attach_recipe_image_object(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_ATTACH_RECIPE}',
            v_object_id,
            1,
            '2030-07-24T03:00:02Z'
          );
          raise exception 'stale cleanup generation attached image unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        reset role;
        select md5(
          row(
            object.state,
            object.cleanup_generation,
            object.unlinked_cleanup_after,
            (
              select count(*)
              from public.recipe_image_object_references as reference
              where reference.image_object_id = object.id
            )
          )::text
        )
          into v_after
        from public.recipe_image_objects as object
        where object.id = v_object_id;
        if v_after is distinct from v_before then
          raise exception 'rejected attach mutated image: % <> %',
            v_after,
            v_before;
        end if;
        set local role service_role;

        v_attached := public.attach_recipe_image_object(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_ATTACH_RECIPE}',
          v_object_id,
          0,
          '2030-07-24T03:00:03Z'
        );

        if v_attached ->> 'outcome' <> 'succeeded'
          or (v_attached ->> 'recipe_id')::uuid
            <> '${IMAGE_ATTACH_RECIPE}'::uuid
          or (v_attached ->> 'object_id')::uuid <> v_object_id
          or v_attached ->> 'state' <> 'attached_private'
          or (v_attached ->> 'reference_id')::uuid is null then
          raise exception 'attach result drift: %', v_attached;
        end if;

        reset role;
        if not exists (
          select 1
          from public.recipe_image_objects as object
          join public.recipe_image_object_references as reference
            on reference.image_object_id = object.id
          where object.id = v_object_id
            and object.state = 'attached_private'
            and object.unlinked_cleanup_after is null
            and object.cleanup_generation = 0
            and reference.reference_type = 'recipe_thumbnail'
            and reference.consumer_id = '${IMAGE_ATTACH_RECIPE}'
        ) then
          raise exception 'attached object/reference state drift';
        end if;
        if not exists (
          select 1
          from public.mutation_idempotency_keys as idempotency
          where idempotency.result_reference = v_object_id
            and idempotency.state = 'succeeded'
            and idempotency.quota_released_at
              = '2030-07-24T03:00:03Z'::timestamptz
        ) then
          raise exception 'attached upload quota marker drift';
        end if;
        if (
          select counter.active_reservation_count
          from public.image_upload_quota_counters as counter
          where counter.owner_uuid = '${OWNER_ACTIVE}'
            and counter.account_generation = 1
        ) <> 0 then
          raise exception 'attached upload active quota drift';
        end if;

        set local role service_role;
        begin
          perform public.cancel_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_ATTACH_CANCEL_KEY}',
            v_object_id,
            '2030-07-24T03:00:04Z'
          );
          raise exception 'attached image cancelled unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        reset role;
        if not exists (
          select 1
          from public.recipe_image_objects as object
          join public.recipe_image_object_references as reference
            on reference.image_object_id = object.id
          where object.id = v_object_id
            and object.state = 'attached_private'
            and reference.reference_type = 'recipe_thumbnail'
            and reference.consumer_id = '${IMAGE_ATTACH_RECIPE}'
        ) or exists (
          select 1
          from public.storage_object_deletion_outbox as outbox
          join public.recipe_image_objects as object
            on object.bucket_id = outbox.bucket_id
           and object.object_path = outbox.object_path
          where object.id = v_object_id
        ) then
          raise exception 'attached image cancel race drift';
        end if;
      end;
      $block$;

      rollback;
      select 'image-attach-pass';
    `)).toBe("image-attach-pass");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select public.attach_recipe_image_object(
        '${OWNER_ACTIVE}',
        '2026-01-01T00:00:00Z',
        repeat('a', 64),
        1,
        '${IMAGE_ATTACH_RECIPE}',
        '${IMAGE_PRIVATE}',
        0,
        '2030-07-24T03:10:00Z'
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toMatch(
      /recipe image attach requires READ COMMITTED/i,
    );
  });

  it("serializes attach against scanner and cancel with exactly one winner", async () => {
    const attachWinsRecipe = "00000000-0000-4000-8000-000000000394";
    const scannerWinsRecipe = "00000000-0000-4000-8000-000000000395";
    const cancelWinsRecipe = "00000000-0000-4000-8000-000000000396";
    const attachWinsObject = "00000000-0000-4000-8000-000000000397";
    const scannerWinsObject = "00000000-0000-4000-8000-000000000398";
    const cancelWinsObject = "00000000-0000-4000-8000-000000000399";
    const cancelKey = "00000000-0000-4000-8000-00000000039a";

    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      update public.user_account_lifecycles
      set status = 'active',
          auth_identity_created_at_snapshot = '2026-01-01T00:00:00Z'
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

      insert into public.recipes (
        id,
        title,
        base_servings,
        source_type,
        created_by,
        visibility
      ) values
        (
          '${attachWinsRecipe}',
          'attach wins scanner race',
          2,
          'manual',
          '${OWNER_ACTIVE}',
          'private'
        ),
        (
          '${scannerWinsRecipe}',
          'scanner wins attach race',
          2,
          'manual',
          '${OWNER_ACTIVE}',
          'private'
        ),
        (
          '${cancelWinsRecipe}',
          'cancel wins attach race',
          2,
          'manual',
          '${OWNER_ACTIVE}',
          'private'
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
        cleanup_generation,
        unlinked_cleanup_after,
        created_at,
        updated_at
      ) values
        (
          '${attachWinsObject}',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/${attachWinsObject}.webp',
          repeat('1', 64),
          1024,
          'image/webp',
          'private',
          'uploaded_unlinked',
          0,
          '2030-01-01T00:05:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        ),
        (
          '${scannerWinsObject}',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/${scannerWinsObject}.webp',
          repeat('2', 64),
          2048,
          'image/webp',
          'private',
          'uploaded_unlinked',
          0,
          '2030-01-01T00:15:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        ),
        (
          '${cancelWinsObject}',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/${cancelWinsObject}.webp',
          repeat('3', 64),
          4096,
          'image/webp',
          'private',
          'uploaded_unlinked',
          0,
          '2030-01-01T00:10:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        );

      insert into public.mutation_idempotency_keys (
        owner_uuid,
        account_generation,
        operation_scope,
        key_hash,
        payload_hash,
        state,
        terminal_result,
        durable_result,
        result_reference,
        attempts,
        reserved_byte_size,
        quota_reserved_at,
        created_at,
        updated_at
      ) values
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('4', 64),
          repeat('7', 64),
          'succeeded',
          'uploaded',
          jsonb_build_object('object_id', '${attachWinsObject}'::uuid),
          '${attachWinsObject}',
          1,
          1024,
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        ),
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('5', 64),
          repeat('8', 64),
          'succeeded',
          'uploaded',
          jsonb_build_object('object_id', '${scannerWinsObject}'::uuid),
          '${scannerWinsObject}',
          1,
          2048,
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        ),
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('6', 64),
          repeat('9', 64),
          'succeeded',
          'uploaded',
          jsonb_build_object('object_id', '${cancelWinsObject}'::uuid),
          '${cancelWinsObject}',
          1,
          4096,
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:00:00Z'
        );

      insert into public.image_upload_quota_counters (
        owner_uuid,
        account_generation,
        active_reservation_count
      ) values (
        '${OWNER_ACTIVE}',
        1,
        3
      )
      on conflict (owner_uuid, account_generation)
      do update set active_reservation_count = 3;

      commit;
      select 'attach-race-fixture-pass';
    `)).toBe("attach-race-fixture-pass");

    try {
      const attachFirst = psqlAsync(`
        begin;
        set local role service_role;
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            'homecook-account-owner:${OWNER_ACTIVE}',
            0
          )
        );
        select pg_sleep(0.5);
        select public.attach_recipe_image_object(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${attachWinsRecipe}',
          '${attachWinsObject}',
          0,
          '2030-01-01T00:04:00Z'
        );
        commit;
      `, "attach-race-attach-first");

      await waitForPgSleep("attach-race-attach-first");

      expect(psql(`
        begin;
        set local role service_role;
        select count(*)
        from public.scan_stale_recipe_image_uploads(
          50,
          '2030-01-01T00:06:00Z'
        );
        commit;
      `)).toBe("0");

      const attachFirstResult = await attachFirst;
      expect(attachFirstResult.status, attachFirstResult.stderr).toBe(0);

      expect(psql(`
        begin;
        set local role service_role;
        select count(*)
        from public.scan_stale_recipe_image_uploads(
          50,
          '2030-01-01T00:06:00Z'
        );
        commit;
      `)).toBe("0");

      expect(psql(`
        update public.recipe_image_objects
        set unlinked_cleanup_after = '2030-01-01T00:05:00Z'
        where id = '${scannerWinsObject}';
        select 'scanner-race-due-pass';
      `)).toBe("scanner-race-due-pass");

      const scannerFirst = psqlAsync(`
        begin;
        set local role service_role;
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            'homecook-account-owner:${OWNER_ACTIVE}',
            0
          )
        );
        select pg_sleep(0.5);
        select count(*)
        from public.scan_stale_recipe_image_uploads(
          50,
          '2030-01-01T00:06:00Z'
        );
        commit;
      `, "attach-race-scanner-first");

      await waitForPgSleep("attach-race-scanner-first");

      const attachAfterScanner = psqlAsync(`
        begin;
        set local role service_role;
        do $block$
        begin
          begin
            perform public.attach_recipe_image_object(
              '${OWNER_ACTIVE}',
              '2026-01-01T00:00:00Z',
              repeat('a', 64),
              1,
              '${scannerWinsRecipe}',
              '${scannerWinsObject}',
              0,
              '2030-01-01T00:04:00Z'
            );
            raise exception 'attach beat the scanner lock unexpectedly';
          exception
            when sqlstate '55000' then
              if sqlerrm <> 'IMAGE_EXPIRED' then
                raise;
              end if;
          end;
        end;
        $block$;
        commit;
      `, "attach-race-after-scanner");

      const [scannerFirstResult, attachAfterScannerResult] =
        await Promise.all([scannerFirst, attachAfterScanner]);
      expect(scannerFirstResult.status, scannerFirstResult.stderr).toBe(0);
      expect(scannerFirstResult.stdout.trim().split("\n")).toContain("1");
      expect(
        attachAfterScannerResult.status,
        attachAfterScannerResult.stderr,
      ).toBe(0);

      const cancelFirst = psqlAsync(`
        begin;
        set local role service_role;
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            'homecook-account-owner:${OWNER_ACTIVE}',
            0
          )
        );
        select pg_sleep(0.5);
        select public.cancel_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${cancelKey}',
          '${cancelWinsObject}',
          '2030-01-01T00:09:00Z'
        );
        commit;
      `, "attach-race-cancel-first");

      await waitForPgSleep("attach-race-cancel-first");

      const attachAfterCancel = psqlAsync(`
        begin;
        set local role service_role;
        do $block$
        begin
          begin
            perform public.attach_recipe_image_object(
              '${OWNER_ACTIVE}',
              '2026-01-01T00:00:00Z',
              repeat('a', 64),
              1,
              '${cancelWinsRecipe}',
              '${cancelWinsObject}',
              0,
              '2030-01-01T00:09:00Z'
            );
            raise exception 'attach beat the cancel lock unexpectedly';
          exception
            when sqlstate '55000' then
              if sqlerrm <> 'IMAGE_EXPIRED' then
                raise;
              end if;
          end;
        end;
        $block$;
        commit;
      `, "attach-race-after-cancel");

      const [cancelFirstResult, attachAfterCancelResult] =
        await Promise.all([cancelFirst, attachAfterCancel]);
      expect(cancelFirstResult.status, cancelFirstResult.stderr).toBe(0);
      expect(
        attachAfterCancelResult.status,
        attachAfterCancelResult.stderr,
      ).toBe(0);

      expect(psql(`
        select concat_ws(
          ':',
          (
            select object.state
            from public.recipe_image_objects as object
            where object.id = '${attachWinsObject}'
          ),
          (
            select count(*)
            from public.recipe_image_object_references as reference
            where reference.image_object_id = '${attachWinsObject}'
          ),
          (
            select count(*)
            from public.storage_object_deletion_outbox as outbox
            where outbox.object_path =
              '${OWNER_ACTIVE}/1/${attachWinsObject}.webp'
          ),
          (
            select object.state
            from public.recipe_image_objects as object
            where object.id = '${scannerWinsObject}'
          ),
          (
            select count(*)
            from public.recipe_image_object_references as reference
            where reference.image_object_id = '${scannerWinsObject}'
          ),
          (
            select count(*)
            from public.storage_object_deletion_outbox as outbox
            where outbox.object_path =
              '${OWNER_ACTIVE}/1/${scannerWinsObject}.webp'
          ),
          (
            select object.state
            from public.recipe_image_objects as object
            where object.id = '${cancelWinsObject}'
          ),
          (
            select count(*)
            from public.recipe_image_object_references as reference
            where reference.image_object_id = '${cancelWinsObject}'
          ),
          (
            select count(*)
            from public.storage_object_deletion_outbox as outbox
            where outbox.object_path =
              '${OWNER_ACTIVE}/1/${cancelWinsObject}.webp'
          ),
          (
            select counter.active_reservation_count
            from public.image_upload_quota_counters as counter
            where counter.owner_uuid = '${OWNER_ACTIVE}'
              and counter.account_generation = 1
          )
        );
      `)).toBe(
        "attached_private:1:0:cleanup_pending:0:1:"
          + "cleanup_pending:0:1:0",
      );
    } finally {
      expect(psql(`
        begin;
        delete from public.recipe_image_object_references
        where image_object_id in (
          '${attachWinsObject}',
          '${scannerWinsObject}',
          '${cancelWinsObject}'
        );
        delete from public.storage_object_deletion_outbox
        where object_path in (
          '${OWNER_ACTIVE}/1/${attachWinsObject}.webp',
          '${OWNER_ACTIVE}/1/${scannerWinsObject}.webp',
          '${OWNER_ACTIVE}/1/${cancelWinsObject}.webp'
        );
        delete from public.mutation_idempotency_keys
        where result_reference in (
          '${attachWinsObject}',
          '${scannerWinsObject}',
          '${cancelWinsObject}'
        );
        delete from public.recipe_image_objects
        where id in (
          '${attachWinsObject}',
          '${scannerWinsObject}',
          '${cancelWinsObject}'
        );
        delete from public.recipes
        where id in (
          '${attachWinsRecipe}',
          '${scannerWinsRecipe}',
          '${cancelWinsRecipe}'
        );
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
        select 'attach-race-cleanup-pass';
      `)).toBe("attach-race-cleanup-pass");
    }
  });

  it("creates one private manual recipe and managed image reference atomically", () => {
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
      do $block$
      declare
        v_reserved jsonb;
        v_finalized jsonb;
        v_created jsonb;
        v_external jsonb;
        v_object_id uuid;
        v_attempt_token uuid;
        v_recipe_id uuid;
        v_external_recipe_id uuid;
      begin
        v_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CREATE_ATTACH_UPLOAD_KEY}',
          repeat('4', 64),
          repeat('5', 64),
          8192,
          'image/webp',
          'webp',
          '2030-07-24T04:00:00Z'
        );
        v_object_id := (v_reserved ->> 'object_id')::uuid;
        v_attempt_token := (v_reserved ->> 'attempt_token')::uuid;

        v_finalized := public.finalize_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CREATE_ATTACH_UPLOAD_KEY}',
          v_attempt_token,
          0,
          '2030-07-24T04:00:01Z'
        );
        if v_finalized ->> 'state' <> 'uploaded_unlinked' then
          raise exception 'create attach fixture finalize drift: %',
            v_finalized;
        end if;

        begin
          perform public.create_manual_recipe_with_managed_image(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('b', 64),
            1,
            v_object_id,
            0,
            'stale session managed recipe',
            2,
            null,
            array[]::text[],
            'system_suggested',
            '[]'::jsonb,
            '[]'::jsonb,
            '2030-07-24T04:00:02Z'
          );
          raise exception 'stale session created recipe unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_SESSION_STALE' then
              raise;
            end if;
        end;

        begin
          perform public.create_manual_recipe_with_managed_image(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            v_object_id,
            0,
            'managed URL conflict recipe',
            2,
            'https://example.com/should-not-persist.webp',
            array[]::text[],
            'system_suggested',
            '[]'::jsonb,
            '[]'::jsonb,
            '2030-07-24T04:00:02Z'
          );
          raise exception 'managed object and URL persisted together';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'MANAGED_IMAGE_REFERENCE_REQUIRED' then
              raise;
            end if;
        end;

        begin
          perform public.create_manual_recipe_with_managed_image(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            v_object_id,
            1,
            'stale cleanup managed recipe',
            2,
            null,
            array[]::text[],
            'system_suggested',
            '[]'::jsonb,
            '[]'::jsonb,
            '2030-07-24T04:00:02Z'
          );
          raise exception 'stale cleanup generation created recipe';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        reset role;
        if exists (
          select 1
          from public.recipes as recipe
          where recipe.title in (
            'stale session managed recipe',
            'managed URL conflict recipe',
            'stale cleanup managed recipe'
          )
        ) or exists (
          select 1
          from public.recipe_image_object_references as reference
          where reference.image_object_id = v_object_id
        ) or not exists (
          select 1
          from public.recipe_image_objects as object
          where object.id = v_object_id
            and object.state = 'uploaded_unlinked'
            and object.cleanup_generation = 0
        ) then
          raise exception 'rejected managed create failed atomic rollback';
        end if;
        set local role service_role;

        v_created := public.create_manual_recipe_with_managed_image(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          v_object_id,
          0,
          'managed image private recipe',
          2,
          null,
          array[]::text[],
          'system_suggested',
          '[]'::jsonb,
          '[]'::jsonb,
          '2030-07-24T04:00:03Z'
        );
        v_recipe_id := (v_created ->> 'id')::uuid;

        if v_recipe_id is null
          or v_created ->> 'visibility' <> 'private'
          or (v_created ->> 'image_object_id')::uuid <> v_object_id
          or v_created ->> 'image_state' <> 'attached_private' then
          raise exception 'managed recipe create result drift: %',
            v_created;
        end if;

        reset role;
        if not exists (
          select 1
          from public.recipes as recipe
          join public.recipe_image_object_references as reference
            on reference.reference_type = 'recipe_thumbnail'
           and reference.consumer_id = recipe.id
          join public.recipe_image_objects as object
            on object.id = reference.image_object_id
          where recipe.id = v_recipe_id
            and recipe.created_by = '${OWNER_ACTIVE}'
            and recipe.visibility = 'private'
            and recipe.thumbnail_url is null
            and object.id = v_object_id
            and object.state = 'attached_private'
            and object.unlinked_cleanup_after is null
        ) then
          raise exception 'managed recipe/reference transaction drift';
        end if;
        if (
          select counter.active_reservation_count
          from public.image_upload_quota_counters as counter
          where counter.owner_uuid = '${OWNER_ACTIVE}'
            and counter.account_generation = 1
        ) <> 0 then
          raise exception 'managed recipe attach quota drift';
        end if;
        set local role service_role;

        v_external := public.create_manual_recipe_with_managed_image(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          null,
          null,
          'external image private recipe',
          2,
          'https://example.com/unmanaged.webp',
          array[]::text[],
          'system_suggested',
          '[]'::jsonb,
          '[]'::jsonb,
          '2030-07-24T04:00:04Z'
        );
        v_external_recipe_id := (v_external ->> 'id')::uuid;

        reset role;
        if not exists (
          select 1
          from public.recipes as recipe
          where recipe.id = v_external_recipe_id
            and recipe.visibility = 'private'
            and recipe.thumbnail_url
              = 'https://example.com/unmanaged.webp'
        ) or exists (
          select 1
          from public.recipe_image_object_references as reference
          where reference.consumer_id = v_external_recipe_id
        ) then
          raise exception 'unmanaged external image compatibility drift';
        end if;
      end;
      $block$;

      rollback;
      select 'manual-create-image-attach-pass';
    `)).toBe("manual-create-image-attach-pass");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select public.create_manual_recipe_with_managed_image(
        '${OWNER_ACTIVE}',
        '2026-01-01T00:00:00Z',
        repeat('a', 64),
        1,
        null,
        null,
        'serializable recipe',
        2,
        null,
        array[]::text[],
        'system_suggested',
        '[]'::jsonb,
        '[]'::jsonb,
        '2030-07-24T04:10:00Z'
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toMatch(
      /managed manual recipe create requires READ COMMITTED/i,
    );
  });

  it("cancels one exact live image once and prevents late finalize", () => {
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
        '${IMAGE_CANCEL_OTHER_OWNER}',
        '${OWNER_REACTIVATED}',
        2,
        'recipe-images-private',
        '${OWNER_REACTIVATED}/2/${IMAGE_CANCEL_OTHER_OWNER}.webp',
        'private',
        'pending_upload',
        '00000000-0000-4000-8000-000000000323',
        0,
        '2030-07-24T02:10:00Z'
      );

      set local role service_role;
      do $block$
      declare
        v_reserved jsonb;
        v_cancelled jsonb;
        v_replay jsonb;
        v_uploaded_reserved jsonb;
        v_uploaded_finalized jsonb;
        v_uploaded_cancelled jsonb;
        v_upload_replay jsonb;
        v_object_id uuid;
        v_attempt_token uuid;
        v_outbox_id uuid;
        v_uploaded_object_id uuid;
        v_uploaded_attempt_token uuid;
      begin
        v_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_UPLOAD_KEY}',
          repeat('f', 64),
          repeat('1', 64),
          1024,
          'image/webp',
          'webp',
          '2030-07-24T02:00:00Z'
        );
        v_object_id := (v_reserved ->> 'object_id')::uuid;
        v_attempt_token := (v_reserved ->> 'attempt_token')::uuid;

        v_cancelled := public.cancel_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_KEY}',
          v_object_id,
          '2030-07-24T02:00:01Z'
        );
        v_outbox_id := (v_cancelled ->> 'outbox_id')::uuid;

        if v_cancelled ->> 'outcome' <> 'succeeded'
          or (v_cancelled ->> 'object_id')::uuid <> v_object_id
          or (v_cancelled ->> 'cleanup_generation')::bigint <> 1
          or v_cancelled ->> 'state' <> 'cleanup_pending'
          or v_outbox_id is null then
          raise exception 'cancel result drift: %', v_cancelled;
        end if;

        v_replay := public.cancel_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_KEY}',
          v_object_id,
          '2030-07-24T02:00:02Z'
        );
        if v_replay is distinct from v_cancelled then
          raise exception 'cancel replay drift: % <> %',
            v_replay,
            v_cancelled;
        end if;

        begin
          perform public.finalize_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_CANCEL_UPLOAD_KEY}',
            v_attempt_token,
            0,
            '2030-07-24T02:00:03Z'
          );
          raise exception 'cancelled upload finalized unexpectedly';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'IMAGE_EXPIRED' then
              raise;
            end if;
        end;

        reset role;
        update public.storage_object_deletion_outbox
        set next_attempt_at = '2030-07-24T02:00:01Z'
        where id = v_outbox_id;
        set local role service_role;

        v_uploaded_reserved := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_FINALIZED_UPLOAD_KEY}',
          repeat('2', 64),
          repeat('3', 64),
          2048,
          'image/webp',
          'webp',
          '2030-07-24T02:00:10Z'
        );
        v_uploaded_object_id :=
          (v_uploaded_reserved ->> 'object_id')::uuid;
        v_uploaded_attempt_token :=
          (v_uploaded_reserved ->> 'attempt_token')::uuid;
        if v_uploaded_reserved ->> 'outcome' <> 'reserved'
          or v_uploaded_object_id is null
          or v_uploaded_attempt_token is null then
          raise exception 'finalized upload reservation drift: %',
            v_uploaded_reserved;
        end if;

        v_uploaded_finalized := public.finalize_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_FINALIZED_UPLOAD_KEY}',
          v_uploaded_attempt_token,
          0,
          '2030-07-24T02:00:11Z'
        );
        if v_uploaded_finalized ->> 'outcome' <> 'succeeded'
          or v_uploaded_finalized ->> 'state' <> 'uploaded_unlinked' then
          raise exception 'finalized upload setup drift: %',
            v_uploaded_finalized;
        end if;

        v_uploaded_cancelled := public.cancel_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_FINALIZED_KEY}',
          v_uploaded_object_id,
          '2030-07-24T02:00:12Z'
        );
        if v_uploaded_cancelled ->> 'state' <> 'cleanup_pending' then
          raise exception 'finalized image cancel drift: %',
            v_uploaded_cancelled;
        end if;

        v_upload_replay := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${IMAGE_CANCEL_FINALIZED_UPLOAD_KEY}',
          repeat('2', 64),
          repeat('3', 64),
          2048,
          'image/webp',
          'webp',
          '2030-07-24T02:00:13Z'
        );
        if v_upload_replay ->> 'outcome' <> 'terminal'
          or (v_upload_replay ->> 'object_id')::uuid
            <> v_uploaded_object_id
          or v_upload_replay ->> 'state' <> 'cleanup_pending'
          or v_upload_replay ->> 'terminal_result'
            <> 'cleanup_pending' then
          raise exception 'cancelled upload replay drift: %',
            v_upload_replay;
        end if;

        begin
          perform public.cancel_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${IMAGE_CANCEL_KEY}',
            '${IMAGE_CANCEL_OTHER_OWNER}',
            '2030-07-24T02:00:04Z'
          );
          raise exception 'reused cancel key changed target unexpectedly';
        exception
          when unique_violation then
            if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then
              raise;
            end if;
        end;

        begin
          perform public.cancel_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '00000000-0000-4000-8000-000000000324',
            '${IMAGE_CANCEL_OTHER_OWNER}',
            '2030-07-24T02:00:05Z'
          );
          raise exception 'other-owner image was visible';
        exception
          when no_data_found then
            if sqlerrm <> 'IMAGE_NOT_FOUND' then
              raise;
            end if;
        end;

        reset role;
        if not exists (
          select 1
          from public.recipe_image_objects as object
          where object.id = v_object_id
            and object.state = 'cleanup_pending'
            and object.cleanup_generation = 1
            and object.upload_attempt_token is null
            and object.upload_lease_expires_at is null
        ) then
          raise exception 'cancelled object state drift';
        end if;
        if not exists (
          select 1
          from public.mutation_idempotency_keys as idempotency
          where idempotency.owner_uuid = '${OWNER_ACTIVE}'
            and idempotency.account_generation = 1
            and idempotency.operation_scope = 'recipe_image_upload'
            and idempotency.result_reference = v_object_id
            and idempotency.state = 'cancelled'
            and idempotency.terminal_result = 'cleanup_pending'
            and idempotency.quota_released_at
              = '2030-07-24T02:00:01Z'::timestamptz
        ) then
          raise exception 'upload cancellation tombstone drift';
        end if;
        if not exists (
          select 1
          from public.mutation_idempotency_keys as idempotency
          where idempotency.owner_uuid = '${OWNER_ACTIVE}'
            and idempotency.account_generation = 1
            and idempotency.operation_scope = 'recipe_image_cancel'
            and idempotency.result_reference = v_object_id
            and idempotency.state = 'succeeded'
            and idempotency.durable_result ->> 'outbox_id'
              = v_outbox_id::text
        ) then
          raise exception 'cancel replay authority drift';
        end if;
        if not exists (
          select 1
          from public.storage_object_deletion_outbox as outbox
          where outbox.id = v_outbox_id
            and outbox.cleanup_generation = 1
            and outbox.reason = 'owner_cancelled'
            and outbox.state = 'pending'
        ) then
          raise exception 'cancel cleanup outbox drift';
        end if;
        if exists (
          select 1
          from public.recipe_image_objects as object
          where object.id = '${IMAGE_CANCEL_OTHER_OWNER}'
            and object.state <> 'pending_upload'
        ) then
          raise exception 'other-owner image mutated';
        end if;
      end;
      $block$;

      rollback;
      select 'image-cancel-pass';
    `)).toBe("image-cancel-pass");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select public.cancel_recipe_image_upload(
        '${OWNER_ACTIVE}',
        '2026-01-01T00:00:00Z',
        repeat('a', 64),
        1,
        '${IMAGE_CANCEL_KEY}',
        '${IMAGE_CANCEL_OTHER_OWNER}',
        '2030-07-24T02:01:00Z'
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toMatch(
      /recipe image cancel requires READ COMMITTED/i,
    );
  });

  it("rejects every non-active cancel lifecycle with its exact public code", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      set local role service_role;
      do $block$
      declare
        v_before_checksum text;
        v_after_checksum text;
      begin
        reset role;
        select encode(
          extensions.digest(
            coalesce(
              string_agg(
                object.id::text || ':' || object.state,
                '|' order by object.id
              ),
              ''
            ),
            'sha256'
          ),
          'hex'
        )
        into v_before_checksum
        from public.recipe_image_objects as object;

        set local role service_role;
        begin
          perform public.cancel_recipe_image_upload(
            '00000000-0000-4000-8000-000000000299',
            '2025-01-01T00:00:00Z',
            repeat('f', 64),
            1,
            '00000000-0000-4000-8000-000000000330',
            '${IMAGE_CANCEL_OTHER_OWNER}',
            '2030-07-24T02:02:00Z'
          );
          raise exception 'unclassified lifecycle cancel unexpectedly ran';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_CUTOVER_UNCLASSIFIED' then
              raise;
            end if;
        end;

        reset role;
        update public.user_account_lifecycles
        set status = 'quarantined'
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;
        set local role service_role;
        begin
          perform public.cancel_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '00000000-0000-4000-8000-000000000331',
            '${IMAGE_CANCEL_OTHER_OWNER}',
            '2030-07-24T02:02:01Z'
          );
          raise exception 'quarantined lifecycle cancel unexpectedly ran';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_CUTOVER_QUARANTINED' then
              raise;
            end if;
        end;

        reset role;
        update public.user_account_lifecycles
        set status = 'deleting'
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;
        set local role service_role;
        begin
          perform public.cancel_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '00000000-0000-4000-8000-000000000332',
            '${IMAGE_CANCEL_OTHER_OWNER}',
            '2030-07-24T02:02:02Z'
          );
          raise exception 'deleting lifecycle cancel unexpectedly ran';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'ACCOUNT_DELETING' then
              raise;
            end if;
        end;

        reset role;
        select encode(
          extensions.digest(
            coalesce(
              string_agg(
                object.id::text || ':' || object.state,
                '|' order by object.id
              ),
              ''
            ),
            'sha256'
          ),
          'hex'
        )
        into v_after_checksum
        from public.recipe_image_objects as object;

        if v_after_checksum is distinct from v_before_checksum then
          raise exception 'lifecycle rejection mutated image state';
        end if;
      end;
      $block$;

      rollback;
      select 'image-cancel-lifecycle-pass';
    `)).toBe("image-cancel-lifecycle-pass");
  });

  it("moves only exact due stale uploads into one newer cleanup generation", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.image_upload_quota_counters (
        owner_uuid,
        account_generation,
        active_reservation_count
      ) values (
        '${OWNER_ACTIVE}',
        1,
        3
      )
      on conflict (owner_uuid, account_generation)
      do update set
        active_reservation_count = excluded.active_reservation_count,
        updated_at = now();

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
        upload_attempt_token,
        cleanup_generation,
        upload_lease_expires_at,
        unlinked_cleanup_after
      ) values
        (
          '00000000-0000-4000-8000-000000000341',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/00000000-0000-4000-8000-000000000341.webp',
          repeat('a', 64),
          100,
          'image/webp',
          'private',
          'pending_upload',
          '00000000-0000-4000-8000-000000000342',
          0,
          '2029-12-31T23:55:00Z',
          null
        ),
        (
          '00000000-0000-4000-8000-000000000343',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/00000000-0000-4000-8000-000000000343.webp',
          repeat('b', 64),
          200,
          'image/webp',
          'private',
          'uploaded_unlinked',
          null,
          0,
          null,
          '2029-12-31T23:59:00Z'
        ),
        (
          '00000000-0000-4000-8000-000000000344',
          '${OWNER_ACTIVE}',
          1,
          'recipe-images-private',
          '${OWNER_ACTIVE}/1/00000000-0000-4000-8000-000000000344.webp',
          repeat('c', 64),
          300,
          'image/webp',
          'private',
          'uploaded_unlinked',
          null,
          0,
          null,
          '2030-01-02T00:00:00Z'
        );

      insert into public.mutation_idempotency_keys (
        owner_uuid,
        account_generation,
        operation_scope,
        key_hash,
        payload_hash,
        state,
        durable_result,
        result_reference,
        attempt_token,
        lease_expires_at,
        reserved_byte_size,
        quota_reserved_at
      ) values
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('1', 64),
          repeat('4', 64),
          'in_progress',
          null,
          '00000000-0000-4000-8000-000000000341',
          '00000000-0000-4000-8000-000000000342',
          '2029-12-31T23:55:00Z',
          100,
          '2029-12-31T23:50:00Z'
        ),
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('2', 64),
          repeat('5', 64),
          'succeeded',
          '{"outcome":"succeeded"}'::jsonb,
          '00000000-0000-4000-8000-000000000343',
          null,
          null,
          200,
          '2029-12-30T00:00:00Z'
        ),
        (
          '${OWNER_ACTIVE}',
          1,
          'recipe_image_upload',
          repeat('3', 64),
          repeat('6', 64),
          'succeeded',
          '{"outcome":"succeeded"}'::jsonb,
          '00000000-0000-4000-8000-000000000344',
          null,
          null,
          300,
          '2029-12-30T00:00:00Z'
        );

      set local role service_role;

      do $block$
      declare
        v_scanned text;
        v_replay_count integer;
        v_cleanup_count integer;
        v_outbox_count integer;
        v_cancelled_count integer;
        v_active_count integer;
      begin
        select string_agg(
          scan.previous_state,
          ','
          order by scan.previous_state
        )
          into v_scanned
        from public.scan_stale_recipe_image_uploads(
          50,
          '2030-01-01T00:00:00Z'
        ) as scan;

        if v_scanned is distinct from
          'pending_upload,uploaded_unlinked' then
          raise exception 'stale scanner result drift: %', v_scanned;
        end if;

        reset role;

        select count(*)
          into v_cleanup_count
        from public.recipe_image_objects as object
        where object.id in (
          '00000000-0000-4000-8000-000000000341',
          '00000000-0000-4000-8000-000000000343'
        )
          and object.state = 'cleanup_pending'
          and object.cleanup_generation = 1
          and object.upload_attempt_token is null
          and object.upload_lease_expires_at is null
          and object.unlinked_cleanup_after is null;

        if v_cleanup_count <> 2 then
          raise exception 'stale object transition drift';
        end if;

        if not exists (
          select 1
          from public.recipe_image_objects as object
          where object.id =
            '00000000-0000-4000-8000-000000000344'
            and object.state = 'uploaded_unlinked'
            and object.cleanup_generation = 0
        ) then
          raise exception 'future grace object changed';
        end if;

        select count(*)
          into v_outbox_count
        from public.storage_object_deletion_outbox as outbox
        where outbox.owner_uuid = '${OWNER_ACTIVE}'
          and outbox.reason = 'stale_upload'
          and outbox.cleanup_generation = 1
          and outbox.state = 'pending';

        if v_outbox_count <> 2 then
          raise exception 'stale cleanup outbox drift';
        end if;

        select count(*)
          into v_cancelled_count
        from public.mutation_idempotency_keys as idempotency
        where idempotency.result_reference in (
          '00000000-0000-4000-8000-000000000341',
          '00000000-0000-4000-8000-000000000343'
        )
          and idempotency.state = 'cancelled'
          and idempotency.terminal_result = 'cleanup_pending'
          and idempotency.quota_released_at is not null;

        if v_cancelled_count <> 2 then
          raise exception 'stale upload tombstone drift';
        end if;

        select counter.active_reservation_count
          into v_active_count
        from public.image_upload_quota_counters as counter
        where counter.owner_uuid = '${OWNER_ACTIVE}'
          and counter.account_generation = 1;

        if v_active_count <> 1 then
          raise exception 'stale reservation release drift: %',
            v_active_count;
        end if;

        select count(*)
          into v_replay_count
        from public.scan_stale_recipe_image_uploads(
          50,
          '2030-01-01T00:00:00Z'
        );

        if v_replay_count <> 0 then
          raise exception 'stale scanner replay was not empty';
        end if;
      end;
      $block$;

      rollback;
      select 'image-stale-scanner-pass';
    `)).toBe("image-stale-scanner-pass");

    expect(asRoleResult(
      "authenticated",
      `
        select count(*)
        from public.scan_stale_recipe_image_uploads(1, now());
      `,
      OWNER_ACTIVE,
    ).status).not.toBe(0);
  });

  it("claims 151 terminal tombstones fairly and reopens only an exact late-object cursor", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at,
        created_at,
        updated_at
      )
      select
        (
          '00000000-0000-4000-8001-'
          || lpad(series.value::text, 12, '0')
        )::uuid,
        '${OWNER_ACTIVE}'::uuid,
        1,
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/00000000-0000-4000-8001-'
          || lpad(series.value::text, 12, '0')
          || '.webp',
        'private',
        case
          when series.value % 2 = 0 then 'deleted'
          else 'verified_not_found'
        end,
        1,
        '2030-01-01T00:00:00Z'::timestamptz
          + ((series.value - 1) * interval '1 millisecond'),
        '2029-12-01T00:00:00Z'::timestamptz,
        case
          when series.value = 151
            then '2029-12-01T00:00:00Z'::timestamptz
          else '2029-12-31T23:00:00Z'::timestamptz
        end
      from generate_series(1, 151) as series(value);

      set local role service_role;

      do $block$
      declare
        v_batch_count integer;
      begin
        select count(*)
          into v_batch_count
        from public.claim_recipe_image_terminal_tombstones(
          50,
          '2030-01-01T00:00:01Z'
        );
        if v_batch_count <> 50 then
          raise exception 'terminal scan batch one drift: %',
            v_batch_count;
        end if;

        select count(*)
          into v_batch_count
        from public.claim_recipe_image_terminal_tombstones(
          50,
          '2030-01-01T00:00:01Z'
        );
        if v_batch_count <> 50 then
          raise exception 'terminal scan batch two drift: %',
            v_batch_count;
        end if;

        select count(*)
          into v_batch_count
        from public.claim_recipe_image_terminal_tombstones(
          50,
          '2030-01-01T00:00:01Z'
        );
        if v_batch_count <> 50 then
          raise exception 'terminal scan batch three drift: %',
            v_batch_count;
        end if;

        select count(*)
          into v_batch_count
        from public.claim_recipe_image_terminal_tombstones(
          50,
          '2030-01-01T00:00:01Z'
        );
        if v_batch_count <> 1 then
          raise exception 'terminal scan batch four drift: %',
            v_batch_count;
        end if;
      end;
      $block$;

      reset role;

      do $block$
      declare
        v_recent_count integer;
        v_daily_count integer;
      begin
        select count(*)
          into v_recent_count
        from public.recipe_image_objects as object
        where object.id::text like
          '00000000-0000-4000-8001-%'
          and object.id <>
            '00000000-0000-4000-8001-000000000151'
          and object.next_terminal_scan_at =
            '2030-01-01T00:05:01Z';

        if v_recent_count <> 150 then
          raise exception 'five-minute terminal cursor drift: %',
            v_recent_count;
        end if;

        select count(*)
          into v_daily_count
        from public.recipe_image_objects as object
        where object.id =
          '00000000-0000-4000-8001-000000000151'
          and object.next_terminal_scan_at =
            '2030-01-02T00:00:01Z';

        if v_daily_count <> 1 then
          raise exception 'daily terminal cursor drift';
        end if;
      end;
      $block$;

      set local role service_role;

      do $block$
      declare
        v_reopened_count integer;
      begin
        select count(*)
          into v_reopened_count
        from public.reopen_recipe_image_terminal_tombstone(
          '00000000-0000-4000-8001-000000000001',
          '${OWNER_ACTIVE}',
          1,
          1,
          '2030-01-01T00:00:00Z',
          '2030-01-01T00:01:00Z'
        );

        if v_reopened_count <> 0 then
          raise exception 'stale terminal cursor reopened cleanup';
        end if;

        select count(*)
          into v_reopened_count
        from public.reopen_recipe_image_terminal_tombstone(
          '00000000-0000-4000-8001-000000000001',
          '${OWNER_ACTIVE}',
          1,
          1,
          '2030-01-01T00:05:01Z',
          '2030-01-01T00:01:00Z'
        );

        if v_reopened_count <> 1 then
          raise exception 'exact terminal cursor did not reopen cleanup';
        end if;
      end;
      $block$;

      reset role;

      do $block$
      begin
        if not exists (
          select 1
          from public.recipe_image_objects as object
          where object.id =
            '00000000-0000-4000-8001-000000000001'
            and object.state = 'cleanup_pending'
            and object.cleanup_generation = 2
            and object.next_terminal_scan_at is null
        ) then
          raise exception 'terminal object reopen state drift';
        end if;

        if not exists (
          select 1
          from public.user_account_lifecycles as lifecycle
          where lifecycle.owner_uuid = '${OWNER_ACTIVE}'
            and lifecycle.account_generation = 1
            and lifecycle.status = 'active'
            and lifecycle.required_cleanup_generation = 2
        ) then
          raise exception 'terminal lifecycle authority drift';
        end if;

        if not exists (
          select 1
          from public.storage_object_deletion_outbox as outbox
          where outbox.owner_uuid = '${OWNER_ACTIVE}'
            and outbox.object_path like
              '%00000000-0000-4000-8001-000000000001.webp'
            and outbox.cleanup_generation = 2
            and outbox.reason = 'late_terminal_object'
            and outbox.state = 'pending'
        ) then
          raise exception 'terminal late-object outbox drift';
        end if;
      end;
      $block$;

      rollback;
      select 'image-terminal-tombstone-pass';
    `)).toBe("image-terminal-tombstone-pass");

    expect(asRoleResult(
      "authenticated",
      `
        select count(*)
        from public.claim_recipe_image_terminal_tombstones(1, now());
      `,
      OWNER_ACTIVE,
    ).status).not.toBe(0);
    expect(asRoleResult(
      "authenticated",
      `
        select count(*)
        from public.reopen_recipe_image_terminal_tombstone(
          '00000000-0000-4000-8001-000000000001',
          '${OWNER_ACTIVE}',
          1,
          1,
          now(),
          now()
        );
      `,
      OWNER_ACTIVE,
    ).status).not.toBe(0);
  });

  it("moves a completed lifecycle back to cleanup-pending when a terminal object reappears", () => {
    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      update public.user_account_lifecycles
      set required_cleanup_generation = 1,
          completed_cleanup_generation = 1,
          status = 'complete'
      where owner_uuid = '${OWNER_REACTIVATED}'
        and account_generation = 1;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at,
        updated_at
      ) values (
        '00000000-0000-4000-8002-000000000001',
        '${OWNER_REACTIVATED}',
        1,
        'recipe-images-private',
        '${OWNER_REACTIVATED}/1/00000000-0000-4000-8002-000000000001.webp',
        'private',
        'deleted',
        1,
        '2030-01-01T00:00:00Z',
        '2029-12-31T23:00:00Z'
      );

      set local role service_role;

      do $block$
      declare
        v_claimed_cursor timestamptz;
        v_reopened_count integer;
      begin
        select scan.claimed_next_terminal_scan_at
          into v_claimed_cursor
        from public.claim_recipe_image_terminal_tombstones(
          1,
          '2030-01-01T00:00:01Z'
        ) as scan;

        if v_claimed_cursor is distinct from
          '2030-01-01T00:05:01Z'::timestamptz then
          raise exception 'completed lifecycle claim cursor drift';
        end if;

        select count(*)
          into v_reopened_count
        from public.reopen_recipe_image_terminal_tombstone(
          '00000000-0000-4000-8002-000000000001',
          '${OWNER_REACTIVATED}',
          1,
          1,
          v_claimed_cursor,
          '2030-01-01T00:01:00Z'
        );

        if v_reopened_count <> 1 then
          raise exception 'completed lifecycle did not reopen';
        end if;
      end;
      $block$;

      reset role;

      do $block$
      begin
        if not exists (
          select 1
          from public.user_account_lifecycles as lifecycle
          where lifecycle.owner_uuid = '${OWNER_REACTIVATED}'
            and lifecycle.account_generation = 1
            and lifecycle.status = 'cleanup_pending'
            and lifecycle.required_cleanup_generation = 2
            and lifecycle.completed_cleanup_generation = 1
        ) then
          raise exception 'completed lifecycle reopen authority drift';
        end if;
      end;
      $block$;

      rollback;
      select 'image-terminal-complete-reopen-pass';
    `)).toBe("image-terminal-complete-reopen-pass");
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

  it("counts only exact Storage owner signals and reaches zero with registry tombstones retained", () => {
    const signalOwner = "00000000-0000-4000-8000-000000000347";
    const ownerIdObject = "00000000-0000-4000-8000-000000000341";
    const legacyObject = "00000000-0000-4000-8000-000000000342";
    const duplicateObject = "00000000-0000-4000-8000-000000000343";
    const registryObject = "00000000-0000-4000-8000-000000000344";
    const tombstoneObject = "00000000-0000-4000-8000-000000000345";
    const otherGenerationObject = "00000000-0000-4000-8000-000000000346";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at
      ) values
        (
          '${registryObject}',
          '${signalOwner}',
          1,
          'recipe-images-private',
          '${signalOwner}/1/${registryObject}.webp',
          'private',
          'deleted',
          1,
          '2030-07-24T00:05:00Z'
        ),
        (
          '${tombstoneObject}',
          '${signalOwner}',
          1,
          'recipe-images-private',
          '${signalOwner}/1/${tombstoneObject}.webp',
          'private',
          'verified_not_found',
          1,
          '2030-07-24T00:05:00Z'
        ),
        (
          '${otherGenerationObject}',
          '${signalOwner}',
          2,
          'recipe-images-private',
          '${signalOwner}/2/${otherGenerationObject}.webp',
          'private',
          'deleted',
          1,
          '2030-07-24T00:05:00Z'
        );

      insert into storage.objects (id, bucket_id, name, owner_id) values
        (
          '${ownerIdObject}',
          'unrelated-service-bucket',
          'not-an-owner-path.webp',
          '${signalOwner}'
        ),
        (
          '${legacyObject}',
          'recipe-images',
          '${signalOwner}/${legacyObject}.webp',
          null
        ),
        (
          '${duplicateObject}',
          'recipe-images',
          '${signalOwner}/${duplicateObject}.png',
          '${signalOwner}'
        ),
        (
          '${registryObject}',
          'recipe-images-private',
          '${signalOwner}/1/${registryObject}.webp',
          null
        ),
        (
          '${otherGenerationObject}',
          'recipe-images-private',
          '${signalOwner}/2/${otherGenerationObject}.webp',
          null
        ),
        (
          gen_random_uuid(),
          'recipe-images',
          'prefix-${signalOwner}/${legacyObject}.webp',
          null
        ),
        (
          gen_random_uuid(),
          'unrelated-service-bucket',
          '${signalOwner}/${legacyObject}.webp',
          null
        );

      set local role service_role;
      select concat_ws(
        ':',
        owner_id_signal_count,
        legacy_owner_path_signal_count,
        registry_signal_count,
        union_signal_count,
        union_zero
      )
      from public.inspect_recipe_image_expected_owner_signal(
        '${signalOwner}',
        1
      );
      reset role;
      rollback;
    `)).toBe("2:2:1:4:f");

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at
      ) values (
        '${tombstoneObject}',
        '${signalOwner}',
        1,
        'recipe-images-private',
        '${signalOwner}/1/${tombstoneObject}.webp',
        'private',
        'verified_not_found',
        1,
        '2030-07-24T00:05:00Z'
      );

      set local role service_role;
      select concat_ws(
        ':',
        owner_id_signal_count,
        legacy_owner_path_signal_count,
        registry_signal_count,
        union_signal_count,
        union_zero
      )
      from public.inspect_recipe_image_expected_owner_signal(
        '${signalOwner}',
        1
      );
      reset role;
      rollback;
    `)).toBe("0:0:0:0:t");
  });

  it("replays expected-owner signal authority without exposing it to normal roles", () => {
    const replay = psqlFileResult(
      IMAGE_EXPECTED_OWNER_SIGNAL_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.inspect_recipe_image_expected_owner_signal(uuid,bigint)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.inspect_recipe_image_expected_owner_signal(uuid,bigint)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.inspect_recipe_image_expected_owner_signal(uuid,bigint)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");
  });

  it("keeps expected-owner inspection inactive in legacy and rejects stale isolation", () => {
    const legacy = psqlResult(`
      begin;
      set local role service_role;
      select *
      from public.inspect_recipe_image_expected_owner_signal(
        '${OWNER_ACTIVE}',
        1
      );
    `);
    expect(legacy.status).not.toBe(0);
    expect(legacy.stderr).toContain(
      "expected owner signal inspection is inactive",
    );

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select *
      from public.inspect_recipe_image_expected_owner_signal(
        '${OWNER_ACTIVE}',
        1
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toContain(
      "expected owner signal inspection requires READ COMMITTED",
    );

    const missingCapability = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      delete from public.account_generation_capability_state
      where singleton;
      set local role service_role;
      select *
      from public.inspect_recipe_image_expected_owner_signal(
        '${OWNER_ACTIVE}',
        1
      );
    `);
    expect(missingCapability.status).not.toBe(0);
    expect(missingCapability.stderr).toContain(
      "expected owner signal inspection is inactive",
    );
  });

  it("proves Auth deletion readiness only for contiguous terminal cleanup and owner-zero", () => {
    const readinessOwner = "00000000-0000-4000-8000-000000000401";
    const deletedObject = "00000000-0000-4000-8000-000000000402";
    const absentObject = "00000000-0000-4000-8000-000000000403";
    const storageObject = "00000000-0000-4000-8000-000000000404";
    const authSnapshot = "2030-07-24T00:00:00Z";
    const now = "2030-07-24T01:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at
      ) values (
        '${readinessOwner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        2,
        0,
        '${authSnapshot}'
      );

      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        next_attempt_at
      ) values (
        '${readinessOwner}',
        1,
        '${authSnapshot}',
        'pending',
        '${authSnapshot}'
      );

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at
      ) values
        (
          '${deletedObject}',
          '${readinessOwner}',
          1,
          'recipe-images-private',
          '${readinessOwner}/1/${deletedObject}.webp',
          'private',
          'deleted',
          1,
          '${now}'
        ),
        (
          '${absentObject}',
          '${readinessOwner}',
          1,
          'recipe-images-private',
          '${readinessOwner}/1/${absentObject}.webp',
          'private',
          'verified_not_found',
          2,
          '${now}'
        );

      insert into public.storage_object_deletion_outbox (
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        terminal_result,
        next_attempt_at
      ) values
        (
          'recipe-images-private',
          '${readinessOwner}/1/${deletedObject}.webp',
          '${readinessOwner}',
          1,
          1,
          'account_delete',
          'succeeded',
          'deleted',
          '${authSnapshot}'
        ),
        (
          'recipe-images-private',
          '${readinessOwner}/1/${absentObject}.webp',
          '${readinessOwner}',
          1,
          2,
          'account_delete',
          'succeeded',
          'verified_not_found',
          '${authSnapshot}'
        );

      create temp table readiness_results (
        step integer primary key,
        result text not null
      ) on commit drop;
      grant insert, select on readiness_results to service_role;

      set local role service_role;
      insert into readiness_results
      select 1, concat_ws(
        ':',
        lifecycle_ready,
        auth_outbox_due_count,
        required_cleanup_generation,
        terminal_cleanup_generation_count,
        storage_nonterminal_count,
        storage_dead_letter_count,
        storage_generation_mismatch_count,
        registry_nonterminal_count,
        registry_generation_mismatch_count,
        owner_signal_union_count,
        owner_signal_union_zero,
        ready
      )
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${readinessOwner}',
        1,
        '${now}'
      );
      reset role;

      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '${storageObject}',
        'recipe-images-private',
        '${readinessOwner}/1/${deletedObject}.webp',
        null
      );

      set local role service_role;
      insert into readiness_results
      select 2, concat_ws(
        ':',
        owner_signal_union_count,
        owner_signal_union_zero,
        ready
      )
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${readinessOwner}',
        1,
        '${now}'
      );
      reset role;

      delete from storage.objects where id = '${storageObject}';
      update public.storage_object_deletion_outbox
      set state = 'dead_letter',
          terminal_result = null
      where owner_uuid = '${readinessOwner}'
        and cleanup_generation = 2;
      update public.recipe_image_objects
      set state = 'cleanup_pending',
          next_terminal_scan_at = null
      where id = '${absentObject}';

      set local role service_role;
      insert into readiness_results
      select 3, concat_ws(
        ':',
        terminal_cleanup_generation_count,
        storage_nonterminal_count,
        storage_dead_letter_count,
        registry_nonterminal_count,
        owner_signal_union_count,
        ready
      )
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${readinessOwner}',
        1,
        '${now}'
      );
      reset role;

      update public.storage_object_deletion_outbox
      set state = 'succeeded',
          terminal_result = 'verified_not_found'
      where owner_uuid = '${readinessOwner}'
        and cleanup_generation = 2;
      update public.recipe_image_objects
      set state = 'verified_not_found',
          next_terminal_scan_at = '${now}'
      where id = '${absentObject}';
      update public.auth_identity_deletion_outbox
      set next_attempt_at = '2030-07-24T02:00:00Z'
      where owner_uuid = '${readinessOwner}'
        and account_generation = 1;

      set local role service_role;
      insert into readiness_results
      select 4, concat_ws(
        ':',
        auth_outbox_due_count,
        ready
      )
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${readinessOwner}',
        1,
        '${now}'
      );
      reset role;

      update public.auth_identity_deletion_outbox
      set next_attempt_at = '${authSnapshot}'
      where owner_uuid = '${readinessOwner}'
        and account_generation = 1;
      delete from public.storage_object_deletion_outbox
      where owner_uuid = '${readinessOwner}'
        and cleanup_generation = 1;

      set local role service_role;
      insert into readiness_results
      select 5, concat_ws(
        ':',
        terminal_cleanup_generation_count,
        required_cleanup_generation,
        ready
      )
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${readinessOwner}',
        1,
        '${now}'
      );
      reset role;

      select string_agg(result, ';' order by step)
      from readiness_results;
      rollback;
    `)).toBe(
      "t:1:2:2:0:0:0:0:0:0:t:t;1:f:f;1:1:1:1:0:f;0:f;1:2:f",
    );
  });

  it("replays Auth deletion readiness as a service-only authority", () => {
    const replay = psqlFileResult(
      IMAGE_AUTH_DELETION_READINESS_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.inspect_recipe_image_auth_deletion_readiness(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.inspect_recipe_image_auth_deletion_readiness(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.inspect_recipe_image_auth_deletion_readiness(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");
  });

  it("claims only one ready Auth deletion identity epoch", () => {
    const claimOwner = "00000000-0000-4000-8000-000000000410";
    const claimOutbox = "00000000-0000-4000-8000-000000000411";
    const claimLease = "00000000-0000-4000-8000-000000000412";
    const authSnapshot = "2030-07-25T00:00:00Z";
    const now = "2030-07-25T01:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at
      ) values (
        '${claimOwner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        0,
        0,
        '${authSnapshot}'
      );

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        next_attempt_at
      ) values (
        '${claimOutbox}',
        '${claimOwner}',
        1,
        '${authSnapshot}',
        'pending',
        '${authSnapshot}'
      );

      set local role service_role;
      select concat_ws(
        ':',
        claimed ->> 'id',
        claimed ->> 'owner_uuid',
        claimed ->> 'account_generation',
        claimed ->> 'state',
        claimed ->> 'attempts',
        claimed ->> 'lease_token'
      )
      from (
        select public.claim_recipe_image_auth_deletion_if_ready(
          '${claimOutbox}',
          '${claimOwner}',
          1,
          '${claimLease}',
          '${now}'
        ) as claimed
      ) as result;
      rollback;
    `)).toBe(
      `${claimOutbox}:${claimOwner}:1:processing:1:${claimLease}`,
    );
  });

  it("rejects a different outbox identity and nonzero owner evidence before claim", () => {
    const claimOwner = "00000000-0000-4000-8000-000000000420";
    const claimOutbox = "00000000-0000-4000-8000-000000000421";
    const otherOutbox = "00000000-0000-4000-8000-000000000422";
    const claimLease = "00000000-0000-4000-8000-000000000423";
    const storageObject = "00000000-0000-4000-8000-000000000424";
    const authSnapshot = "2030-07-25T02:00:00Z";
    const now = "2030-07-25T03:00:00Z";
    const fixture = `
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at
      ) values (
        '${claimOwner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        0,
        0,
        '${authSnapshot}'
      );

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        next_attempt_at
      ) values
        (
          '${claimOutbox}',
          '${claimOwner}',
          1,
          '${authSnapshot}',
          'pending',
          '${authSnapshot}'
        ),
        (
          '${otherOutbox}',
          '${OWNER_ACTIVE}',
          1,
          '${authSnapshot}',
          'pending',
          '${authSnapshot}'
        );
    `;

    const mismatched = psqlResult(`
      begin;
      ${fixture}
      set local role service_role;
      select public.claim_recipe_image_auth_deletion_if_ready(
        '${otherOutbox}',
        '${claimOwner}',
        1,
        '${claimLease}',
        '${now}'
      );
    `);
    expect(mismatched.status).not.toBe(0);
    expect(mismatched.stderr).toContain(
      "Auth deletion outbox claim identity compare-and-swap failed",
    );

    const ownerSignal = psqlResult(`
      begin;
      ${fixture}
      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '${storageObject}',
        'recipe-images-private',
        '${claimOwner}/1/unregistered.webp',
        '${claimOwner}'
      );
      set local role service_role;
      select public.claim_recipe_image_auth_deletion_if_ready(
        '${claimOutbox}',
        '${claimOwner}',
        1,
        '${claimLease}',
        '${now}'
      );
    `);
    expect(ownerSignal.status).not.toBe(0);
    expect(ownerSignal.stderr).toContain(
      "Auth deletion cleanup evidence is not ready",
    );
  });

  it("replays guarded Auth deletion claim without opening legacy consumer grants", () => {
    const replay = psqlFileResult(
      IMAGE_AUTH_DELETION_CLAIM_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.claim_recipe_image_auth_deletion_if_ready(uuid,uuid,bigint,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.claim_recipe_image_auth_deletion_if_ready(uuid,uuid,bigint,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.claim_recipe_image_auth_deletion_if_ready(uuid,uuid,bigint,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.claim_auth_identity_deletion_outbox(uuid,uuid,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.finalize_auth_identity_deletion_outbox(uuid,uuid,integer,text,text,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t:f:f");
  });

  it("finalizes one exact terminal Auth deletion lease and resolves the lifecycle atomically", () => {
    const owner = "00000000-0000-4000-8000-000000000430";
    const outbox = "00000000-0000-4000-8000-000000000431";
    const lease = "00000000-0000-4000-8000-000000000432";
    const authSnapshot = "2030-07-25T04:00:00Z";
    const now = "2030-07-25T05:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at
      ) values (
        '${owner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        0,
        0,
        '${authSnapshot}'
      );

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        attempts,
        lease_token,
        lease_expires_at,
        next_attempt_at
      ) values (
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        'processing',
        1,
        '${lease}',
        '${now}'::timestamptz + interval '2 minutes',
        '${authSnapshot}'
      );

      set local role service_role;
      select public.finalize_recipe_image_auth_deletion_claim(
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        '${lease}',
        1,
        'deleted',
        null,
        '${now}'
      );
      reset role;
      select concat_ws(
        ':',
        outbox.id,
        outbox.state,
        outbox.terminal_result,
        (
          lifecycle.auth_identity_deleted_at = '${now}'
          and lifecycle.revision = 2
        )
      )
      from public.auth_identity_deletion_outbox as outbox
      join public.user_account_lifecycles as lifecycle
        on lifecycle.owner_uuid = outbox.owner_uuid
       and lifecycle.account_generation = outbox.account_generation
      where outbox.id = '${outbox}';
      rollback;
    `)).toBe(`${outbox}:succeeded:deleted:t`);
  });

  it("keeps a retryable Auth deletion failure unresolved", () => {
    const owner = "00000000-0000-4000-8000-000000000440";
    const outbox = "00000000-0000-4000-8000-000000000441";
    const lease = "00000000-0000-4000-8000-000000000442";
    const authSnapshot = "2030-07-25T06:00:00Z";
    const now = "2030-07-25T07:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at
      ) values (
        '${owner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        0,
        0,
        '${authSnapshot}'
      );

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        attempts,
        lease_token,
        lease_expires_at,
        next_attempt_at
      ) values (
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        'processing',
        1,
        '${lease}',
        '${now}'::timestamptz + interval '2 minutes',
        '${authSnapshot}'
      );

      set local role service_role;
      select public.finalize_recipe_image_auth_deletion_claim(
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        '${lease}',
        1,
        null,
        'ADMIN_DELETE_FAILED',
        '${now}'
      );
      reset role;
      select concat_ws(
        ':',
        outbox.state,
        lifecycle.auth_identity_deleted_at is null
      )
      from public.auth_identity_deletion_outbox as outbox
      join public.user_account_lifecycles as lifecycle
        on lifecycle.owner_uuid = outbox.owner_uuid
       and lifecycle.account_generation = outbox.account_generation
      where outbox.id = '${outbox}';
      rollback;
    `)).toBe("failed:t");
  });

  it("rejects a stale Auth deletion finalize attempt and preserves the lease", () => {
    const owner = "00000000-0000-4000-8000-000000000450";
    const outbox = "00000000-0000-4000-8000-000000000451";
    const lease = "00000000-0000-4000-8000-000000000452";
    const authSnapshot = "2030-07-25T08:00:00Z";
    const now = "2030-07-25T09:00:00Z";

    const stale = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at
      ) values (
        '${owner}',
        1,
        '${authSnapshot}',
        'cleanup_pending',
        '${authSnapshot}'
      );
      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        attempts,
        lease_token,
        lease_expires_at
      ) values (
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        'processing',
        1,
        '${lease}',
        '${now}'::timestamptz + interval '2 minutes'
      );
      set local role service_role;
      select public.finalize_recipe_image_auth_deletion_claim(
        '${outbox}',
        '${owner}',
        1,
        '${authSnapshot}',
        '${lease}',
        2,
        'deleted',
        null,
        '${now}'
      );
    `);
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain(
      "Auth deletion outbox finalize compare-and-swap failed",
    );
  });

  it("replays guarded Auth deletion finalize without opening the legacy grant", () => {
    const replay = psqlFileResult(
      IMAGE_AUTH_DELETION_FINALIZE_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.finalize_recipe_image_auth_deletion_claim(uuid,uuid,bigint,timestamp with time zone,uuid,integer,text,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.finalize_recipe_image_auth_deletion_claim(uuid,uuid,bigint,timestamp with time zone,uuid,integer,text,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.finalize_recipe_image_auth_deletion_claim(uuid,uuid,bigint,timestamp with time zone,uuid,integer,text,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.finalize_auth_identity_deletion_outbox(uuid,uuid,integer,text,text,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.claim_recipe_image_auth_deletion_if_ready(uuid,uuid,bigint,uuid,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t:f:t");
  });

  it("pages due Auth deletion candidates without claiming or starving later rows", () => {
    const ownerOne = "00000000-0000-4000-8000-000000000460";
    const ownerTwo = "00000000-0000-4000-8000-000000000461";
    const ownerThree = "00000000-0000-4000-8000-000000000462";
    const outboxOne = "00000000-0000-4000-8000-000000000470";
    const outboxTwo = "00000000-0000-4000-8000-000000000471";
    const outboxThree = "00000000-0000-4000-8000-000000000472";
    const epoch = "2030-07-25T10:00:00Z";
    const firstDue = "2030-07-25T10:05:00Z";
    const secondDue = "2030-07-25T10:10:00Z";
    const thirdDue = "2030-07-25T10:15:00Z";
    const now = "2030-07-25T11:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at
      ) values
        ('${ownerOne}', 1, '${epoch}', 'cleanup_pending', '${epoch}'),
        ('${ownerTwo}', 1, '${epoch}', 'cleanup_pending', '${epoch}'),
        ('${ownerThree}', 1, '${epoch}', 'cleanup_pending', '${epoch}');

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        attempts,
        lease_token,
        lease_expires_at,
        next_attempt_at
      ) values
        (
          '${outboxOne}',
          '${ownerOne}',
          1,
          '${epoch}',
          'pending',
          0,
          null,
          null,
          '${firstDue}'
        ),
        (
          '${outboxTwo}',
          '${ownerTwo}',
          1,
          '${epoch}',
          'failed',
          1,
          null,
          null,
          '${secondDue}'
        ),
        (
          '${outboxThree}',
          '${ownerThree}',
          1,
          '${epoch}',
          'processing',
          1,
          '00000000-0000-4000-8000-000000000473',
          '${thirdDue}',
          '${thirdDue}'
        );

      set local role service_role;
      with first_page as (
        select *
        from public.list_recipe_image_auth_deletion_candidates(
          2,
          '${now}',
          null,
          null
        )
      ),
      second_page as (
        select *
        from public.list_recipe_image_auth_deletion_candidates(
          2,
          '${now}',
          '${secondDue}',
          '${outboxTwo}'
        )
      )
      select concat_ws(
        ':',
        (
          select string_agg(outbox_id::text, ',' order by next_attempt_at, outbox_id)
          from first_page
        ),
        (
          select string_agg(outbox_id::text, ',' order by next_attempt_at, outbox_id)
          from second_page
        )
      );
      rollback;
    `)).toBe(`${outboxOne},${outboxTwo}:${outboxThree}`);
  });

  it("excludes future, resolved, active and identity-mismatched Auth candidates", () => {
    const pendingOwner = "00000000-0000-4000-8000-000000000480";
    const activeOwner = "00000000-0000-4000-8000-000000000481";
    const resolvedOwner = "00000000-0000-4000-8000-000000000482";
    const mismatchOwner = "00000000-0000-4000-8000-000000000483";
    const epoch = "2030-07-25T12:00:00Z";
    const laterEpoch = "2030-07-25T12:30:00Z";
    const now = "2030-07-25T13:00:00Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values
        ('${pendingOwner}', 1, '${epoch}', 'cleanup_pending', '${epoch}', null),
        ('${activeOwner}', 1, '${epoch}', 'active', '${epoch}', null),
        ('${resolvedOwner}', 1, '${epoch}', 'cleanup_pending', '${epoch}', '${now}'),
        ('${mismatchOwner}', 1, '${laterEpoch}', 'cleanup_pending', '${epoch}', null);

      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        next_attempt_at
      ) values
        ('00000000-0000-4000-8000-000000000490', '${pendingOwner}', 1, '${epoch}', 'pending', '${now}'::timestamptz + interval '1 hour'),
        ('00000000-0000-4000-8000-000000000491', '${activeOwner}', 1, '${epoch}', 'pending', '${epoch}'),
        ('00000000-0000-4000-8000-000000000492', '${resolvedOwner}', 1, '${epoch}', 'pending', '${epoch}'),
        ('00000000-0000-4000-8000-000000000493', '${mismatchOwner}', 1, '${epoch}', 'pending', '${epoch}');

      set local role service_role;
      select count(*)
      from public.list_recipe_image_auth_deletion_candidates(
        50,
        '${now}',
        null,
        null
      );
      rollback;
    `)).toBe("0");
  });

  it("replays Auth candidate discovery with service-only execute access", () => {
    const replay = psqlFileResult(
      IMAGE_AUTH_DELETION_CANDIDATE_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.list_recipe_image_auth_deletion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.list_recipe_image_auth_deletion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_recipe_image_auth_deletion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");
  });

  it("pages only completion-ready lifecycles without blocked-row starvation", () => {
    const blockedOwner = "00000000-0000-4000-8000-000000000494";
    const firstReadyOwner = "00000000-0000-4000-8000-000000000495";
    const secondReadyOwner = "00000000-0000-4000-8000-000000000496";
    const epoch = "2030-07-25T02:00:00.123456Z";
    const blockedAt = "2030-07-25T02:30:00.123456Z";
    const firstReadyAt = "2030-07-25T02:45:00.123456Z";
    const secondReadyAt = "2030-07-25T03:00:00.123456Z";
    const now = "2030-07-25T04:00:00.123456Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values
        (
          '${blockedOwner}', 1, '${epoch}', 'cleanup_pending',
          '${epoch}', '${blockedAt}'
        ),
        (
          '${firstReadyOwner}', 1, '${epoch}', 'cleanup_pending',
          '${epoch}', '${firstReadyAt}'
        ),
        (
          '${secondReadyOwner}', 1, '${epoch}', 'cleanup_pending',
          '${epoch}', '${secondReadyAt}'
        );

      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values
        (
          '${blockedOwner}', 1, '${epoch}', 'dead_letter',
          null, '${epoch}'
        ),
        (
          '${firstReadyOwner}', 1, '${epoch}', 'succeeded',
          'already_absent', '${epoch}'
        ),
        (
          '${secondReadyOwner}', 1, '${epoch}', 'succeeded',
          'identity_replaced', '${epoch}'
        );

      set local role service_role;
      with first_page as (
        select *
        from public.list_recipe_image_lifecycle_completion_candidates(
          1,
          '${now}',
          null,
          null,
          null
        )
      ),
      second_page as (
        select *
        from public.list_recipe_image_lifecycle_completion_candidates(
          1,
          '${now}',
          '${firstReadyAt}',
          '${firstReadyOwner}',
          1
        )
      )
      select concat_ws(
        ':',
        (select owner_uuid from first_page),
        (select auth_identity_deleted_at = '${firstReadyAt}' from first_page),
        (select owner_uuid from second_page),
        (select auth_identity_deleted_at = '${secondReadyAt}' from second_page)
      );
      rollback;
    `)).toBe(
      `${firstReadyOwner}:t:${secondReadyOwner}:t`,
    );
  });

  it("returns only evidence that the exact completion authority accepts", () => {
    const owner = "00000000-0000-4000-8000-000000000497";
    const epoch = "2030-07-25T05:00:00.123456Z";
    const deletedAt = "2030-07-25T05:30:00.123456Z";
    const now = "2030-07-25T06:00:00.123456Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${owner}', 1, '${epoch}', 'cleanup_pending',
        '${epoch}', '${deletedAt}'
      );
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        '${owner}', 1, '${epoch}', 'succeeded',
        'deleted', '${epoch}'
      );

      create temp table completion_candidate (
        owner_uuid uuid not null,
        account_generation bigint not null
      ) on commit drop;
      grant insert, select on completion_candidate to service_role;

      set local role service_role;
      insert into completion_candidate
      select candidate.owner_uuid, candidate.account_generation
      from public.list_recipe_image_lifecycle_completion_candidates(
        50,
        '${now}',
        null,
        null,
        null
      ) as candidate
      where candidate.owner_uuid = '${owner}';
      select public.complete_recipe_image_account_lifecycle(
        '${owner}',
        1,
        '${now}'
      );
      reset role;

      select concat_ws(
        ':',
        (select count(*) from completion_candidate),
        lifecycle.status,
        lifecycle.completed_cleanup_generation
      )
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = '${owner}'
        and lifecycle.account_generation = 1;
      rollback;
    `)).toBe("1:complete:0");
  });

  it("keeps candidate inclusion in differential parity with completion", () => {
    const readyOwner = "00000000-0000-4000-8000-000000000498";
    const authBlockedOwner = "00000000-0000-4000-8000-000000000499";
    const generationGapOwner = "00000000-0000-4000-8000-00000000049a";
    const ownerSignalOwner = "00000000-0000-4000-8000-00000000049b";
    const ownerSignalObject = "00000000-0000-4000-8000-00000000049c";
    const epoch = "2030-07-25T07:00:00.123456Z";
    const deletedAt = "2030-07-25T07:30:00.123456Z";
    const now = "2030-07-25T08:00:00.123456Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values
        (
          '${readyOwner}', 1, '${epoch}', 'cleanup_pending',
          0, '${epoch}', '${deletedAt}'
        ),
        (
          '${authBlockedOwner}', 1, '${epoch}', 'cleanup_pending',
          0, '${epoch}', '${deletedAt}'
        ),
        (
          '${generationGapOwner}', 1, '${epoch}', 'cleanup_pending',
          1, '${epoch}', '${deletedAt}'
        ),
        (
          '${ownerSignalOwner}', 1, '${epoch}', 'cleanup_pending',
          0, '${epoch}', '${deletedAt}'
        );

      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values
        (
          '${readyOwner}', 1, '${epoch}', 'succeeded',
          'deleted', '${epoch}'
        ),
        (
          '${authBlockedOwner}', 1, '${epoch}', 'dead_letter',
          null, '${epoch}'
        ),
        (
          '${generationGapOwner}', 1, '${epoch}', 'succeeded',
          'deleted', '${epoch}'
        ),
        (
          '${ownerSignalOwner}', 1, '${epoch}', 'succeeded',
          'deleted', '${epoch}'
        );

      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '${ownerSignalObject}',
        'recipe-images-private',
        '${ownerSignalOwner}/1/unregistered.webp',
        '${ownerSignalOwner}'
      );

      create temp table completion_candidate_snapshot (
        owner_uuid uuid primary key
      ) on commit drop;
      create temp table completion_differential_results (
        owner_uuid uuid primary key,
        succeeded boolean not null
      ) on commit drop;
      grant insert, select on completion_candidate_snapshot
        to service_role;

      set local role service_role;
      insert into completion_candidate_snapshot
      select candidate.owner_uuid
      from public.list_recipe_image_lifecycle_completion_candidates(
        50,
        '${now}',
        null,
        null,
        null
      ) as candidate
      where candidate.owner_uuid in (
        '${readyOwner}',
        '${authBlockedOwner}',
        '${generationGapOwner}',
        '${ownerSignalOwner}'
      );
      reset role;

      do $matrix$
      declare
        v_owner uuid;
        v_succeeded boolean;
      begin
        foreach v_owner in array array[
          '${readyOwner}'::uuid,
          '${authBlockedOwner}'::uuid,
          '${generationGapOwner}'::uuid,
          '${ownerSignalOwner}'::uuid
        ] loop
          begin
            perform public.complete_recipe_image_account_lifecycle(
              v_owner,
              1,
              '${now}'
            );
            v_succeeded := true;
          exception
            when others then
              v_succeeded := false;
          end;

          insert into completion_differential_results
          values (v_owner, v_succeeded);
        end loop;
      end;
      $matrix$;

      select concat_ws(
        ':',
        (select count(*) from completion_candidate_snapshot),
        (
          select bool_and(
            exists (
              select 1
              from completion_candidate_snapshot as candidate
              where candidate.owner_uuid = result.owner_uuid
            ) = result.succeeded
          )
          from completion_differential_results as result
        ),
        (
          select count(*)
          from completion_differential_results
          where succeeded
        )
      );
      rollback;
    `)).toBe("1:t:1");
  });

  it("replays completion candidates as service-only and fails closed when inactive", () => {
    const replay = psqlFileResult(
      IMAGE_LIFECYCLE_COMPLETION_CANDIDATE_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.list_recipe_image_lifecycle_completion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid,bigint)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.list_recipe_image_lifecycle_completion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid,bigint)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_recipe_image_lifecycle_completion_candidates(integer,timestamp with time zone,timestamp with time zone,uuid,bigint)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");

    const legacy = psqlResult(`
      begin;
      set local role service_role;
      select *
      from public.list_recipe_image_lifecycle_completion_candidates(
        50,
        now(),
        null,
        null,
        null
      );
    `);
    expect(legacy.status).not.toBe(0);
    expect(legacy.stderr).toContain(
      "Lifecycle completion candidate page is inactive",
    );

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select *
      from public.list_recipe_image_lifecycle_completion_candidates(
        50,
        now(),
        null,
        null,
        null
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toContain(
      "Lifecycle completion candidate page requires READ COMMITTED",
    );
  });

  it("completes one exact lifecycle only after every terminal barrier is closed", () => {
    const owner = "00000000-0000-4000-8000-000000000500";
    const absentObject = "00000000-0000-4000-8000-000000000502";
    const epoch = "2030-07-26T00:00:00.123456Z";
    const now = "2030-07-26T01:00:00.654321Z";

    expect(psql(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${owner}',
        1,
        '${epoch}',
        'cleanup_pending',
        2,
        0,
        '${epoch}',
        '${now}'::timestamptz - interval '1 minute'
      );

      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        '${owner}',
        1,
        '${epoch}',
        'succeeded',
        'deleted',
        '${epoch}'
      );

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at
      ) values (
        '${absentObject}',
        '${owner}',
        1,
        'recipe-images-private',
        '${owner}/1/${absentObject}.webp',
        'private',
        'verified_not_found',
        2,
        '${now}'
      );

      insert into public.storage_object_deletion_outbox (
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        terminal_result,
        next_attempt_at
      ) values
        (
          'recipe-images-private',
          '${owner}/1/${absentObject}.webp',
          '${owner}',
          1,
          1,
          'account_delete',
          'succeeded',
          'deleted',
          '${epoch}'
        ),
        (
          'recipe-images-private',
          '${owner}/1/${absentObject}.webp',
          '${owner}',
          1,
          2,
          'late_terminal_object',
          'succeeded',
          'verified_not_found',
          '${epoch}'
        );

      create temp table completion_results (
        step integer primary key,
        result jsonb not null
      ) on commit drop;
      grant insert, select on completion_results to service_role;

      set local role service_role;
      insert into completion_results
      values (
        1,
        public.complete_recipe_image_account_lifecycle(
          '${owner}',
          1,
          '${now}'
        )
      );
      insert into completion_results
      values (
        2,
        public.complete_recipe_image_account_lifecycle(
          '${owner}',
          1,
          '${now}'::timestamptz + interval '1 minute'
        )
      );
      reset role;

      select concat_ws(
        ':',
        (
          select result ->> 'changed'
          from completion_results
          where step = 1
        ),
        (
          select result ->> 'changed'
          from completion_results
          where step = 2
        ),
        lifecycle.status,
        lifecycle.required_cleanup_generation,
        lifecycle.completed_cleanup_generation,
        lifecycle.revision,
        lifecycle.updated_at = '${now}'
      )
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = '${owner}'
        and lifecycle.account_generation = 1;
      rollback;
    `)).toBe("true:false:complete:2:2:2:t");
  });

  it("rejects cleanup-generation gaps and mismatched terminal object evidence", () => {
    const gapOwner = "00000000-0000-4000-8000-000000000510";
    const gapObject = "00000000-0000-4000-8000-000000000511";
    const mismatchOwner = "00000000-0000-4000-8000-000000000512";
    const mismatchObject = "00000000-0000-4000-8000-000000000513";
    const outboxOnlyOwner = "00000000-0000-4000-8000-000000000514";
    const epoch = "2030-07-26T02:00:00Z";
    const now = "2030-07-26T03:00:00Z";

    const fixture = (
      owner: string,
      object: string,
      requiredGeneration: number,
      cleanupGeneration: number,
      objectState: "deleted" | "verified_not_found",
      terminalResult: "deleted" | "verified_not_found",
    ) => `
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${owner}', 1, '${epoch}', 'cleanup_pending',
        ${requiredGeneration}, 0, '${epoch}', '${now}'
      );
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        '${owner}', 1, '${epoch}', 'succeeded', 'deleted', '${epoch}'
      );
      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        visibility,
        state,
        cleanup_generation,
        next_terminal_scan_at
      ) values (
        '${object}', '${owner}', 1, 'recipe-images-private',
        '${owner}/1/${object}.webp', 'private', '${objectState}',
        ${cleanupGeneration}, '${now}'
      );
      insert into public.storage_object_deletion_outbox (
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        'recipe-images-private', '${owner}/1/${object}.webp',
        '${owner}', 1, ${cleanupGeneration}, 'account_delete',
        'succeeded', '${terminalResult}', '${epoch}'
      );
    `;

    const gap = psqlResult(`
      begin;
      ${fixture(gapOwner, gapObject, 2, 2, "deleted", "deleted")}
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${gapOwner}',
        1,
        '${now}'
      );
    `);
    expect(gap.status).not.toBe(0);
    expect(gap.stderr).toContain(
      "Lifecycle completion terminal evidence is not ready",
    );

    const mismatch = psqlResult(`
      begin;
      ${fixture(
        mismatchOwner,
        mismatchObject,
        1,
        1,
        "deleted",
        "verified_not_found",
      )}
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${mismatchOwner}',
        1,
        '${now}'
      );
    `);
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain(
      "Lifecycle completion terminal evidence is not ready",
    );

    const outboxOnly = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        required_cleanup_generation,
        completed_cleanup_generation,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${outboxOnlyOwner}', 1, '${epoch}', 'cleanup_pending',
        1, 0, '${epoch}', '${now}'
      );
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        '${outboxOnlyOwner}',
        1,
        '${epoch}',
        'succeeded',
        'deleted',
        '${epoch}'
      );
      insert into public.storage_object_deletion_outbox (
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        'recipe-images-private',
        '${outboxOnlyOwner}/1/00000000-0000-4000-8000-000000000515.webp',
        '${outboxOnlyOwner}',
        1,
        1,
        'account_delete',
        'succeeded',
        'deleted',
        '${epoch}'
      );
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${outboxOnlyOwner}',
        1,
        '${now}'
      );
    `);
    expect(outboxOnly.status).not.toBe(0);
    expect(outboxOnly.stderr).toContain(
      "Lifecycle completion terminal evidence is not ready",
    );
  });

  it("rejects unresolved Auth deletion and nonzero expected-owner evidence", () => {
    const authOwner = "00000000-0000-4000-8000-000000000520";
    const signalOwner = "00000000-0000-4000-8000-000000000521";
    const signalObject = "00000000-0000-4000-8000-000000000522";
    const epoch = "2030-07-26T04:00:00Z";
    const now = "2030-07-26T05:00:00Z";

    const authPending = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${authOwner}', 1, '${epoch}', 'cleanup_pending', '${epoch}', '${now}'
      );
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        next_attempt_at
      ) values (
        '${authOwner}', 1, '${epoch}', 'dead_letter', '${epoch}'
      );
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${authOwner}',
        1,
        '${now}'
      );
    `);
    expect(authPending.status).not.toBe(0);
    expect(authPending.stderr).toContain(
      "Lifecycle completion terminal evidence is not ready",
    );

    const ownerSignal = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        status,
        personal_db_deleted_at,
        auth_identity_deleted_at
      ) values (
        '${signalOwner}', 1, '${epoch}', 'cleanup_pending', '${epoch}', '${now}'
      );
      insert into public.auth_identity_deletion_outbox (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state,
        terminal_result,
        next_attempt_at
      ) values (
        '${signalOwner}', 1, '${epoch}', 'succeeded', 'deleted', '${epoch}'
      );
      insert into storage.objects (
        id,
        bucket_id,
        name,
        owner_id
      ) values (
        '${signalObject}',
        'recipe-images-private',
        '${signalOwner}/1/unregistered.webp',
        '${signalOwner}'
      );
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${signalOwner}',
        1,
        '${now}'
      );
    `);
    expect(ownerSignal.status).not.toBe(0);
    expect(ownerSignal.stderr).toContain(
      "Lifecycle completion terminal evidence is not ready",
    );
  });

  it("replays lifecycle completion as service-only and fails closed before activation", () => {
    const replay = psqlFileResult(
      IMAGE_LIFECYCLE_COMPLETION_MIGRATION_PATH,
    );
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.complete_recipe_image_account_lifecycle(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.complete_recipe_image_account_lifecycle(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.complete_recipe_image_account_lifecycle(uuid,bigint,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");

    const legacy = psqlResult(`
      begin;
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${OWNER_ACTIVE}',
        1,
        now()
      );
    `);
    expect(legacy.status).not.toBe(0);
    expect(legacy.stderr).toContain("Lifecycle completion is inactive");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select public.complete_recipe_image_account_lifecycle(
        '${OWNER_ACTIVE}',
        1,
        now()
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toContain(
      "Lifecycle completion requires READ COMMITTED",
    );
  });

  it("keeps Auth deletion readiness inactive before joint activation", () => {
    const legacy = psqlResult(`
      begin;
      set local role service_role;
      select *
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${OWNER_ACTIVE}',
        1,
        now()
      );
    `);
    expect(legacy.status).not.toBe(0);
    expect(legacy.stderr).toContain(
      "Auth deletion readiness is inactive",
    );

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select *
      from public.inspect_recipe_image_auth_deletion_readiness(
        '${OWNER_ACTIVE}',
        1,
        now()
      );
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toContain(
      "Auth deletion readiness requires READ COMMITTED",
    );
  });

  it("compacts 90-day terminal detail while preserving 91-day same-key replay", () => {
    const replay = psqlFileResult(IMAGE_COMPACT_RETENTION_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    const objectId = "00000000-0000-4000-8000-000000000390";
    const idempotencyKey = "00000000-0000-4000-8000-000000000391";
    const outboxId = "00000000-0000-4000-8000-000000000392";
    const now = "2031-01-01T00:00:00Z";

    expect(psql(`
      begin;

      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1
      where singleton;

      update public.user_account_lifecycles
      set status = 'active',
          auth_identity_created_at_snapshot = '2026-01-01T00:00:00Z'
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
        cleanup_generation,
        next_terminal_scan_at,
        created_at,
        updated_at
      ) values (
        '${objectId}',
        '${OWNER_ACTIVE}',
        1,
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/${objectId}.webp',
        repeat('b', 64),
        2048,
        'image/webp',
        'private',
        'deleted',
        1,
        '${now}'::timestamptz + interval '24 hours',
        '${now}'::timestamptz - interval '100 days',
        '${now}'::timestamptz - interval '91 days'
      );

      insert into public.storage_object_deletion_outbox (
        id,
        bucket_id,
        object_path,
        owner_uuid,
        account_generation,
        cleanup_generation,
        reason,
        state,
        terminal_result,
        attempts,
        next_attempt_at,
        last_error,
        created_at,
        updated_at
      ) values (
        '${outboxId}',
        'recipe-images-private',
        '${OWNER_ACTIVE}/1/${objectId}.webp',
        '${OWNER_ACTIVE}',
        1,
        1,
        'retention-test',
        'succeeded',
        'deleted',
        9,
        '${now}'::timestamptz - interval '91 days',
        'verbose historical detail',
        '${now}'::timestamptz - interval '100 days',
        '${now}'::timestamptz - interval '91 days'
      );

      insert into public.mutation_idempotency_keys (
        owner_uuid,
        account_generation,
        operation_scope,
        key_hash,
        payload_hash,
        state,
        terminal_result,
        durable_result,
        result_reference,
        attempts,
        reserved_byte_size,
        quota_reserved_at,
        quota_released_at,
        created_at,
        updated_at
      ) values (
        '${OWNER_ACTIVE}',
        1,
        'recipe_image_upload',
        encode(
          extensions.digest(
            pg_catalog.convert_to('${idempotencyKey}', 'UTF8'),
            'sha256'
          ),
          'hex'
        ),
        repeat('c', 64),
        'succeeded',
        'uploaded',
        jsonb_build_object(
          'object_id', '${objectId}'::uuid,
          'state', 'uploaded_unlinked'
        ),
        '${objectId}',
        7,
        2048,
        '${now}'::timestamptz - interval '91 days',
        '${now}'::timestamptz - interval '91 days',
        '${now}'::timestamptz - interval '100 days',
        '${now}'::timestamptz - interval '91 days'
      );

      insert into public.image_upload_quota_counters (
        owner_uuid,
        account_generation,
        request_events,
        byte_events,
        active_reservation_count,
        created_at,
        updated_at
      ) values (
        '${OWNER_ACTIVE}',
        1,
        jsonb_build_array(
          jsonb_build_object(
            'at', '${now}'::timestamptz - interval '91 days'
          ),
          jsonb_build_object(
            'at', '${now}'::timestamptz - interval '1 hour'
          )
        ),
        jsonb_build_array(
          jsonb_build_object(
            'at', '${now}'::timestamptz - interval '91 days',
            'bytes', 2048
          ),
          jsonb_build_object(
            'at', '${now}'::timestamptz - interval '1 hour',
            'bytes', 1024
          )
        ),
        0,
        '${now}'::timestamptz - interval '100 days',
        '${now}'::timestamptz - interval '1 hour'
      )
      on conflict (owner_uuid, account_generation)
      do update set
        request_events = excluded.request_events,
        byte_events = excluded.byte_events,
        active_reservation_count = excluded.active_reservation_count;

      set local role service_role;

      do $block$
      declare
        v_compacted record;
        v_replay jsonb;
      begin
        select *
          into v_compacted
        from public.compact_recipe_image_retention_details(
          50,
          '${now}'
        );

        if v_compacted.object_id is distinct from '${objectId}'::uuid
          or v_compacted.idempotency_rows is distinct from 1
          or v_compacted.outbox_rows is distinct from 1
          or v_compacted.quota_events_removed is distinct from 2 then
          raise exception 'unexpected compact result: %', v_compacted;
        end if;

        v_replay := public.reserve_recipe_image_upload(
          '${OWNER_ACTIVE}',
          '2026-01-01T00:00:00Z',
          repeat('a', 64),
          1,
          '${idempotencyKey}',
          repeat('c', 64),
          repeat('b', 64),
          2048,
          'image/webp',
          'webp',
          '${now}'::timestamptz + interval '1 day'
        );

        if v_replay ->> 'outcome' <> 'succeeded'
          or (v_replay ->> 'object_id')::uuid <> '${objectId}'::uuid
          or v_replay ->> 'state' <> 'deleted' then
          raise exception '91-day replay lost durable result: %', v_replay;
        end if;

        begin
          perform public.reserve_recipe_image_upload(
            '${OWNER_ACTIVE}',
            '2026-01-01T00:00:00Z',
            repeat('a', 64),
            1,
            '${idempotencyKey}',
            repeat('d', 64),
            repeat('b', 64),
            2048,
            'image/webp',
            'webp',
            '${now}'::timestamptz + interval '1 day'
          );
          raise exception 'different-payload replay unexpectedly succeeded';
        exception
          when unique_violation then
            null;
        end;
      end;
      $block$;

      reset role;

      do $block$
      declare
        v_identity record;
        v_outbox record;
        v_counter record;
      begin
        select
          owner_uuid,
          account_generation,
          operation_scope,
          key_hash,
          payload_hash,
          state,
          terminal_result,
          durable_result,
          result_reference,
          attempts,
          attempt_token,
          lease_expires_at
        into v_identity
        from public.mutation_idempotency_keys
        where result_reference = '${objectId}';

        if v_identity.owner_uuid is distinct from '${OWNER_ACTIVE}'::uuid
          or v_identity.account_generation is distinct from 1::bigint
          or v_identity.operation_scope is distinct from 'recipe_image_upload'
          or v_identity.key_hash is distinct from encode(
            extensions.digest(
              pg_catalog.convert_to('${idempotencyKey}', 'UTF8'),
              'sha256'
            ),
            'hex'
          )
          or v_identity.payload_hash is distinct from repeat('c', 64)
          or v_identity.state is distinct from 'succeeded'
          or v_identity.terminal_result is distinct from 'uploaded'
          or v_identity.durable_result is null
          or v_identity.result_reference is distinct from '${objectId}'::uuid
          or v_identity.attempts is distinct from 1
          or v_identity.attempt_token is not null
          or v_identity.lease_expires_at is not null then
          raise exception 'compact idempotency identity changed: %', v_identity;
        end if;

        select attempts, lease_token, lease_expires_at, last_error
          into v_outbox
        from public.storage_object_deletion_outbox
        where id = '${outboxId}';

        if v_outbox.attempts is distinct from 0
          or v_outbox.lease_token is not null
          or v_outbox.lease_expires_at is not null
          or v_outbox.last_error is not null then
          raise exception 'outbox detail was not compacted: %', v_outbox;
        end if;

        select request_events, byte_events
          into v_counter
        from public.image_upload_quota_counters
        where owner_uuid = '${OWNER_ACTIVE}'
          and account_generation = 1;

        if jsonb_array_length(v_counter.request_events) <> 1
          or jsonb_array_length(v_counter.byte_events) <> 1 then
          raise exception 'recent quota detail was not preserved: %', v_counter;
        end if;

        if not exists (
          select 1
          from public.recipe_image_objects
          where id = '${objectId}'
            and owner_uuid = '${OWNER_ACTIVE}'
            and account_generation = 1
            and state = 'deleted'
            and cleanup_generation = 1
            and next_terminal_scan_at =
              '${now}'::timestamptz + interval '24 hours'
        ) then
          raise exception 'permanent registry identity changed';
        end if;
      end;
      $block$;

      rollback;
      select 'compact-retention-replay-pass';
    `)).toBe("compact-retention-replay-pass");
  });

  it("keeps compact retention service-only, READ COMMITTED, and replay-safe", () => {
    const replay = psqlFileResult(IMAGE_COMPACT_RETENTION_MIGRATION_PATH);
    expect(replay.status, replay.stderr).toBe(0);

    expect(psql(`
      select concat_ws(
        ':',
        has_function_privilege(
          'anon',
          'public.compact_recipe_image_retention_details(integer,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'authenticated',
          'public.compact_recipe_image_retention_details(integer,timestamp with time zone)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.compact_recipe_image_retention_details(integer,timestamp with time zone)',
          'EXECUTE'
        )
      );
    `)).toBe("f:f:t");

    const serializable = psqlResult(`
      begin isolation level serializable;
      set local role service_role;
      select *
      from public.compact_recipe_image_retention_details(1, now());
    `);
    expect(serializable.status).not.toBe(0);
    expect(serializable.stderr).toContain(
      "Recipe image retention compaction requires READ COMMITTED",
    );
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
