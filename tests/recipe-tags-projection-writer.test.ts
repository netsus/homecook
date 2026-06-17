import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { P0_RECIPE_TAG_SEEDS } from "@/lib/server/recipe-tags";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260617090000_36b_recipe_tags_model.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

describe("36b recipe tags projection writer migration", () => {
  it("adds canonical tag tables, constraints, indexes, and the P0 seed", () => {
    const sql = readMigration();

    expect(sql).toMatch(/create table if not exists public\.tags\s*\(/i);
    expect(sql).toMatch(/normalized_key text not null unique/i);
    expect(sql).toMatch(/theme_eligible boolean not null default false/i);
    expect(sql).toMatch(/usage_count integer not null default 0/i);
    expect(sql).toMatch(/create table if not exists public\.recipe_tags\s*\(/i);
    expect(sql).toMatch(/primary key\s*\(\s*recipe_id\s*,\s*tag_id\s*\)/i);
    expect(sql).toMatch(/alter table public\.tags enable row level security/i);
    expect(sql).toMatch(/alter table public\.recipe_tags enable row level security/i);
    expect(sql).toMatch(/create index if not exists recipe_tags_tag_sort_idx/i);

    for (const seed of P0_RECIPE_TAG_SEEDS) {
      expect(sql).toContain(`('${seed.normalized_key}', '${seed.label}', '${seed.kind}', true, true)`);
    }
  });

  it("keeps recipe_tags, recipes.tags projection, and usage_count in one writer", () => {
    const sql = readMigration();

    expect(sql).toMatch(/create or replace function public\.set_recipe_tags/i);
    expect(sql).toMatch(/insert into public\.tags/i);
    expect(sql).toMatch(/insert into public\.recipe_tags/i);
    expect(sql).toMatch(/delete from public\.recipe_tags/i);
    expect(sql).toMatch(/update public\.recipes\s+set tags =/i);
    expect(sql).toMatch(/array_agg\(t\.label order by rt\.sort_order/i);
    expect(sql).toMatch(/update public\.tags\s+set usage_count =/i);
    expect(sql).toMatch(/rt\.visibility = 'public'/i);
    expect(sql).toMatch(/rt\.review_status = 'approved'/i);
    expect(sql).toMatch(/revoke execute on function public\.set_recipe_tags\(uuid, jsonb, uuid, text\) from public/i);
    expect(sql).toMatch(/grant execute on function public\.set_recipe_tags\(uuid, jsonb, uuid, text\) to service_role/i);
  });

  it("routes manual and YouTube registration through the projection writer", () => {
    const sql = readMigration();

    expect(sql).toMatch(/create or replace function public\.create_manual_recipe[\s\S]*p_tag_source text default 'system_suggested'/i);
    expect(sql).toMatch(/create or replace function public\.create_manual_recipe[\s\S]*perform public\.set_recipe_tags/i);
    expect(sql).toMatch(/create or replace function public\.register_youtube_recipe_from_session[\s\S]*p_tags text\[\] default null/i);
    expect(sql).toMatch(/create or replace function public\.register_youtube_recipe_from_session[\s\S]*p_tag_source text default 'system_suggested'/i);
    expect(sql).toMatch(/if p_tags is null then[\s\S]*v_session\.draft_json\s*->\s*'tags'/i);
    expect(sql).toMatch(/create or replace function public\.register_youtube_recipe_from_session[\s\S]*perform public\.set_recipe_tags/i);
  });
});
