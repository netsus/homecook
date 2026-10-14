import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCookedWeightAttestationSourceFunctionInventorySql, assertCookedWeightAttestationSourceFunctionInventoryResult,
  buildFullLocalSecurityInventoryExpression, buildRecipeProductSourceFunctionInventorySql } from "@/scripts/lib/full-local-security-inventory.mjs";

const options = { includeSnapshotTables: true, includePersonalRecipeFunctions: true, includeRecipeFuturePropagationFunctions: true,
  includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true };
describe("personal attestation exact opt-in source registration", () => {
  it("adds ten exact contracts and two private ACL/RLS tables only after the real C04 predecessor", () => {
    const manifest = JSON.parse(readFileSync("docs/security/cooked-weight-user-attestation-source-function-postimages.json", "utf8"));
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    expect(manifest.functions).toHaveLength(10);
    const before = buildFullLocalSecurityInventoryExpression(options);
    const after = buildFullLocalSecurityInventoryExpression({ ...options, includeCookedWeightAttestationFunctions: true });
    for (const entry of manifest.functions) {
      expect(after).toContain(entry.postimage.sourceHash);
      if (entry.preimage) expect(before).toContain(entry.preimage.sourceHash);
      expect(buildCookedWeightAttestationSourceFunctionInventorySql()).toContain(entry.postimage.definitionSha256);
    }
    for (const table of ["cooked_weight_user_attestations", "cooked_weight_user_attestation_control"]) {
      expect(before).not.toContain(table);expect(after).toContain(table);
    }
    for (const protection of ["unexpected_role_membership_count", "function_acl_drift_count", "snapshot_table_acl_drift_count", "rls_owner_drift_count"]) expect(after).toContain(protection);
    expect(() => buildFullLocalSecurityInventoryExpression({ includeCookedWeightAttestationFunctions: true })).toThrow("requires quantity v4");
    expect(() => buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightAttestationFunctions: true })).toThrow("requires quantity v4");
  });
  it("rejects missing/source/default-argument/config/owner/ACL/volatility drift and unknown result fields", () => {
    const valid = { required_functions: 10, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0 };
    expect(assertCookedWeightAttestationSourceFunctionInventoryResult(valid)).toEqual(valid);
    for (const field of Object.keys(valid)) expect(() => assertCookedWeightAttestationSourceFunctionInventoryResult({ ...valid, [field]: 1 })).toThrow("failed closed");
    expect(() => assertCookedWeightAttestationSourceFunctionInventoryResult({ ...valid, ignored: 0 })).toThrow("failed closed");
  });
});
