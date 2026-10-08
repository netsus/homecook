import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261008090000_ingredient_ai_nutrition.sql"), "utf8")
  .replace(/--[^\n]*/g, "");
const rpcs = [
  "enqueue_ingredient_ai_nutrition", "claim_ingredient_ai_nutrition_job",
  "get_ingredient_ai_nutrition_context", "complete_ingredient_ai_nutrition_job",
  "fail_ingredient_ai_nutrition_job", "list_ingredient_ai_nutrition_refresh_jobs",
  "acknowledge_ingredient_ai_nutrition_refresh",
];
function body(name: string, schema = "public") {
  const start = sql.indexOf(`create function ${schema}.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const first = sql.indexOf("as $function$", start);
  return sql.slice(start, sql.indexOf("$function$;", first) + 11);
}

describe("ingredient AI nutrition DB contract", () => {
  it("keeps estimates distinct from observed values and binds their immutable lineage to the AI provider", () => {
    expect(sql).toContain("value_status in ('observed', 'estimated', 'missing', 'trace', 'parse_error')");
    const guard = body("validate_ai_nutrition_value_source", "private");
    expect(guard).toContain("new.value_status = 'estimated' and v_provider is distinct from 'HOMECOOK_AI_ESTIMATE'");
    expect(guard).toContain("v_provider = 'HOMECOOK_AI_ESTIMATE' and new.amount is not null");
    expect(guard).toContain("new.value_status <> 'estimated'");
    expect(sql).toContain("before insert on public.nutrition_values");
    expect(sql).not.toMatch(/drop trigger|disable trigger|alter function public\.protect_nutrition_model_row/);
  });

  it("starts disabled with private operator-only settings and bounded daily claim budget", () => {
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("check (not enabled or (model_id is not null and reviewed_by is not null))");
    expect(sql).toContain("daily_limit integer not null default 50");
    expect(sql).toContain("revoke all on private.ingredient_ai_nutrition_settings, private.ingredient_ai_nutrition_jobs");
    expect(sql).not.toMatch(/grant (?:all|select|insert|update|delete).*private\.ingredient_ai_nutrition/);
    const claim = body("claim_ingredient_ai_nutrition_job");
    expect(claim).toContain("where singleton for update");
    expect(claim).toContain("'Asia/Seoul'");
    expect(claim.indexOf("if not v_settings.enabled")).toBeLessThan(claim.indexOf("set status = 'processing'"));
    expect(claim).toContain("claims_today = claims_today + 1");
  });

  it("enqueues new ingredients transactionally and idempotently without external side effects", () => {
    expect(sql).toContain("after insert on public.ingredients");
    expect(body("enqueue_new_ingredient_ai_nutrition", "private")).toContain("private.enqueue_ingredient_ai_nutrition_id(new.id)");
    expect(body("enqueue_ingredient_ai_nutrition_id", "private")).toContain("on conflict (ingredient_id, policy_version) do nothing");
    expect(sql).not.toMatch(/net\.|http_post|http_get|pg_net|cron\./i);
    expect(body("enqueue_ingredient_ai_nutrition")).toContain("cardinality(p_ingredient_ids) not between 1 and 100");
  });

  it("never fills gaps in an approved official or product primary or estimates excluded catalog identities", () => {
    const skip = body("ingredient_ai_nutrition_skip_reason", "private");
    expect(skip).toContain("presentation in ('excluded', 'alias', 'umbrella', 'prepared_food')");
    expect(skip).toContain("public.ingredient_representative_links");
    expect(skip).toContain("source.provider_code is distinct from 'HOMECOOK_AI_ESTIMATE'");
    expect(skip).toContain("'APPROVED_PRODUCT_EXISTS'");
    expect(skip).not.toContain("nutrition_values");
    const complete = body("complete_ingredient_ai_nutrition_job");
    expect(complete.indexOf("public.lock_recipe_nutrition_ingredient_ids")).toBeLessThan(complete.indexOf("private.ingredient_ai_nutrition_skip_reason"));
    expect(complete.indexOf("private.ingredient_ai_nutrition_skip_reason")).toBeLessThan(complete.indexOf("insert into public.nutrition_sources"));
    expect(complete).toContain("AI_NUTRITION_OFFICIAL_SOURCE_RACE");
  });

  it("uses finite leases, SKIP LOCKED, bounded attempts and a new token on each claim", () => {
    const claim = body("claim_ingredient_ai_nutrition_job");
    expect(sql).toContain("max_attempts integer not null default 3 check (max_attempts between 1 and 3)");
    expect(claim).toContain("p_lease_seconds not between 15 and 300");
    expect(claim).toContain("for update skip locked limit 1");
    expect(claim).toContain("lease_token = gen_random_uuid()");
    expect(claim).toContain("attempt_count = attempt_count + 1");
    expect(claim).toContain("v_job.attempt_count >= v_job.max_attempts");
    expect(claim).toContain("'status', 'claimed'");
    for (const name of ["get_ingredient_ai_nutrition_context", "complete_ingredient_ai_nutrition_job", "fail_ingredient_ai_nutrition_job"]) {
      expect(body(name)).toContain("v_job.lease_token is distinct from p_lease_token");
      expect(body(name)).toContain("v_job.lease_expires_at <= clock_timestamp()");
    }
  });

  it("requires exact policy and context plus eight nullable numbers and preserves missing as NULL", () => {
    const complete = body("complete_ingredient_ai_nutrition_job");
    expect(complete).toContain("p_result ->> 'model' is distinct from v_job.model_id");
    expect(complete).toContain("p_result ->> 'context_hash' is distinct from v_job.context_hash");
    expect(complete).toContain("if v_count <> 8");
    expect(complete).toContain("jsonb_typeof(v_value) not in ('number', 'null')");
    expect(complete).toContain("when 'energy_kcal' then 900 when 'sodium_mg' then 40000 else 100 end)");
    expect(complete).toContain("AI_NUTRITION_NO_CORE_ESTIMATE");
    expect(complete).toContain("(p_result -> 'values' ->> 'energy_kcal')::numeric = 0");
    expect(complete).toContain("coalesce(v_carbs, 0) + coalesce(v_protein, 0) + coalesce(v_fat, 0) > 0.1");
    expect(complete).toContain("v_sugars > v_carbs + 0.05");
    expect(complete).toContain("v_fiber > v_carbs + 0.05");
    expect(complete).toContain("v_saturated > v_fat + 0.05");
    expect(complete).toContain("then 'estimated' else 'missing'");
    expect(complete).toContain("then round(v_value::text::numeric, 6) else null");
    expect(complete).toContain("jsonb_array_length(p_result -> 'assumptions') not between 1 and 8");
    expect(complete).toContain("char_length(btrim(value #>> '{}')) not between 1 and 500");
  });

  it("appends labelled source/profile/value versions and never fabricates official aliases or raw-response provenance", () => {
    const complete = body("complete_ingredient_ai_nutrition_job");
    expect(complete).toContain("v_job.id::text, v_job.ingredient_name, 'as_published'");
    expect(complete).toContain("'ingredient_source', 'mass_100g', 100, 'g'");
    expect(complete).toContain("'AI_NUTRITION_ESTIMATE_USED'");
    expect(complete).toContain("'https://app.mumeok.kr/about/ai-nutrition'");
    expect(complete).not.toContain("urn:homecook:");
    expect(complete).not.toMatch(/update public\.nutrition_values|update public\.nutrition_profiles|insert into public\.ingredient_synonyms/);
    expect(complete).toContain("v_job.completion_token = p_lease_token");
    expect(complete).toContain("jsonb_build_object('replayed', true)");
    expect(body("fail_ingredient_ai_nutrition_job")).toContain("then p_error_code else 'INTERNAL_ERROR'");
  });

  it("persists affected recipe IDs in the same transaction and supports idempotent bounded refresh acknowledgments", () => {
    const complete = body("complete_ingredient_ai_nutrition_job");
    expect(complete).toContain("pending_recipe_ids = v_recipe_ids");
    expect(complete).toContain("'affected_recipe_ids', to_jsonb(v_recipe_ids)");
    expect(body("list_ingredient_ai_nutrition_refresh_jobs")).toContain("status = 'succeeded' and cardinality(pending_recipe_ids) > 0");
    expect(body("list_ingredient_ai_nutrition_refresh_jobs")).toContain("for update skip locked limit p_limit");
    expect(body("list_ingredient_ai_nutrition_refresh_jobs")).toContain("v_live[11:cardinality(v_live)] || v_live[1:10]");
    expect(body("list_ingredient_ai_nutrition_refresh_jobs")).toContain("recipe.deleted_at is null");
    expect(body("list_ingredient_ai_nutrition_refresh_jobs")).toContain("updated_at = clock_timestamp()");
    expect(body("acknowledge_ingredient_ai_nutrition_refresh")).toContain("v_job.result -> 'affected_recipe_ids'");
    expect(body("acknowledge_ingredient_ai_nutrition_refresh")).toContain("AI_NUTRITION_REFRESH_RECIPE_NOT_ALLOWED");
  });

  it("checks service role, exact internal scope, method and RPC path without expanding public table access", () => {
    const auth = body("require_ingredient_ai_scope", "private");
    expect(auth).toContain("auth.role() is distinct from 'service_role'");
    expect(auth).toContain("is distinct from 'ingredient-ai-nutrition'");
    expect(auth).toContain("is distinct from '/rpc/' || p_rpc_name");
    expect(auth).toContain("<> 'POST'");
    for (const name of rpcs) {
      expect(body(name)).toContain(`private.require_ingredient_ai_scope('${name}')`);
      expect(sql).toContain(`'/rpc/${name}'`);
    }
    expect(sql).toContain("perform private.verify_scope_pre_ingredient_ai_20261008()");
    expect(sql.match(/grant execute on function/g)).toHaveLength(1);
    expect(sql).not.toMatch(/grant .* on (?:table )?public\./);
  });
});
