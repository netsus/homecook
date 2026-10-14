import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertRecipeProductSourceFunctionInventoryResult, buildRecipeProductSourceFunctionInventorySql,
  buildCookedWeightEvidenceSourceFunctionInventorySql, buildFullLocalSecurityInventoryExpression } from "@/scripts/lib/full-local-security-inventory.mjs";
const options = { includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true,
  includeWeightImprovementParticipationFunctions: true, includeWeightImprovementSourceReadFunctions: true };
const valid = { required_functions: 104, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0, configuration: 0 };
describe("C04 prefix → C05 exact source overlay", () => {
  it("binds the offline joined record to all ten unchanged SQL files and fixed actors", () => {
    const chain = JSON.parse(readFileSync("docs/security/weight-improvement-joined-source-chain.json","utf8"));
    expect(chain.runtime_authority).toBe(false);expect(chain.collection_enabled).toBe(false);
    expect(chain.application_rows_restored).toBe(0);expect(chain.actual_eligible_samples).toBe(0);
    expect(chain.migrations).toHaveLength(10);
    for (const [index,entry] of chain.migrations.entries()) {
      expect(createHash("sha256").update(readFileSync(entry.path)).digest("hex")).toBe(entry.sha256);
      expect(entry.actor).toBe(index===7 ? "supabase_admin" : "postgres");
    }
    expect(chain.migrations.slice(-2).map((entry: {path:string})=>entry.path)).toEqual([
      "supabase/migrations/20261014230000_weight_improvement_participation.sql",
      "supabase/migrations/20261014231000_weight_improvement_source_read.sql"]);
    for (const entry of chain.source_manifests) expect(createHash("sha256").update(readFileSync(entry.path)).digest("hex")).toBe(entry.sha256);
    expect(chain.whole_inventory.result).toBe("failed_closed");expect(chain.whole_inventory_drift_not_waived).toBe(true);
    const bootstrap = readFileSync(`supabase/migrations/${chain.synthetic_worker_bootstrap.source}`,"utf8");
    const seed = bootstrap.slice(bootstrap.indexOf("insert into private.youtube_extraction_current_policy ("),
      bootstrap.indexOf("create or replace function private.youtube_extraction_policy_snapshot_digest("));
    expect(createHash("sha256").update(seed).digest("hex")).toBe(chain.synthetic_worker_bootstrap.seed_sha256);
    expect(chain.synthetic_worker_bootstrap).toMatchObject({enabled:false,synthetic_only:true});
  });
  it("keeps all source groups and preserved overloads in the final 104-signature check", () => {
    const sql = buildRecipeProductSourceFunctionInventorySql(options);
    const expected = new Map<string, string>();
    for (const name of ["recipe-product-source", "cooked-weight-evidence-source", "quantity-input-v4-source", "weight-improvement-participation-source", "weight-improvement-source-read"]) {
      const manifest = JSON.parse(readFileSync(`docs/security/${name}-function-postimages.json`, "utf8"));
      for (const entry of [...manifest.functions, ...(manifest.preserved_overloads ?? [])]) expected.set(entry.postimage.signature,entry.postimage.sourceHash);
    }
    expect(expected.size).toBe(104);
    for (const hash of expected.values()) expect(sql).toContain(hash);
    expect(sql).toContain("actual_configuration is distinct from configuration::jsonb");
    expect(assertRecipeProductSourceFunctionInventoryResult(valid, options)).toEqual(valid);
    for (const count of [48, 94, 103, 105]) expect(()=>assertRecipeProductSourceFunctionInventoryResult({...valid, required_functions:count},options)).toThrow("failed closed");
    for (const field of Object.keys(valid).slice(1)) expect(()=>assertRecipeProductSourceFunctionInventoryResult({...valid, [field]:1},options)).toThrow("failed closed");
  });
  it("retains C04 volatility/full configuration and every baseline protection with both C05 overlays", () => {
    const sql = buildFullLocalSecurityInventoryExpression({ ...options, includeSnapshotTables:true,
      includePersonalRecipeFunctions:true, includeRecipeFuturePropagationFunctions:true, includeRecipeProductFunctions:true });
    for (const clause of ["actual_volatility is distinct from quantity_volatility", "actual_configuration is distinct from exact_configuration::jsonb",
      "unexpected_role_membership_count", "snapshot_table_acl_drift_count", "function_acl_drift_count", "policy_drift_count"]) expect(sql).toContain(clause);
  });
  it("checks the preserved C01 scope alias only with an explicit C05 opt-in", () => {
    const original = buildCookedWeightEvidenceSourceFunctionInventorySql();
    const joined = buildCookedWeightEvidenceSourceFunctionInventorySql({includeWeightImprovementParticipationFunctions:true});
    expect(original).toContain("'private.verify_full_local_internal_scope()'");
    expect(joined).not.toContain("'private.verify_full_local_internal_scope()'");
    expect(joined).toContain("'private.verify_scope_pre_weight_participation_20261014()'");
  });
  it("retains both standalone group choices and rejects incomplete predecessor selections", () => {
    const c04 = {includeCookedWeightEvidenceFunctions:true, includeQuantityInputV4Functions:true};
    const c05 = {...options, includeQuantityInputV4Functions:false};
    expect(assertRecipeProductSourceFunctionInventoryResult({...valid, required_functions:48},c05).required_functions).toBe(48);
    const { configuration, ...withoutConfiguration } = valid;
    expect(configuration).toBe(0);
    expect(assertRecipeProductSourceFunctionInventoryResult({...withoutConfiguration, required_functions:94},c04).required_functions).toBe(94);
    expect(()=>buildRecipeProductSourceFunctionInventorySql({...options,includeCookedWeightEvidenceFunctions:false})).toThrow("requires");
    expect(()=>buildRecipeProductSourceFunctionInventorySql({...options,includeWeightImprovementParticipationFunctions:false})).toThrow("requires");
  });
});
