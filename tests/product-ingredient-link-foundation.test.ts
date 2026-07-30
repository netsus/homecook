import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const targetMigration =
  "supabase/migrations/20260730210000_product_ingredient_link_foundation.sql";
const manifestPath =
  "docs/security/product-ingredient-link-foundation-security-function-authorization-manifest.json";

function readMigrationSource() {
  return readFileSync(join(repoRoot, targetMigration), "utf8");
}

describe("product ingredient link foundation", () => {
  it("installs the additive authority table with the locked FK and predicate rules", () => {
    const sql = readMigrationSource();

    expect(
      /create table(?: if not exists)? public\.food_product_ingredient_links/i.test(sql),
      "food_product_ingredient_links table is missing",
    ).toBe(true);
    expect(
      /product_id uuid not null references public\.food_products\s*\(id\) on delete cascade/i.test(
        sql,
      ),
      "product FK must cascade on delete",
    ).toBe(true);
    expect(
      /ingredient_id uuid not null references public\.ingredients\s*\(id\) on delete restrict/i.test(
        sql,
      ),
      "ingredient FK must restrict on delete",
    ).toBe(true);
    expect(sql).toMatch(
      /relation [a-z0-9_() ]+not null[\s\S]*review_status [a-z0-9_() ]+not null[\s\S]*is_primary boolean not null[\s\S]*is_active boolean not null[\s\S]*source text not null[\s\S]*provenance_json jsonb not null[\s\S]*created_at timestamptz not null default now\(\)[\s\S]*updated_at timestamptz not null default now\(\)/i,
    );
    expect(sql).toMatch(
      /check \(\s*relation in \('represents', 'contains', 'substitute'\)\s*\)/i,
    );
    expect(sql).toMatch(
      /check \(\s*review_status in \('pending', 'approved', 'rejected', 'revoked', 'superseded'\)\s*\)/i,
    );
    expect(sql).toMatch(/check \(\s*not is_active or review_status = 'approved'\s*\)/i);
    expect(sql).toMatch(/check \(\s*not is_primary or relation = 'represents'\s*\)/i);
    expect(sql).toMatch(
      /create unique index [a-z0-9_]+[\s\S]*on public\.food_product_ingredient_links\s*\(\s*product_id\s*\)[\s\S]*where relation = 'represents'[\s\S]*review_status = 'approved'[\s\S]*is_primary[\s\S]*is_active/i,
    );
  });

  it("adds audited candidate creation, an owner-bounded selector, and CAS promotion", () => {
    const sql = readMigrationSource();

    expect(sql).toMatch(
      /create(?: or replace)? function public\.create_food_product_ingredient_link_candidate\([\s\S]*p_product_id uuid[\s\S]*p_ingredient_id uuid[\s\S]*p_relation text[\s\S]*p_source text[\s\S]*p_provenance_json jsonb[\s\S]*\)[\s\S]*returns uuid[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(
      /insert into public\.food_product_ingredient_links[\s\S]*'pending'[\s\S]*false[\s\S]*false[\s\S]*returning id into v_candidate_id/i,
    );
    expect(sql).toMatch(
      /jsonb_object_keys\(p_provenance_json\)[\s\S]*algorithm_version[\s\S]*candidate_rank[\s\S]*evidence_codes/i,
    );
    expect(sql).toMatch(
      /create(?: or replace)? function public\.select_food_product_effective_ingredient\([\s\S]*p_product_id uuid[\s\S]*p_requesting_user_id uuid[\s\S]*\)[\s\S]*returns uuid[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(
      /from public\.food_product_ingredient_links[\s\S]*join public\.food_products[\s\S]*product\.visibility = 'public'[\s\S]*product\.visibility = 'private'[\s\S]*product\.owner_user_id = p_requesting_user_id[\s\S]*relation = 'represents'[\s\S]*review_status = 'approved'[\s\S]*is_primary[\s\S]*is_active/i,
    );
    expect(sql).toMatch(
      /create(?: or replace)? function public\.promote_food_product_ingredient_link\([\s\S]*p_candidate_link_id uuid[\s\S]*p_expected_current_link_id uuid[\s\S]*p_decision_reason text[\s\S]*\)[\s\S]*returns void[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(
      /service_role[\s\S]*42501/i,
    );
    expect(sql).toMatch(
      /from public\.food_products[\s\S]*where id = v_target\.product_id[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /v_current_link_id is distinct from p_expected_current_link_id[\s\S]*errcode = '40001'/i,
    );
    expect(sql).toMatch(
      /update public\.food_product_ingredient_links[\s\S]*set review_status = 'superseded'[\s\S]*is_active = false[\s\S]*is_primary = false/i,
    );
    expect(sql).toMatch(
      /update public\.food_product_ingredient_links[\s\S]*set review_status = 'approved'[\s\S]*is_active = true[\s\S]*is_primary = case when v_target\.relation = 'represents' then true else false end/i,
    );
  });

  it("denies ordinary user DML and direct execution while keeping the additive manifest wired to the validator", () => {
    const sql = readMigrationSource();

    expect(sql).toMatch(
      /alter table public\.food_product_ingredient_links enable row level security/i,
    );
    expect(sql).toMatch(
      /revoke all on table public\.food_product_ingredient_links[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).not.toMatch(
      /grant (?:select|insert|update|delete|all)[\s\S]*on table public\.food_product_ingredient_links[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.create_food_product_ingredient_link_candidate\([\s\S]*uuid, uuid, text, text, jsonb[\s\S]*\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.create_food_product_ingredient_link_candidate\([\s\S]*uuid, uuid, text, text, jsonb[\s\S]*\)[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.select_food_product_effective_ingredient\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.select_food_product_effective_ingredient\(uuid, uuid\)[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.promote_food_product_ingredient_link\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.promote_food_product_ingredient_link\(uuid, uuid, text\)[\s\S]*to service_role/i,
    );

    expect(existsSync(manifestPath), "authorization manifest is missing").toBe(true);
    if (!existsSync(manifestPath)) {
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      functions?: Array<{
        allowed_principals?: string[];
        effect?: string;
        security_mode?: string;
        signature?: string;
      }>;
      migration?: string;
      slice?: string;
    };
    const validator = readFileSync(
      "scripts/validate-security-function-authorization.mjs",
      "utf8",
    );

    expect(manifest.slice).toBe("product-ingredient-link-foundation");
    expect(manifest.migration).toBe(targetMigration);
    expect(manifest.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signature:
            "public.create_food_product_ingredient_link_candidate(uuid, uuid, text, text, jsonb)",
          effect: "mutation",
          allowed_principals: ["service_role"],
          security_mode: "definer",
        }),
        expect.objectContaining({
          signature: "public.select_food_product_effective_ingredient(uuid, uuid)",
          effect: "read-only",
          allowed_principals: ["service_role"],
          security_mode: "definer",
        }),
        expect.objectContaining({
          signature:
            "public.promote_food_product_ingredient_link(uuid, uuid, text)",
          effect: "mutation",
          allowed_principals: ["service_role"],
          security_mode: "definer",
        }),
      ]),
    );
    expect(validator).toContain(
      "product-ingredient-link-foundation-security-function-authorization-manifest.json",
    );
    expect(validator).toContain("20260730210000_product_ingredient_link_foundation.sql");
  });
});
