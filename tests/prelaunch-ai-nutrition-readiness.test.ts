import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AI_NUTRITION_DISABLED_SQL, AI_NUTRITION_LEDGER_SQL, AI_NUTRITION_MIGRATIONS,
  AI_NUTRITION_ROWS_SQL, AI_NUTRITION_SCOPE_SQL, aiNutritionScopeEvidence,
  assertAiNutritionAppliedLedger, assertAiNutritionApplicationTree, assertAiNutritionDisabled,
  assertAiNutritionMigrationTransition, assertAiNutritionReview, assertAiNutritionReviewPin,
  assertAiNutritionScopePreserved, assertAiNutritionSource, captureAiNutritionDatabaseBefore,
} from "../scripts/lib/prelaunch-ai-nutrition-readiness.mjs";
import { classifyPrelaunchScope, parsePrelaunchOptions, prelaunchVerificationScripts } from "../scripts/lib/prelaunch-web-deploy.mjs";
import { IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { BETA_CANONICAL_POSTIMAGE_SQL } from "../scripts/lib/prelaunch-beta-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const scope = (name: string, source: string) => ({ name, source, owner: "postgres", acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });
type ScopeEvidence = Omit<ReturnType<typeof scope>, "source"> & { bodySha256: string };
const beforeScopes = (): ScopeEvidence[] => aiNutritionScopeEvidence([
  scope("verify_full_local_internal_scope", "old active"),
  scope("verify_full_local_internal_scope_base", "original authority"),
]);
const afterScopes = (): ScopeEvidence[] => aiNutritionScopeEvidence([
  scope("verify_full_local_internal_scope", "reviewed AI refresh wrapper"),
  scope("verify_scope_pre_ingredient_ai_20261008", "old active"),
  scope("verify_scope_pre_ai_refresh_20261008", "reviewed AI queue wrapper"),
  scope("verify_full_local_internal_scope_base", "original authority"),
]);
const beforeLedger = () => Array.from({ length: 204 }, (_, i) => ({ filename: `${String(i).padStart(14, "0")}_old.sql`, sha256: sha(String(i)) }));
const newLedger = () => AI_NUTRITION_MIGRATIONS.map(filename => ({ filename, sha256: sha(filename) }));
const proofNames = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"];
function review() {
  const migrations = newLedger();
  return {
    schema: "homecook.prelaunch-ai-nutrition-review.v1",
    from: "a".repeat(40), to: "b".repeat(40), migrationSourceRef: "c".repeat(40),
    previousMigrationCount: 204, migrationCount: 207, migrations,
    originalReadinessSha256: sha("original readiness"), proofDigests: Object.fromEntries(proofNames.map(key => [key, sha(key)])),
    files: {
      "instrumentation.ts": [null, sha("node startup")],
      "lib/supabase/server.ts": [sha("before"), sha("after")],
      ...Object.fromEntries(migrations.map(row => [`supabase/migrations/${row.filename}`, [null, row.sha256]])),
    },
    protectedSources: ["lib/supabase/server.ts", ...migrations.map(row => `supabase/migrations/${row.filename}`)],
    preApplyProof: { path: "/private/review/db-before.json", sha256: sha("before DB") },
    expectedScopeFunctions: afterScopes(),
  };
}

describe("reviewed AI nutrition deployment boundaries", () => {
  it("requires an exact candidate, already-applied DB and an exclusive readiness path", () => {
    const args = ["--reviewed-ai-nutrition-readiness", "--already-applied-db", "--db-config", "/private/db.env", "--reviewed-ref", "b".repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({ reviewedAiNutritionReadiness: true, alreadyAppliedDb: true });
    expect(() => parsePrelaunchOptions(["--reviewed-ai-nutrition-readiness"])).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, 4))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions(["--reviewed-ai-nutrition-readiness", "--already-applied-db", "--reviewed-ref", "b".repeat(40)])).toThrow("db-config");
    for (const other of ["--reviewed-feedback-readiness", "--reviewed-beta-readiness", "--reviewed-repair-readiness"])
      expect(() => parsePrelaunchOptions([...args, other])).toThrow("함께");
  });

  it("classifies only the exact Next bootstrap as an API, retaining runtime denials", () => {
    const pkg = { scripts: { build: "next build", start: "node scripts/start-production.mjs", "test:product": "vitest run" } };
    const result = classifyPrelaunchScope(["instrumentation.ts"], pkg, pkg);
    expect(result.web).toEqual(["instrumentation.ts"]);
    expect(result.api).toEqual(["instrumentation.ts"]);
    expect(prelaunchVerificationScripts(result, pkg)).toEqual(["test:product"]);
    for (const path of ["instrumentation.js", "scripts/lib/local-mac-production.mjs", "scripts/start-production.mjs", "scripts/worker.mjs", "infra/new-runtime.yml"])
      expect(() => classifyPrelaunchScope([path], pkg, pkg)).toThrow("허용하지 않는");
    const offline = ["scripts/render-ingredient-nutrition-rambutan-20261008.mjs", "scripts/render-ingredient-nutrition-representatives-20261008.mjs", "scripts/sql/ingredient-nutrition-rambutan-20261008.sql", "scripts/sql/ingredient-nutrition-representatives-20261008.sql"];
    expect(classifyPrelaunchScope(offline, pkg, pkg).support).toEqual(offline);
    expect(() => classifyPrelaunchScope(["scripts/sql/ingredient-nutrition-unreviewed.sql"], pkg, pkg)).toThrow("허용하지 않는");
  });

  it("requires an immutable private manifest pin with no flag/environment override", () => {
    for (const pin of [{ path: null, sha256: null }, { path: "review.json", sha256: sha("review") }, { path: "/private/review.json", sha256: "changed" }])
      expect(() => assertAiNutritionReviewPin(pin)).toThrow("not configured");
    expect(() => assertAiNutritionReviewPin({ path: "/private/review.json", sha256: sha("review") })).not.toThrow();
  });

  it("admits only the pinned three SQL additions and rejects all infrastructure", () => {
    const manifest = review();
    expect(() => assertAiNutritionReview(manifest)).not.toThrow();
    expect(() => assertAiNutritionReview({ ...manifest, previousMigrationCount: 201 })).toThrow("204-to-207");
    expect(() => assertAiNutritionReview({ ...manifest, migrationCount: 208 })).toThrow("204-to-207");
    expect(() => assertAiNutritionReview({ ...manifest, migrations: manifest.migrations.slice(1) })).toThrow("three migration");
    expect(() => assertAiNutritionReview({ ...manifest, files: { ...manifest.files, "infra/runtime.yml": [null, sha("new")] } })).toThrow("infrastructure");
    expect(() => assertAiNutritionReview({ ...manifest, files: { ...manifest.files, "supabase/migrations/20261008100000_extra.sql": [null, sha("new")] } })).toThrow("exact three");
    const path = `supabase/migrations/${manifest.migrations[0].filename}`;
    expect(() => assertAiNutritionReview({ ...manifest, files: { ...manifest.files, [path]: [null, sha("tampered")] } })).toThrow("exact three");
    expect(() => assertAiNutritionReview({ ...manifest, proofDigests: {} })).toThrow("proof pins");
    expect(() => assertAiNutritionReview({ ...manifest, protectedSources: ["not-reviewed.ts"] })).toThrow("protected source");
    expect(() => assertAiNutritionReview({ ...manifest, expectedScopeFunctions: manifest.expectedScopeFunctions.map(row =>
      row.name === "verify_full_local_internal_scope" ? { ...row, acl: ["postgres=X/postgres", "service_role=X/postgres"] } : row) })).toThrow("owner-only");
  });

  it("checks the full diff and both source images, not just candidate names", () => {
    const manifest = review(); const files = Object.keys(manifest.files);
    const input = { review: manifest, liveSha: manifest.from, releaseSha: manifest.to, files, actualFiles: files, digests: manifest.files };
    expect(() => assertAiNutritionSource(input)).not.toThrow();
    expect(() => assertAiNutritionSource({ ...input, liveSha: "d".repeat(40) })).toThrow("source pair");
    expect(() => assertAiNutritionSource({ ...input, files: files.slice(1) })).toThrow("complete source diff");
    expect(() => assertAiNutritionSource({ ...input, actualFiles: [...files, "lib/auth/new.ts"] })).toThrow("complete source diff");
    expect(() => assertAiNutritionSource({ ...input, digests: { ...manifest.files, "instrumentation.ts": [null, sha("different")] } })).toThrow("source bytes");
    const fullTree = Buffer.from("100644 blob aaaa\tinstrumentation.ts\0");
    expect(() => assertAiNutritionApplicationTree(fullTree, Buffer.from(fullTree))).not.toThrow();
    expect(() => assertAiNutritionApplicationTree(Buffer.alloc(0), fullTree)).toThrow("application tree");
  });

  it("requires all old SQL bytes plus exactly the three reviewed additions", () => {
    const before = beforeLedger(); const additions = newLedger(); const source = [...before, ...additions];
    expect(() => assertAiNutritionMigrationTransition(before, source, additions)).not.toThrow();
    expect(() => assertAiNutritionAppliedLedger(source, structuredClone(source))).not.toThrow();
    expect(() => assertAiNutritionAppliedLedger(source, source.slice(1))).toThrow("ledger differs");
    expect(() => assertAiNutritionAppliedLedger(source, [...source].reverse())).toThrow("ledger differs");
    expect(() => assertAiNutritionMigrationTransition(before, source.map((r, i) => i === 2 ? { ...r, sha256: sha("edited old SQL") } : r), additions)).toThrow("predecessor");
    expect(() => assertAiNutritionMigrationTransition(before, [...before, ...additions.map((r, i) => i === 0 ? { ...r, sha256: sha("edited new SQL") } : r)], additions)).toThrow("new migration bytes");
    expect(() => assertAiNutritionMigrationTransition(before, [...source, source[0]], additions)).toThrow("migration ledger");
  });

  it("preserves every old delegate and requires both exact new scope aliases", () => {
    const before = beforeScopes(); const after = afterScopes();
    expect(() => assertAiNutritionScopePreserved(before, after, after)).not.toThrow();
    const dropped = after.filter(row => row.name !== "verify_scope_pre_ai_refresh_20261008");
    expect(() => assertAiNutritionScopePreserved(before, dropped, dropped)).toThrow("two reviewed");
    const changed = after.map(row => row.name === "verify_scope_pre_ingredient_ai_20261008" ? { ...row, bodySha256: sha("relaxed") } : row);
    expect(() => assertAiNutritionScopePreserved(before, changed, changed)).toThrow("delegate or authority");
    const acl = after.map(row => row.name.endsWith("_base") ? { ...row, acl: ["anon=X/postgres"] } : row);
    expect(() => assertAiNutritionScopePreserved(before, acl, acl)).toThrow("delegate or authority");
    expect(() => assertAiNutritionScopePreserved(before, after, dropped)).toThrow("reviewed post-apply");
  });

  it("fails closed unless the singleton worker policy is disabled", async () => {
    const query = vi.fn(async () => "disabled");
    await expect(assertAiNutritionDisabled({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(AI_NUTRITION_DISABLED_SQL);
    for (const value of ["unsafe", "", "enabled", "null"]) {
      query.mockResolvedValue(value);
      await expect(assertAiNutritionDisabled({ query })).rejects.toThrow("remain disabled");
    }
  });

  it("captures readonly pre-apply evidence with the original R2 receipt and 204 ledger", async () => {
    const receipt = { immutableScopeHash: sha("authority"), postimage: sha("marketing") };
    const values = new Map([
      [LEDGER_VALID_SQL, "t"], [AI_NUTRITION_LEDGER_SQL, JSON.stringify(beforeLedger())],
      ["SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;", JSON.stringify(receipt)],
      [IMMUTABLE_SCOPE_SQL, receipt.immutableScopeHash], [BETA_CANONICAL_POSTIMAGE_SQL, receipt.postimage],
      [AI_NUTRITION_ROWS_SQL, '{"marketing_round2_events":{"count":0,"sha256":"empty"}}'],
      [AI_NUTRITION_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "old active")])],
    ]);
    const adapter = { inspect: vi.fn(async () => ({ postgresContainerId: "exact-local" })), query: vi.fn(async (sql: string) => values.get(sql)!) };
    const result = await captureAiNutritionDatabaseBefore(adapter);
    expect(result).toMatchObject({ schema: "homecook.prelaunch-ai-nutrition-db-before.v1", ledger: beforeLedger(), target: { postgresContainerId: "exact-local" } });
    expect(adapter.query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
    values.set(AI_NUTRITION_LEDGER_SQL, JSON.stringify([...beforeLedger(), ...newLedger()]));
    await expect(captureAiNutritionDatabaseBefore(adapter)).rejects.toThrow("pre-apply 204-entry");
    values.set(AI_NUTRITION_LEDGER_SQL, JSON.stringify(beforeLedger()));
    values.set(BETA_CANONICAL_POSTIMAGE_SQL, sha("changed catalog"));
    await expect(captureAiNutritionDatabaseBefore(adapter)).rejects.toThrow("receipt no longer matches");
  });

  it("wires the separate gate before preparation and rechecks before activation", () => {
    const source = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
    expect(source).toContain("if (options.reviewedAiNutritionReadiness) await loadAiNutritionReview();");
    expect(source).toContain("return verifyAiNutritionAppliedDatabase(");
    expect(source).toContain("round2-ai-nutrition-source-review.json");
    expect(source).toMatch(/options\.reviewedAiNutritionReadiness\) await stageRound2Readiness/);
  });
});
