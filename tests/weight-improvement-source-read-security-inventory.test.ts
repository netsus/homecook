import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWeightImprovementSourceReadFunctionInventorySql, assertWeightImprovementSourceReadFunctionInventoryResult,
  buildWeightImprovementParticipationSourceFunctionInventorySql, buildRecipeProductSourceFunctionInventorySql,
  assertRecipeProductSourceFunctionInventoryResult, buildFullLocalSecurityInventoryExpression,
  assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult } from "@/scripts/lib/full-local-security-inventory.mjs";
const flags = { includeSnapshotTables: true, includePersonalRecipeFunctions: true, includeRecipeFuturePropagationFunctions: true,
  includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true, includeWeightImprovementParticipationFunctions: true };
const sourceFlags = { ...flags, includeWeightImprovementSourceReadFunctions: true };
const manifest = JSON.parse(readFileSync("docs/security/weight-improvement-source-read-function-postimages.json","utf8"));
describe("D3 exact read source registration", () => {
  it("binds four functions to exact C01/C05/231000 source and preserves the C05 scope predecessor", () => {
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    expect(manifest.predecessor_C01_sha256).toBe("60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0");
    expect(manifest.predecessor_C05_sha256).toBe("bc263347ef51f7ffc86731b7c161618f3181b81cd00bf8f2ec57a01b989eeda8");
    expect(manifest.functions).toHaveLength(4);expect(manifest.application_rows_restored).toBe(0);expect(manifest.C04_integration_pending).toBe(true);
    const expected=buildWeightImprovementSourceReadFunctionInventorySql();
    for (const entry of manifest.functions) expect(expected).toContain(entry.postimage.sourceHash);
    expect(expected).toContain("actual_configuration is distinct from configuration::jsonb");
    const full=buildFullLocalSecurityInventoryExpression(sourceFlags);
    for (const entry of manifest.functions) expect(full).toContain(entry.postimage.sourceHash);
    for (const field of ["sourceHash","owner","securityDefiner","searchPath","allowedAcl","volatility","configuration"]) {
      expect(manifest.preserved_scope_predecessor.before[field]).toEqual(manifest.preserved_scope_predecessor.renamed[field]);
    }
    expect(full).toContain("function_acl_drift_count");expect(full).toContain("unexpected_role_membership_count");
  });
  it("retains old defaults and only maps the original C05 outer to its preserved alias with an explicit opt-in", () => {
    expect(buildRecipeProductSourceFunctionInventorySql(flags)).not.toContain("project_weight_improvement_sample_source");
    expect(buildRecipeProductSourceFunctionInventorySql(sourceFlags)).toContain("project_weight_improvement_sample_source");
    const old=buildWeightImprovementParticipationSourceFunctionInventorySql();
    const mapped=buildWeightImprovementParticipationSourceFunctionInventorySql({includeWeightImprovementSourceReadFunctions:true});
    expect(old).not.toContain("verify_scope_pre_weight_source_read_20261014");
    expect(mapped).toContain("verify_scope_pre_weight_source_read_20261014");
    expect(mapped).not.toContain("'private.verify_full_local_internal_scope()'");
    for (const options of [{includeWeightImprovementSourceReadFunctions:true},
      {includeCookedWeightEvidenceFunctions:true,includeWeightImprovementSourceReadFunctions:true}]) {
      expect(()=>buildRecipeProductSourceFunctionInventorySql(options)).toThrow("requires the participation predecessor");
      expect(()=>buildFullLocalSecurityInventoryExpression(options)).toThrow();
      expect(()=>assertRecipeProductSourceFunctionInventoryResult({},options)).toThrow("requires the participation predecessor");
    }
    for (const predecessor of Object.keys(flags)) {
      const missing = { ...sourceFlags, [predecessor]: false };
      expect(()=>buildFullLocalSecurityInventoryExpression(missing)).toThrow("requires");
      expect(()=>assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult({},missing)).toThrow("requires");
    }
  });
  it("fails closed on wrong counts, body/owner/ACL/configuration drift and unknown output fields", () => {
    const valid={required_functions:4,missing:0,body:0,owner:0,security:0,search_path:0,acl:0,volatility:0,configuration:0};
    expect(assertWeightImprovementSourceReadFunctionInventoryResult(valid)).toEqual(valid);
    for (const key of Object.keys(valid)) expect(()=>assertWeightImprovementSourceReadFunctionInventoryResult({...valid,[key]:1})).toThrow("failed closed");
    expect(()=>assertWeightImprovementSourceReadFunctionInventoryResult({...valid,extra:0})).toThrow("failed closed");
    expect(assertRecipeProductSourceFunctionInventoryResult({...valid,required_functions:48},sourceFlags)).toMatchObject({required_functions:48});
    expect(()=>assertRecipeProductSourceFunctionInventoryResult({...valid,required_functions:45},sourceFlags)).toThrow("failed closed");
  });
});
