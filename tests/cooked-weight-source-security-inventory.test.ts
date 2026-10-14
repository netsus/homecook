import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCookedWeightEvidenceSourceFunctionInventoryResult, buildCookedWeightEvidenceSourceFunctionInventorySql,
  buildFullLocalSecurityInventoryExpression, buildRecipeProductSourceFunctionInventorySql } from "@/scripts/lib/full-local-security-inventory.mjs";

const options = { includeSnapshotTables: true, includePersonalRecipeFunctions: true,
  includeRecipeFuturePropagationFunctions: true, includeRecipeProductFunctions: true };
describe("reviewed C03 to C01 function registration", () => {
  it("binds six source deltas and nine signatures without replacing unrelated protections", () => {
    const manifest = JSON.parse(readFileSync("docs/security/cooked-weight-evidence-source-function-postimages.json", "utf8"));
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    const c03 = JSON.parse(readFileSync("docs/security/recipe-product-source-function-postimages.json", "utf8"));
    expect(manifest.predecessor_C03_sha256).toBe(c03.migration_sha256);
    expect(manifest.application_rows_restored).toBe(0);
    expect(manifest.C03_integration_pending).toBe(false);
    expect(manifest.functions).toHaveLength(15);
    expect(manifest.functions.filter((entry: { preimage: unknown }) => entry.preimage)).toHaveLength(6);
    const before = buildFullLocalSecurityInventoryExpression(options);
    const after = buildFullLocalSecurityInventoryExpression({ ...options, includeCookedWeightEvidenceFunctions: true });
    for (const entry of manifest.functions) {
      if (entry.checkedInInventoryPreimageMd5) expect(before).toContain(entry.checkedInInventoryPreimageMd5);
      expect(after).toContain(entry.postimage.sourceHash);
      if (entry.preimage) for (const field of ["owner", "allowedAcl", "searchPath", "securityDefiner", "volatility"])
        expect(entry.postimage[field]).toEqual(entry.preimage[field]);
    }
    for (const entry of c03.functions) if (entry.postimage.name !== "read_snapshot_v2_cook_mode")
      expect(after).toContain(entry.postimage.sourceHash);
    expect(after).toContain("unexpected_role_membership_count");
    expect(after).toContain("function_acl_drift_count");
    expect(() => buildFullLocalSecurityInventoryExpression({ includeCookedWeightEvidenceFunctions: true })).toThrow("requires the recipe product predecessor");
    expect(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true })).toContain("verify_scope_pre_cooked_weight_evidence_20261013");
  });
  it("rejects every source or metadata mismatch and unknown result fields", () => {
    const valid = { required_functions: 15, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0 };
    expect(assertCookedWeightEvidenceSourceFunctionInventoryResult(valid)).toEqual(valid);
    for (const field of Object.keys(valid)) expect(() => assertCookedWeightEvidenceSourceFunctionInventoryResult({ ...valid, [field]: 1 })).toThrow("failed closed");
    expect(() => assertCookedWeightEvidenceSourceFunctionInventoryResult({ ...valid, extra: 0 })).toThrow("failed closed");
    expect(buildCookedWeightEvidenceSourceFunctionInventorySql()).toContain("actual_volatility is distinct from volatility");
  });
});
