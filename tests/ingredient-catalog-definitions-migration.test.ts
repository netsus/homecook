import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "supabase/migrations");
const readMigration = (name: string) => readFileSync(join(directory, name), "utf8")
  .replace(/--[^\n]*/g, "");
const sql = readMigration("20261007160000_ingredient_catalog_definitions.sql");
const previousSql = readMigration("20261007143000_ingredient_catalog_organization.sql");
const existingViews = [
  "ingredient_catalog_items",
  "ingredient_catalog_primary",
  "ingredient_catalog_details",
  "ingredient_catalog_foods",
  "ingredient_catalog_excluded",
  "ingredient_catalog_aliases",
  "ingredient_catalog_needs_review",
];

function viewDefinition(source: string, name: string) {
  const match = source.match(new RegExp(
    `create(?: or replace)? view public\\.${name}\\s[\\s\\S]*?;`,
  ));
  expect(match, name).not.toBeNull();
  return match![0];
}

describe("ingredient catalog definitions migration", () => {
  it("changes only catalog schema in one transaction without rewriting food or nutrition data", () => {
    expect(sql.trim()).toMatch(/^begin;/);
    expect(sql.trim()).toMatch(/commit;$/);
    expect(sql).not.toMatch(/\b(?:insert into|update public\.|delete from|truncate|drop table|drop view)\b/i);
    expect(sql.match(/alter table public\.\w+/g)).toEqual([
      "alter table public.ingredient_catalog_entries",
    ]);
    expect(sql).not.toContain("is_selectable_catalog_ingredient");
  });

  it("allows absent definitions but bounds supplied nonblank public text", () => {
    expect(sql).toContain("add column definition text,");
    expect(sql).toContain("add constraint ingredient_catalog_entries_definition_check");
    expect(sql).toContain("definition is null or (");
    expect(sql).toContain("nullif(btrim(definition), '') is not null");
    expect(sql).toContain("char_length(definition) <= 1000");
    expect(sql).not.toMatch(/definition text\s+(?:not null|default)/i);
    expect(sql).not.toMatch(/reviewed_by|decision_reason|evidence_json/);
  });

  it("adds umbrella without removing existing presentations or changing independent review states", () => {
    expect(sql).toContain("drop constraint ingredient_catalog_entries_presentation_check");
    expect(sql).toContain("add constraint ingredient_catalog_entries_presentation_check");
    expect(sql).toContain("presentation in ('base', 'detail', 'prepared_food', 'excluded', 'alias', 'umbrella')");
    expect(sql).not.toMatch(/alter column review_state|drop constraint ingredient_catalog_entries_review_state_check/i);
    expect(sql.match(/drop constraint\s+\w+/g)).toEqual([
      "drop constraint ingredient_catalog_entries_presentation_check",
    ]);
  });

  it("appends definition after the exact previous item projection and keeps NULL for unclassified rows", () => {
    const previous = viewDefinition(previousSql, "ingredient_catalog_items");
    const current = viewDefinition(sql, "ingredient_catalog_items");
    const projection = (view: string) => view.match(/\bas\s+select\s+([\s\S]*?)\s+from public\.ingredients/)![1];
    expect(projection(current).replace(/,\s*entry\.definition$/, "")).toBe(projection(previous));
    expect(current).toMatch(/entry\.updated_at,\s+entry\.definition\s+from/);
    expect(current).toContain("coalesce(entry.presentation, 'base') as presentation");
    expect(current).toContain("coalesce(entry.review_state, 'unreviewed') as review_state");
    expect(current).toContain("left join public.ingredient_catalog_entries entry");
    expect(current).not.toMatch(/coalesce\(entry\.definition|\bwhere\b/);
  });

  it("refreshes all seven existing invoker views while preserving each dependent query", () => {
    expect(sql.match(/create or replace view public\./g)).toHaveLength(7);
    for (const name of existingViews) {
      const current = viewDefinition(sql, name);
      expect(current).toMatch(/^create or replace view /);
      expect(current).toContain("with (security_invoker = true)");
      if (name !== "ingredient_catalog_items") {
        expect(current.replace("create or replace view", "create view"))
          .toBe(viewDefinition(previousSql, name));
      }
    }
    expect(sql).not.toContain("security definer");
  });

  it("keeps base selection separate from reviewed umbrellas and unresolved review state", () => {
    expect(viewDefinition(sql, "ingredient_catalog_primary")).toMatch(/where presentation = 'base';$/);
    expect(viewDefinition(sql, "ingredient_catalog_needs_review"))
      .toMatch(/where review_state in \('needs_definition', 'unreviewed'\);$/);
    expect(viewDefinition(sql, "ingredient_catalog_umbrellas"))
      .toMatch(/where presentation = 'umbrella';$/);
    expect(viewDefinition(sql, "ingredient_catalog_needs_review")).not.toContain("umbrella");
  });

  it("inherits the existing reviewed-root and incoming-alias protections without weakening them", () => {
    expect(sql).not.toMatch(/(?:create|alter|drop)(?: or replace)? (?:function|trigger)\b/i);
    expect(sql).not.toMatch(/(?:disable trigger|drop constraint ingredient_catalog_entries_(?:alias|authoritative|no_self))/i);
    expect(previousSql).toContain("representative.presentation in ('base', 'detail', 'prepared_food')");
    expect(previousSql).toContain("representative.review_state = 'reviewed'");
    expect(previousSql).toMatch(/if new\.presentation not in \('base', 'detail', 'prepared_food'\)\s+or new\.review_state <> 'reviewed' then/);
    expect(previousSql).toContain("incoming.representative_ingredient_id = new.ingredient_id");
    expect(previousSql).toContain("INGREDIENT_CATALOG_REFERENCED_ROOT_MUST_STAY_REVIEWED");
  });

  it("adds only an invoker umbrella view with public SELECT and no client write grants", () => {
    const umbrellas = viewDefinition(sql, "ingredient_catalog_umbrellas");
    expect(umbrellas).toContain("with (security_invoker = true)");
    expect(umbrellas).toContain("select * from public.ingredient_catalog_items");
    expect(sql).toContain("alter view public.ingredient_catalog_umbrellas owner to postgres");
    expect(sql).toMatch(/revoke all on table public\.ingredient_catalog_umbrellas\s+from public, anon, authenticated, service_role;/);
    expect(sql.match(/\bgrant\s+[\s\S]*?;/gi)).toEqual([
      "grant select on table public.ingredient_catalog_umbrellas\n  to anon, authenticated, service_role;",
    ]);
    expect(sql).not.toMatch(/create policy|disable row level security|\bprivate\./i);
  });
});
