import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readAllMigrations() {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n\n");
}

describe("community prepared food catalog database contract", () => {
  it("adds shared manual moderation and report persistence through additive SQL", () => {
    const sql = readAllMigrations();

    expect(sql).toMatch(/moderation_status varchar\(20\) not null default 'visible'/i);
    expect(sql).toMatch(/visibility = 'public'[\s\S]*source_type = 'manual'/i);
    expect(sql).toMatch(/create table public\.food_product_reports/i);
    expect(sql).toMatch(/unique \(product_id, reporter_user_id\)/i);
    expect(sql).toMatch(/reason_code varchar\(30\) not null/i);
    expect(sql).toMatch(/reason_code in \('spam', 'incorrect_nutrition', 'duplicate', 'rights', 'unsafe', 'other'\)/i);
    expect(sql).toMatch(/report_status in \('pending', 'acknowledged', 'resolved', 'dismissed'\)/i);
    expect(sql).toMatch(/report_status = 'pending'[\s\S]*or \(reviewed_by is not null and reviewed_at is not null\)/i);
    expect(sql).toMatch(/visibility = 'public' or moderation_status = 'visible'/i);
    expect(sql).toMatch(/source_type = 'manual' or moderation_status in \('visible', 'hidden_by_operator'\)/i);
  });

  it("adds source-aware catalog listing, report append-only guards, and account deletion anonymization", () => {
    const sql = readAllMigrations();

    expect(sql).toMatch(/create function public\.list_food_products\(\s*p_user_id uuid,\s*p_query text,\s*p_source text,/i);
    expect(sql).toMatch(/create function public\.report_food_product/i);
    expect(sql).toMatch(/PRODUCT_ALREADY_REPORTED/i);
    expect(sql).toMatch(/PRODUCT_REPORT_NOT_ALLOWED/i);
    expect(sql).toMatch(/create policy food_product_reports_insert_own on public\.food_product_reports/i);
    expect(sql).toMatch(/revoke all on table public\.food_product_reports from anon, authenticated/i);
    expect(sql).toMatch(/grant insert \(product_id, reporter_user_id, reason_code, detail_text\)[\s\S]*on table public\.food_product_reports to authenticated/i);
    expect(sql).toMatch(/grant all on table public\.food_product_reports to service_role/i);
    expect(sql).toMatch(/grant update \(moderation_status, updated_at\) on table public\.food_products to service_role/i);
    expect(sql).toMatch(/update public\.food_products[\s\S]*set owner_user_id = null[\s\S]*visibility = 'public'[\s\S]*source_type = 'manual'/i);
  });
});
