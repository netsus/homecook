import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const migration = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql",
  ),
  "utf8",
);

describe("product ingredient link security boundary", () => {
  it("keeps link rows service-internal and ordinary roles unable to infer them", () => {
    expect(migration).toMatch(
      /alter table public\.food_product_ingredient_links enable row level security/i,
    );
    expect(migration).not.toMatch(
      /create policy[\s\S]*on public\.food_product_ingredient_links/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.food_product_ingredient_links[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(migration).not.toMatch(
      /grant (?:select|insert|update|delete|all)[\s\S]*on table public\.food_product_ingredient_links[\s\S]*to service_role/i,
    );
  });

  it("exposes candidate, selector, and promotion only to the exact service principal", () => {
    for (const signature of [
      "create_food_product_ingredient_link_candidate\\([\\s\\S]*uuid, uuid, text, text, jsonb[\\s\\S]*\\)",
      "select_food_product_effective_ingredient\\(uuid, uuid\\)",
      "promote_food_product_ingredient_link\\(uuid, uuid, text\\)",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role[\\s\\S]*grant execute on function public\\.${signature}[\\s\\S]*to service_role`,
          "i",
        ),
      );
    }

    expect(migration).toMatch(
      /security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(migration).toMatch(/service_role[\s\S]*errcode = '42501'/i);
  });

  it("fails closed without name, brand, synonym, or first-row guessing", () => {
    const selector = migration.match(
      /create or replace function public\.select_food_product_effective_ingredient[\s\S]*?\$function\$;/i,
    )?.[0];

    expect(selector).toBeDefined();
    expect(selector).toMatch(/relation = 'represents'/i);
    expect(selector).toMatch(/review_status = 'approved'/i);
    expect(selector).toMatch(/is_primary/i);
    expect(selector).toMatch(/is_active/i);
    expect(selector).toMatch(/product\.visibility = 'public'/i);
    expect(selector).toMatch(/product\.owner_user_id = p_requesting_user_id/i);
    expect(selector).not.toMatch(/name|brand|ingredient_synonyms|order by/i);
  });

  it("rejects sensitive provenance keys before candidate insertion", () => {
    const candidateWriter = migration.match(
      /create or replace function public\.create_food_product_ingredient_link_candidate[\s\S]*?\$function\$;/i,
    )?.[0];

    expect(candidateWriter).toBeDefined();
    expect(candidateWriter).toMatch(
      /provenance_json::text ~\*[\s\S]*owner[\s\S]*email[\s\S]*session[\s\S]*raw\[_-\]\?provider/i,
    );
    expect(candidateWriter).toMatch(/forbidden key[\s\S]*22023/i);
  });

  it("does not add user identity or provider-secret columns to link authority", () => {
    const tableDefinition = migration.match(
      /create table public\.food_product_ingredient_links \([\s\S]*?\n\);/i,
    )?.[0];

    expect(tableDefinition).toBeDefined();
    expect(tableDefinition).not.toMatch(
      /\b(owner_id|owner_uuid|email|session|jwt|api_key|secret|raw_provider_payload)\b/i,
    );
    expect(tableDefinition).toMatch(
      /provenance_json jsonb not null default '\{\}'::jsonb/i,
    );
  });

  it("does not change pantry, public endpoint, or ingredient synonym contracts", () => {
    expect(migration).not.toMatch(
      /alter table public\.pantry_items|insert into public\.ingredient_synonyms/i,
    );
    expect(migration).not.toMatch(/create (?:or replace )?function public\.(?:get|post)_/i);
  });
});
