import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "supabase/migrations");
const sql = readFileSync(
  join(directory, "20261007210000_ingredient_source_name_capacity.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");
const previous = readFileSync(
  join(directory, "20260919001000_ingredient_search_normalization.sql"),
  "utf8",
);

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("ingredient source-name capacity migration", () => {
  it("widens the original synonym inside one transaction after dropping its generated dependency", () => {
    expect(sql.trim()).toMatch(/^begin;/);
    expect(sql.trim()).toMatch(/commit;$/);
    const drop = sql.indexOf("drop column search_name restrict");
    const widen = sql.indexOf("alter column synonym type varchar(512)");
    const restore = sql.indexOf("add column search_name text");
    expect(drop).toBeGreaterThan(0);
    expect(widen).toBeGreaterThan(drop);
    expect(restore).toBeGreaterThan(widen);
    expect(sql.match(/alter table public\.ingredient_synonyms/g)).toHaveLength(3);
    expect(sql).not.toMatch(/\bcascade\b|\busing\s+(?:left|substring|substr)\b/i);
  });

  it("restores the same stored search-name expression rather than weakening exact matching", () => {
    const generated = "generated always as (public.normalize_ingredient_search_name(synonym)) stored";
    expect(compact(sql)).toContain(generated);
    expect(compact(previous)).toContain(generated);
    expect(sql.match(/add column/g)).toHaveLength(1);
    expect(sql.match(/drop column/g)).toHaveLength(1);
    expect(sql).not.toMatch(/create (?:or replace )?function|alter function|drop function/i);
  });

  it("recreates exactly the two dependent search indexes with their original expressions", () => {
    const definitions = [
      "ingredient_synonyms_search_name_idx on public.ingredient_synonyms (search_name, ingredient_id)",
      "ingredient_synonyms_search_name_trgm_idx on public.ingredient_synonyms using gin (search_name gin_trgm_ops)",
    ];
    expect(sql.match(/create index/g)).toHaveLength(2);
    for (const definition of definitions) {
      expect(compact(sql)).toContain(`create index ${definition};`);
      expect(compact(previous)).toContain(`create index if not exists ${definition};`);
    }
    expect(sql).not.toMatch(/drop index|drop constraint|add constraint|create unique index/i);
  });

  it("does not alter rows, grants, RLS, triggers, other tables or existing identity constraints", () => {
    expect(sql).not.toMatch(/\b(?:insert|update|delete|truncate|grant|revoke)\b/i);
    expect(sql).not.toMatch(/row level security|\bpolicy\b|\btrigger\b|\bowner\b|\breferences\b/i);
    expect(sql).not.toMatch(/alter table public\.(?!ingredient_synonyms\b)/i);
    expect(sql).not.toContain("ingredient_synonyms_synonym_idx");
    expect(sql).not.toContain("ingredient_synonyms_pkey");
    expect(sql).not.toContain("ingredient_synonyms_ingredient_id_synonym_key");
  });
});
