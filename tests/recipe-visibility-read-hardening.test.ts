import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql",
);
const TAG_PARENT_VISIBILITY_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
);
const MANAGED_IMAGE_REGISTRY_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724110000_recipe_managed_image_registry_foundation.sql",
);

describe("recipe visibility read hardening migration", () => {
  it("adds the official visibility fields without reclassifying existing recipes as private", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);

    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /add column if not exists visibility text not null default 'public'/i,
    );
    expect(sql).toMatch(
      /add column if not exists origin_recipe_id uuid references public\.recipes\(id\) on delete restrict/i,
    );
    expect(sql).toMatch(
      /add column if not exists deleted_at timestamptz/i,
    );
    expect(sql).toMatch(
      /add column if not exists revision bigint not null default 1/i,
    );
    expect(sql).toMatch(
      /check \(visibility in \('public', 'private'\)\)/i,
    );
    expect(sql).not.toMatch(
      /update\s+public\.recipes[\s\S]*set\s+visibility\s*=\s*'private'/i,
    );
  });

  it("makes the latest account lifecycle an upper bound on direct recipe reads", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create schema if not exists recipe_visibility_guard/i,
    );
    expect(sql).toMatch(
      /create or replace function recipe_visibility_guard\.is_owner_publicly_visible\(p_owner_uuid uuid\)/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /from public\.user_account_lifecycles[\s\S]*order by account_generation desc[\s\S]*limit 1/i,
    );
    expect(sql).toMatch(
      /v_latest_status is null or v_latest_status = 'active'/i,
    );
    expect(sql).toMatch(/alter table public\.recipes enable row level security/i);
    expect(sql).toMatch(
      /create policy recipes_public_and_owner_read[\s\S]*for select[\s\S]*to anon, authenticated/i,
    );
    expect(sql).toMatch(
      /deleted_at is null[\s\S]*recipe_visibility_guard\.is_owner_publicly_visible\(created_by\)[\s\S]*visibility = 'public'[\s\S]*auth\.uid\(\) = created_by/i,
    );
    expect(sql).toMatch(
      /revoke all on function recipe_visibility_guard\.is_owner_publicly_visible\(uuid\) from public, service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function recipe_visibility_guard\.is_owner_publicly_visible\(uuid\) to anon, authenticated/i,
    );
  });

  it("isolates lifecycle reads behind a least-privilege no-login function owner", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create role homecook_recipe_visibility_guard_owner nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls/i,
    );
    expect(sql).toMatch(
      /grant select on table public\.user_account_lifecycles to homecook_recipe_visibility_guard_owner/i,
    );
    expect(sql).toMatch(
      /revoke insert, update, delete, truncate, references, trigger[\s\S]*public\.user_account_lifecycles[\s\S]*from homecook_recipe_visibility_guard_owner/i,
    );
    expect(sql).toMatch(
      /create policy recipe_visibility_guard_lifecycle_select[\s\S]*on public\.user_account_lifecycles[\s\S]*for select[\s\S]*to homecook_recipe_visibility_guard_owner/i,
    );
    expect(sql).toMatch(
      /grant create on schema recipe_visibility_guard[\s\S]*to homecook_recipe_visibility_guard_owner[\s\S]*set local role homecook_recipe_visibility_guard_owner[\s\S]*create or replace function recipe_visibility_guard\.is_owner_publicly_visible\(p_owner_uuid uuid\)[\s\S]*reset role/i,
    );
    expect(sql).not.toMatch(
      /alter function recipe_visibility_guard\.is_owner_publicly_visible\(uuid\)[\s\S]*owner to homecook_recipe_visibility_guard_owner/i,
    );
    expect(sql).toMatch(
      /server_version_num[\s\S]*grant homecook_recipe_visibility_guard_owner to %I with inherit false, set true granted by %I[\s\S]*grant homecook_recipe_visibility_guard_owner to %I/i,
    );
    expect(sql).toMatch(
      /server_version_num[\s\S]*revoke homecook_recipe_visibility_guard_owner from %I granted by %I[\s\S]*revoke homecook_recipe_visibility_guard_owner from %I/i,
    );
    expect(sql).toMatch(
      /migration runner retained set-capable recipe visibility guard membership/i,
    );
    expect(sql).toMatch(
      /homecook_recipe_visibility_guard_owner[\s\S]*recipe_visibility_guard[\s\S]*CREATE[\s\S]*recipe visibility guard owner retained schema create/i,
    );
    expect(sql).toMatch(
      /from pg_catalog\.pg_auth_members[\s\S]*granted_role\.rolname = 'homecook_recipe_visibility_guard_owner'[\s\S]*recipe visibility guard owner has unexpected members/i,
    );
    expect(sql).toMatch(
      /granted_role\.rolname = 'homecook_recipe_visibility_guard_owner'[\s\S]*admin_option[\s\S]*recipe visibility guard owner has unexpected members/i,
    );
  });

  it("bounds direct child-table reads by the visible parent recipe", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    for (const table of [
      "recipe_sources",
      "recipe_ingredients",
      "recipe_steps",
      "recipe_step_cooking_methods",
      "recipe_tags",
    ]) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }

    expect(sql).toMatch(
      /create policy recipe_sources_parent_read[\s\S]*on public\.recipe_sources[\s\S]*exists \([\s\S]*from public\.recipes[\s\S]*recipe\.id = recipe_sources\.recipe_id/i,
    );
    expect(sql).toMatch(
      /create policy recipe_ingredients_parent_read[\s\S]*on public\.recipe_ingredients[\s\S]*exists \([\s\S]*from public\.recipes[\s\S]*recipe\.id = recipe_ingredients\.recipe_id/i,
    );
    expect(sql).toMatch(
      /create policy recipe_steps_parent_read[\s\S]*on public\.recipe_steps[\s\S]*exists \([\s\S]*from public\.recipes[\s\S]*recipe\.id = recipe_steps\.recipe_id/i,
    );
    expect(sql).toMatch(
      /create policy recipe_step_cooking_methods_parent_read[\s\S]*from public\.recipe_steps[\s\S]*join public\.recipes[\s\S]*step\.id = recipe_step_cooking_methods\.step_id/i,
    );
    expect(sql).toMatch(
      /create policy recipe_tags_parent_read[\s\S]*visibility = 'public'[\s\S]*review_status = 'approved'[\s\S]*from public\.recipes[\s\S]*recipe\.id = recipe_tags\.recipe_id/i,
    );
  });

  it("redefines every public tag aggregate with the live parent predicate", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    for (const functionName of [
      "find_recipe_ids_by_public_tags",
      "list_public_recipe_tags",
      "list_home_theme_recipes",
    ]) {
      const functionMatch = sql.match(
        new RegExp(
          `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
          "i",
        ),
      );

      expect(functionMatch, `${functionName} override is missing`).not.toBeNull();
      expect(functionMatch?.[0]).toMatch(/join public\.recipes/i);
      expect(functionMatch?.[0]).toMatch(/recipe\.visibility = 'public'/i);
      expect(functionMatch?.[0]).toMatch(/recipe\.deleted_at is null/i);
      expect(functionMatch?.[0]).toMatch(
        /recipe_visibility_guard\.is_owner_publicly_visible\(recipe\.created_by\)/i,
      );
    }
  });

  it("keeps the denormalized recipe tag projection public and approved only", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    const writerMatch = sql.match(
      /create or replace function public\.set_recipe_tags\([\s\S]*?\n\$function\$;/i,
    );

    expect(writerMatch, "set_recipe_tags override is missing").not.toBeNull();
    expect(writerMatch?.[0]).toMatch(
      /where rt\.recipe_id = p_recipe_id[\s\S]*rt\.visibility = 'public'[\s\S]*rt\.review_status = 'approved'/i,
    );
    expect(sql).toMatch(
      /update public\.recipes as recipe[\s\S]*rt\.visibility = 'public'[\s\S]*rt\.review_status = 'approved'[\s\S]*where recipe\.tags is distinct from/i,
    );
    expect(sql).toMatch(
      /revoke execute on function public\.set_recipe_tags\(uuid, jsonb, uuid, text\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.set_recipe_tags\(uuid, jsonb, uuid, text\)[\s\S]*to service_role/i,
    );
  });

  it("derives tag visibility under a locked parent and removes direct association writes", () => {
    expect(existsSync(TAG_PARENT_VISIBILITY_MIGRATION_PATH)).toBe(true);

    if (!existsSync(TAG_PARENT_VISIBILITY_MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(TAG_PARENT_VISIBILITY_MIGRATION_PATH, "utf8");
    const writerMatch = sql.match(
      /create or replace function public\.set_recipe_tags\([\s\S]*?\n\$function\$;/i,
    );

    expect(writerMatch, "parent-bounded set_recipe_tags override is missing").not.toBeNull();
    expect(writerMatch?.[0]).toMatch(
      /from public\.recipes as recipe[\s\S]*where recipe\.id = p_recipe_id[\s\S]*for update/i,
    );
    expect(writerMatch?.[0]).toMatch(
      /v_parent_visibility <> 'public'[\s\S]*v_parent_deleted_at is not null[\s\S]*then 'private'/i,
    );
    expect(writerMatch?.[0]).toMatch(
      /v_requested_visibility = 'public'[\s\S]*v_review_status <> 'approved'[\s\S]*then 'public_pending'/i,
    );
    expect(writerMatch?.[0]).toMatch(
      /join public\.recipes as recipe[\s\S]*recipe\.visibility = 'public'[\s\S]*recipe\.deleted_at is null/i,
    );
    expect(sql).toMatch(
      /revoke insert, update, delete[\s\S]*on table public\.recipe_tags[\s\S]*from public, anon, authenticated, service_role/i,
    );
  });

  it("withholds raw tag usage counts while retaining safe tag columns", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /revoke select on table public\.tags from anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant select \(\s*id,\s*normalized_key,\s*label,\s*slug,\s*kind,\s*is_system,\s*theme_eligible\s*\)[\s\S]*on table public\.tags[\s\S]*to anon, authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant select \([^)]*usage_count[^)]*\)[\s\S]*on table public\.tags[\s\S]*to anon, authenticated/i,
    );
  });

  it("dark-ships the permanent managed image registry without widening Storage access", () => {
    expect(existsSync(MANAGED_IMAGE_REGISTRY_MIGRATION_PATH)).toBe(true);

    if (!existsSync(MANAGED_IMAGE_REGISTRY_MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MANAGED_IMAGE_REGISTRY_MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create table if not exists public\.recipe_image_objects/i,
    );
    expect(sql).toMatch(
      /owner_uuid uuid[\s\S]*account_generation bigint[\s\S]*bucket_id text not null[\s\S]*object_path text not null/i,
    );
    expect(sql).toMatch(
      /raw_sha256 text[\s\S]*byte_size bigint[\s\S]*actual_mime_type text[\s\S]*visibility text not null[\s\S]*state text not null/i,
    );
    expect(sql).toMatch(
      /upload_attempt_token uuid[\s\S]*cleanup_generation bigint[\s\S]*upload_lease_expires_at timestamptz[\s\S]*unlinked_cleanup_after timestamptz/i,
    );
    expect(sql).toMatch(
      /not_found_observed_at timestamptz[\s\S]*late_upload_quarantine_until timestamptz[\s\S]*next_terminal_scan_at timestamptz/i,
    );
    expect(sql).toMatch(
      /pending_upload[\s\S]*uploaded_unlinked[\s\S]*attached_private[\s\S]*attached_public_shared[\s\S]*cleanup_pending[\s\S]*not_found_observed[\s\S]*deleted[\s\S]*verified_not_found/i,
    );
    expect(sql).toMatch(
      /visibility = 'private'[\s\S]*owner_uuid is not null[\s\S]*account_generation is not null[\s\S]*visibility = 'public_shared'[\s\S]*owner_uuid is null[\s\S]*account_generation is null/i,
    );
    expect(sql).toMatch(
      /create table if not exists public\.recipe_image_object_references[\s\S]*image_object_id uuid not null[\s\S]*references public\.recipe_image_objects\(id\) on delete restrict[\s\S]*reference_type text not null[\s\S]*consumer_id uuid not null/i,
    );
    expect(sql).toMatch(
      /unique \(reference_type, consumer_id\)/i,
    );

    for (const table of [
      "recipe_image_objects",
      "recipe_image_object_references",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke all on table public\\.${table}[\\s\\S]*from public, anon, authenticated, service_role`,
          "i",
        ),
      );
    }

    expect(sql).not.toMatch(/insert into storage\.buckets/i);
    expect(sql).not.toMatch(/create policy[\s\S]*on storage\.objects/i);
    expect(sql).not.toMatch(
      /owner_uuid uuid references (?:auth\.users|public\.users)/i,
    );
  });
});
