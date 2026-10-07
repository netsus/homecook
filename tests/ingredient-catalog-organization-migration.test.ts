import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "supabase/migrations");
const sql = readFileSync(
  join(directory, "20261007143000_ingredient_catalog_organization.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");
const authoritativeSql = readFileSync(
  join(directory, "20260919100000_ingredient_representative_links.sql"),
  "utf8",
);

function tableDefinition(name: string) {
  const start = sql.indexOf(`create table public.${name} (`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("\n);", start) + 3);
}

function viewDefinition(name: string) {
  const start = sql.indexOf(`create view public.${name}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf(";", start) + 1);
}

const views = [
  "ingredient_catalog_items",
  "ingredient_catalog_primary",
  "ingredient_catalog_details",
  "ingredient_catalog_foods",
  "ingredient_catalog_excluded",
  "ingredient_catalog_aliases",
  "ingredient_catalog_needs_review",
];

describe("ingredient catalog organization migration", () => {
  it("creates metadata only and leaves nutrition, ingredient identities and existing writers untouched", () => {
    expect(sql.match(/create table public\./g)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(?:insert into|update public\.|delete from|drop |truncate )/i);
    expect(sql).not.toMatch(/alter table public\.(?:ingredients|nutrition_\w+)\b/i);
    expect(sql).not.toContain("is_selectable_catalog_ingredient");
    for (const name of ["ingredient_catalog_groups", "ingredient_catalog_entries"]) {
      expect(tableDefinition(name)).not.toMatch(/decision_reason|reviewed_by|actor|evidence_json|energy_kcal|protein_g/);
    }
  });

  it("bounds group names, display labels and review versions and rejects invalid states or dimensions", () => {
    const groups = tableDefinition("ingredient_catalog_groups");
    const entries = tableDefinition("ingredient_catalog_entries");
    expect(groups).toMatch(/unique \(category, name\)/);
    expect(groups).toMatch(/sort_order integer not null default 0 check \(sort_order >= 0\)/);
    for (const field of ["category", "name"]) {
      expect(groups).toContain(`nullif(btrim(${field}), '') is not null`);
      expect(groups).toMatch(new RegExp(`char_length\\(${field}\\) <= \\d+`));
    }
    for (const field of ["display_name", "review_version"]) {
      expect(entries).toContain(`nullif(btrim(${field}), '') is not null`);
      expect(entries).toContain(`char_length(${field}) <= 200`);
    }
    expect(entries).toContain("presentation in ('base', 'detail', 'prepared_food', 'excluded', 'alias')");
    expect(entries).toContain("review_state in ('reviewed', 'needs_definition')");
    expect(entries).toContain("jsonb_typeof(retain_dimensions) = 'array'");
    expect(entries).toContain(`not jsonb_path_exists(retain_dimensions, '$[*] ? (@.type() != "string")')`);
    expect(entries).toContain("updated_at timestamptz not null default now()");
  });

  it("keeps the representative relation authoritative and prevents dangling or mismatched public projections", () => {
    const entries = tableDefinition("ingredient_catalog_entries");
    expect(sql).toMatch(/alter table public\.ingredient_representative_links[\s\S]*?unique \(source_ingredient_id, representative_ingredient_id\)/);
    expect(entries).toMatch(/foreign key \(ingredient_id, representative_ingredient_id\)\s+references public\.ingredient_representative_links\s+\(source_ingredient_id, representative_ingredient_id\)\s+on update restrict on delete restrict/);
    expect(entries).toMatch(/representative_ingredient_id uuid\s+references public\.ingredient_catalog_entries\(ingredient_id\)\s+on update restrict on delete restrict/);
    expect(entries).toContain("check ((presentation = 'alias') = (representative_ingredient_id is not null))");
    expect(entries).toContain("check (ingredient_id <> representative_ingredient_id)");
    expect(entries).toMatch(/ingredient_id uuid primary key\s+references public\.ingredients\(id\) on update restrict on delete restrict/);
    expect(entries).toMatch(/group_id uuid not null\s+references public\.ingredient_catalog_groups\(id\) on update restrict on delete restrict/);
  });

  it("serializes root checks with the existing graph guard without granting the trigger elevated privileges", () => {
    const graphLock = "hashtextextended('homecook:ingredient-representative-links', 0)";
    expect(authoritativeSql).toContain(graphLock);
    expect(sql).toContain(graphLock);
    expect(sql.indexOf(graphLock)).toBeLessThan(sql.indexOf("select 1 from public.ingredient_catalog_entries representative"));
    expect(sql).toContain("current_setting('transaction_isolation') <> 'read committed'");
    expect(sql).toMatch(/create function public\.validate_ingredient_catalog_entry\(\)[\s\S]*?security invoker\s+set search_path = pg_catalog, pg_temp/);
    expect(sql).not.toContain("security definer");
    expect(sql).toMatch(/revoke all on function public\.validate_ingredient_catalog_entry\(\)\s+from public, anon, authenticated, service_role/);
    expect(sql).toContain("new.ingredient_id is distinct from old.ingredient_id");
    expect(sql).toMatch(/before insert or update on public\.ingredient_catalog_entries/);
  });

  it("requires a reviewed root for aliases and prevents invalidating a root with incoming aliases", () => {
    expect(sql).toContain("representative.presentation in ('base', 'detail', 'prepared_food')");
    expect(sql).toContain("representative.review_state = 'reviewed'");
    expect(sql).toContain("representative.representative_ingredient_id is null");
    expect(sql).toContain("INGREDIENT_CATALOG_REPRESENTATIVE_NOT_REVIEWED_ROOT");
    expect(sql).toMatch(/if new\.presentation not in \('base', 'detail', 'prepared_food'\)\s+or new\.review_state <> 'reviewed' then/);
    expect(sql).toContain("incoming.representative_ingredient_id = new.ingredient_id");
    expect(sql).toContain("INGREDIENT_CATALOG_REFERENCED_ROOT_MUST_STAY_REVIEWED");
  });

  it("permits public metadata SELECT only and provides no client mutation grants or policies", () => {
    for (const name of ["ingredient_catalog_groups", "ingredient_catalog_entries"]) {
      expect(sql).toContain(`alter table public.${name} owner to postgres`);
      expect(sql).toContain(`alter table public.${name} enable row level security`);
      expect(sql).toContain(`on public.${name} for select to anon, authenticated, service_role`);
    }
    expect(sql).toMatch(/revoke all on table public\.ingredient_catalog_groups, public\.ingredient_catalog_entries\s+from public, anon, authenticated, service_role/);
    expect(sql).toMatch(/grant select on table public\.ingredient_catalog_groups, public\.ingredient_catalog_entries\s+to anon, authenticated, service_role/);
    const grants = sql.match(/\bgrant\s+[\s\S]*?;/gi) ?? [];
    expect(grants).toHaveLength(2);
    expect(grants.every((grant) => /^grant select on table/i.test(grant))).toBe(true);
    expect(sql).not.toMatch(/for (?:all|insert|update|delete)\b/i);
    expect(sql).not.toMatch(/grant\s+[\s\S]*?on (?:table )?public\.ingredient_representative_links\b/i);
  });

  it("keeps newly added unclassified ingredients visible with their real IDs and no private evidence join", () => {
    const items = viewDefinition("ingredient_catalog_items");
    expect(items).toContain("ingredient.id as ingredient_id");
    expect(items).toContain("coalesce(entry.display_name, ingredient.standard_name) as display_name");
    expect(items).toContain("coalesce(entry.presentation, 'base') as presentation");
    expect(items).toContain("coalesce(entry.review_state, 'unreviewed') as review_state");
    expect(items).toContain("coalesce(entry.retain_dimensions, '[]'::jsonb) as retain_dimensions");
    expect(items).toMatch(/from public\.ingredients ingredient\s+left join public\.ingredient_catalog_entries entry/);
    expect(items).toContain("left join public.ingredient_catalog_groups catalog_group");
    expect(items).not.toMatch(/\bwhere\b|ingredient_representative_links|reviewed_by|decision_reason|evidence_json|select \*/i);
    expect(viewDefinition("ingredient_catalog_primary")).toMatch(/where presentation = 'base';$/);
    expect(viewDefinition("ingredient_catalog_primary")).not.toContain("review_state");
    expect(viewDefinition("ingredient_catalog_needs_review")).toContain("review_state in ('needs_definition', 'unreviewed')");
  });

  it("exposes exactly seven invoker views whose partitions use public projections only", () => {
    expect(sql.match(/create view public\./g)).toHaveLength(7);
    for (const name of views) {
      const definition = viewDefinition(name);
      expect(definition).toContain("with (security_invoker = true)");
      expect(definition).not.toContain("ingredient_representative_links");
      expect(sql).toContain(`alter view public.${name} owner to postgres`);
    }
    for (const [name, presentation] of [
      ["details", "detail"], ["foods", "prepared_food"],
      ["excluded", "excluded"], ["aliases", "alias"],
    ]) {
      expect(viewDefinition(`ingredient_catalog_${name}`)).toContain(`where presentation = '${presentation}'`);
    }
  });
});
