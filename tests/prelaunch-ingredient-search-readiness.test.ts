import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  INGREDIENT_SEARCH_ANONYMOUS_SQL, INGREDIENT_SEARCH_LEDGER_SQL, INGREDIENT_SEARCH_MIGRATIONS,
  INGREDIENT_SEARCH_ROWS_SQL, INGREDIENT_SEARCH_SCOPE_SQL, INGREDIENT_SEARCH_WORKER_SQL,
  assertIngredientSearchAnonymousBody, assertIngredientSearchAppliedLedger,
  assertIngredientSearchAuthorityPreserved, assertIngredientSearchMigrationTransition,
  assertIngredientSearchPreservation, assertIngredientSearchReview, assertIngredientSearchReviewPin,
  assertIngredientSearchSource, assertIngredientSearchWorkerPrivileges,
  captureIngredientSearchDatabaseBefore, ingredientSearchFunctionEvidence,
} from "../scripts/lib/prelaunch-ingredient-search-readiness.mjs";
import { AI_NUTRITION_DISABLED_SQL, AI_NUTRITION_SCOPE_SQL } from "../scripts/lib/prelaunch-ai-nutrition-readiness.mjs";
import { DeploymentError, parsePrelaunchOptions } from "../scripts/lib/prelaunch-web-deploy.mjs";
import { IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { BETA_CANONICAL_POSTIMAGE_SQL } from "../scripts/lib/prelaunch-beta-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const active = "verify_full_local_anonymous_authority";
const alias = "verify_anonymous_pre_canonical_search_20261009";
const worker = "youtube_extraction_worker_rpc_owner";
const scope = (name: string, source: string) => ({ name, source, owner: "postgres", acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });
type Evidence = Omit<ReturnType<typeof scope>, "source"> & { bodySha256: string };
const evidence = (rows: ReturnType<typeof scope>[]): Evidence[] => ingredientSearchFunctionEvidence(rows);
const wrapper = readFileSync("supabase/migrations/20261009090000_ingredient_canonical_search.sql", "utf8")
  .split("create or replace function private.verify_full_local_anonymous_authority()")[1].split("as $function$")[1].split("$function$;")[0];
const scopes = () => evidence([scope("verify_full_local_internal_scope", "active"), scope("verify_scope_pre_luna", "Luna predecessor")]);
const anonymousBefore = () => evidence([scope(active, "old authority"), scope("verify_anonymous_pre_legacy", "legacy authority")]);
const anonymousRows = () => [scope(active, wrapper), scope(alias, "old authority"), scope("verify_anonymous_pre_legacy", "legacy authority")];
const workerPrivileges = () => ({
  role: { name: worker, superuser: false, inherit: false, bypassRls: false, canLogin: false },
  rlsEnabled: true, tableSelect: false, tableWrite: false, privateEvidenceSelect: false,
  columns: ["ingredient_id", "presentation", "representative_ingredient_id", "updated_at"].map(name => ({ name, select: name !== "updated_at", write: false })),
  policies: [
    { name: "existing_owner", command: "r", permissive: true, roles: ["authenticated"], appliesToWorker: false, using: "old scope", check: null },
    { name: "ingredient_catalog_alias_worker_read", command: "r", permissive: true, roles: [worker], appliesToWorker: true, using: "(presentation = 'alias'::text)", check: null },
  ],
});
const beforeLedger = () => Array.from({ length: 211 }, (_, i) => ({ filename: `${String(i).padStart(14, "0")}_old.sql`, sha256: sha(String(i)) }));
const additions = () => INGREDIENT_SEARCH_MIGRATIONS.map(filename => ({ filename, sha256: sha(filename) }));
function review() {
  const migrations = additions();
  return {
    schema: "homecook.prelaunch-ingredient-search-review.v1", from: "a".repeat(40), to: "b".repeat(40), migrationSourceRef: "c".repeat(40),
    previousMigrationCount: 211, migrationCount: 212, migrations,
    originalReadinessSha256: sha("readiness"),
    proofDigests: Object.fromEntries(["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"].map(name => [name, sha(name)])),
    files: { "lib/ingredients/search.ts": [sha("old"), sha("new")], ...Object.fromEntries(migrations.map(row => [`supabase/migrations/${row.filename}`, [null, row.sha256]])) },
    protectedSources: migrations.map(row => `supabase/migrations/${row.filename}`),
    preApplyProof: { path: "/private/before.json", sha256: sha("before") },
    preservationProof: { path: "/private/preserved.json", sha256: sha("preserved") },
    expectedScopeFunctions: scopes(), expectedAnonymousFunctions: evidence(anonymousRows()), expectedWorkerPrivileges: workerPrivileges(),
  };
}
const authorityStates = () => {
  const after = { scopeFunctions: scopes(), anonymousFunctions: evidence(anonymousRows()), anonymousRows: anonymousRows(), workerPrivileges: workerPrivileges() };
  const before = { scopeFunctions: scopes(), anonymousFunctions: anonymousBefore(), workerPrivileges: { ...workerPrivileges(), policies: workerPrivileges().policies.slice(0, 1) } };
  return { before, after };
};

describe("reviewed canonical ingredient search deployment", () => {
  it("requires exact SHA, separately applied DB and mutually exclusive reviewed paths", () => {
    const args = ["--reviewed-ingredient-search-readiness", "--already-applied-db", "--db-config", "/private/db.env", "--reviewed-ref", "b".repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({ reviewedIngredientSearchReadiness: true });
    expect(() => parsePrelaunchOptions(args.slice(0, 1))).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, 4))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions(args.filter(arg => !["--db-config", "/private/db.env"].includes(arg)))).toThrow("db-config");
    for (const flag of ["--reviewed-ai-nutrition-readiness", "--reviewed-feedback-readiness", "--reviewed-beta-readiness", "--reviewed-repair-readiness", "--reviewed-youtube-trial-readiness"])
      expect(() => parsePrelaunchOptions([...args, flag])).toThrow("함께");
  });
  it("fails closed without a private immutable pin", () => {
    expect(() => assertIngredientSearchReviewPin({ path: null, sha256: null })).toThrow(DeploymentError);
    expect(() => assertIngredientSearchReviewPin({ path: "relative", sha256: sha("pin") })).toThrow("not configured");
    expect(() => assertIngredientSearchReviewPin({ path: "/private/pin", sha256: sha("pin") })).not.toThrow();
  });
  it("requires exact 211 to 212 transition and one SQL, source and proof pins", () => {
    const r = review();
    expect(() => assertIngredientSearchReview(r)).not.toThrow();
    expect(() => assertIngredientSearchReview({ ...r, previousMigrationCount: 207 })).toThrow("211-to-212");
    expect(() => assertIngredientSearchReview({ ...r, migrations: [...r.migrations, ...r.migrations] })).toThrow("one migration");
    for (const path of ["infra/runtime.yml", "supabase/migrations/20261009090100_extra.sql"])
      expect(() => assertIngredientSearchReview({ ...r, files: { ...r.files, [path]: [null, sha("extra")] } })).toThrow();
    expect(() => assertIngredientSearchReview({ ...r, proofDigests: {} })).toThrow("proof pins");
    expect(() => assertIngredientSearchReview({ ...r, protectedSources: ["unreviewed"] })).toThrow("protected source");
    expect(() => assertIngredientSearchReview({ ...r, expectedAnonymousFunctions: r.expectedAnonymousFunctions.map(row => ({ ...row, acl: ["anon=X/postgres"] })) })).toThrow("owner-only");
  });
  it("pins full before and after source bytes", () => {
    const r = review(); const files = Object.keys(r.files);
    const input = { review: r, liveSha: r.from, releaseSha: r.to, files, actualFiles: files, digests: r.files };
    expect(() => assertIngredientSearchSource(input)).not.toThrow();
    expect(() => assertIngredientSearchSource({ ...input, liveSha: "d".repeat(40) })).toThrow("source pair");
    expect(() => assertIngredientSearchSource({ ...input, actualFiles: [...files, "lib/unreviewed.ts"] })).toThrow("complete source diff");
    expect(() => assertIngredientSearchSource({ ...input, digests: {} })).toThrow("source bytes");
  });
  it("preserves all predecessor SQL and admits exactly one new checksum", () => {
    const before = beforeLedger(); const extra = additions(); const after = [...before, ...extra];
    expect(() => assertIngredientSearchMigrationTransition(before, after, extra)).not.toThrow();
    expect(() => assertIngredientSearchAppliedLedger(after, structuredClone(after))).not.toThrow();
    expect(() => assertIngredientSearchAppliedLedger(after, after.slice(1))).toThrow("ledger differs");
    expect(() => assertIngredientSearchMigrationTransition(before, after.map((row, i) => i === 1 ? { ...row, sha256: sha("changed") } : row), extra)).toThrow("predecessor");
    expect(() => assertIngredientSearchMigrationTransition(before, [...before, { ...extra[0], sha256: sha("changed") }], extra)).toThrow("new migration bytes");
  });
  it("admits only the exact anonymous GET alias-view wrapper", () => {
    expect(() => assertIngredientSearchAnonymousBody(anonymousRows())).not.toThrow();
    for (const changed of [wrapper.replace("'GET'", "'POST'"), wrapper.replace("'/ingredient_catalog_aliases'", "'/ingredients'"), wrapper.replace("= 'ingredients'", "is not null"), wrapper.replace("  perform private.", "  return; perform private.")])
      expect(() => assertIngredientSearchAnonymousBody([scope(active, changed)])).toThrow("exact GET");
  });
  it("preserves every internal and anonymous predecessor, with exactly one renamed delegate", () => {
    const { before, after } = authorityStates();
    expect(() => assertIngredientSearchAuthorityPreserved(before, after, review())).not.toThrow();
    expect(() => assertIngredientSearchAuthorityPreserved(before, { ...after, scopeFunctions: after.scopeFunctions.slice(1) }, review())).toThrow("internal scope");
    const changed = { ...after, anonymousFunctions: after.anonymousFunctions.map(row => row.name === alias ? { ...row, bodySha256: sha("relaxed") } : row) };
    expect(() => assertIngredientSearchAuthorityPreserved(before, changed, { ...review(), expectedAnonymousFunctions: changed.anonymousFunctions })).toThrow("not preserved");
    const policies = { ...after.workerPrivileges, policies: after.workerPrivileges.policies.map(row => row.name === "existing_owner" ? { ...row, using: "changed owner" } : row) };
    expect(() => assertIngredientSearchAuthorityPreserved(before, { ...after, workerPrivileges: policies }, { ...review(), expectedWorkerPrivileges: policies })).toThrow("pre-existing");
  });
  it("rejects expanded role, table, column and private evidence privileges even if pinned", () => {
    expect(() => assertIngredientSearchWorkerPrivileges(workerPrivileges(), workerPrivileges())).not.toThrow();
    for (const mutate of [
      (p: ReturnType<typeof workerPrivileges>) => { p.role.inherit = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.tableSelect = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.tableWrite = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.privateEvidenceSelect = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.columns[3].select = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.columns[0].write = true; },
      (p: ReturnType<typeof workerPrivileges>) => { p.policies[1].using = "true"; },
      (p: ReturnType<typeof workerPrivileges>) => { p.policies[0].appliesToWorker = true; },
    ]) { const p = workerPrivileges(); mutate(p); expect(() => assertIngredientSearchWorkerPrivileges(p, p)).toThrow(); }
  });
  it("binds equal nutrition/history checksums to the source and SQL reviewed", () => {
    const r = review(); const checksums = { officialNutrition: sha("nutrition"), historicalRecords: sha("history") };
    const proof = { schema: "homecook.ingredient-search-preservation.v1", verified: true, migrationSourceRef: r.migrationSourceRef, migration: r.migrations[0], before: checksums, after: { ...checksums } };
    expect(() => assertIngredientSearchPreservation(proof, r)).not.toThrow();
    expect(() => assertIngredientSearchPreservation({ ...proof, migrationSourceRef: "d".repeat(40) }, r)).toThrow("preservation");
    expect(() => assertIngredientSearchPreservation({ ...proof, after: { ...checksums, historicalRecords: sha("changed") } }, r)).toThrow("preservation");
    expect(() => assertIngredientSearchPreservation({ ...proof, verified: false }, r)).toThrow("preservation");
  });
  it("initializes adapter before any read and captures the actual 211 internal chain", async () => {
    const receipt = { immutableScopeHash: sha("authority"), postimage: sha("marketing") };
    const values = new Map([
      [LEDGER_VALID_SQL, "t"], [INGREDIENT_SEARCH_LEDGER_SQL, JSON.stringify(beforeLedger())],
      ["SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;", JSON.stringify(receipt)],
      [IMMUTABLE_SCOPE_SQL, receipt.immutableScopeHash], [BETA_CANONICAL_POSTIMAGE_SQL, receipt.postimage],
      [INGREDIENT_SEARCH_ROWS_SQL, '{"marketing_round2_events":{"count":0,"sha256":"empty"}}'],
      [AI_NUTRITION_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "active")])],
      [AI_NUTRITION_DISABLED_SQL, "disabled"],
      [INGREDIENT_SEARCH_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "active"), scope("verify_scope_pre_luna", "Luna predecessor")])],
      [INGREDIENT_SEARCH_ANONYMOUS_SQL, JSON.stringify([scope(active, "old authority"), scope("verify_anonymous_pre_legacy", "legacy authority")])],
      [INGREDIENT_SEARCH_WORKER_SQL, JSON.stringify(authorityStates().before.workerPrivileges)],
    ]);
    let initialized = false;
    const adapter = { inspect: vi.fn(async () => { initialized = true; return { postgresContainerId: "exact-local" }; }), query: vi.fn(async (sql: string) => { if (!initialized) throw new Error("not initialized"); return values.get(sql)!; }) };
    const proof = await captureIngredientSearchDatabaseBefore(adapter);
    expect(proof).toMatchObject({ schema: "homecook.prelaunch-ingredient-search-db-before.v1", scopeFunctions: scopes(), ledger: beforeLedger() });
    expect(adapter.inspect).toHaveBeenCalledOnce();
    expect(adapter.query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
    values.set(AI_NUTRITION_DISABLED_SQL, "enabled");
    await expect(captureIngredientSearchDatabaseBefore(adapter)).rejects.toThrow("remain disabled");
    values.set(AI_NUTRITION_DISABLED_SQL, "disabled"); values.set(INGREDIENT_SEARCH_LEDGER_SQL, JSON.stringify([...beforeLedger(), ...additions()]));
    await expect(captureIngredientSearchDatabaseBefore(adapter)).rejects.toThrow("211-entry");
  });
  it("wires the new gate before preparation and again before activation", () => {
    const code = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
    expect(code).toContain("if (options.reviewedIngredientSearchReadiness) await loadIngredientSearchReview();");
    expect(code).toContain("return verifyIngredientSearchAppliedDatabase(");
    expect(code).toContain("await reviewedIngredientSearchReadiness({ ...input, databasePlan");
    expect(code).toContain("round2-ingredient-search-source-review.json");
    expect(code).toMatch(/options\.reviewedIngredientSearchReadiness \|\| options\.reviewedPieceUnitReadiness\) await stageRound2Readiness/);
  });
});
