import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertQuantityInputV4SourceFunctionInventoryResult, buildFullLocalSecurityInventoryExpression } from "@/scripts/lib/full-local-security-inventory.mjs";

const options = { includeSnapshotTables: true, includePersonalRecipeFunctions: true,
  includeRecipeFuturePropagationFunctions: true, includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true };

describe("C04 exact integrated source registration", () => {
  it("uses an opt-in overlay while preserving default contracts and every unrelated protection", () => {
    const manifest = JSON.parse(readFileSync("docs/security/quantity-input-v4-source-function-postimages.json", "utf8"));
    const before = buildFullLocalSecurityInventoryExpression(options);
    const after = buildFullLocalSecurityInventoryExpression({ ...options, includeQuantityInputV4Functions: true });
    expect(after).not.toBe(before);
    expect(manifest.functions).toHaveLength(60);
    expect(manifest.preserved_overloads).toHaveLength(3);
    expect(manifest.historical_preimage_mismatches).toHaveLength(4);
    for (const overload of manifest.preserved_overloads) expect(overload.postimage).toEqual(overload.preimage);
    expect(manifest.functions.filter(({ preimage }: { preimage: unknown }) => preimage)).toHaveLength(33);
    for (const migration of manifest.migrations) expect(createHash("sha256").update(readFileSync(migration.path)).digest("hex")).toBe(migration.sha256);
    for (const { postimage, preimage } of manifest.functions) {
      expect(after).toContain(postimage.sourceHash);
      if (preimage) for (const field of ["owner", "allowedAcl", "searchPath", "securityDefiner", "volatility"])
        expect(postimage[field]).toEqual(preimage[field]);
    }
    for (const name of ["unexpected_role_membership_count", "function_acl_drift_count", "policy_missing_count", "snapshot_table_acl_drift_count"])
      expect(after).toContain(name);
    expect(after).not.toContain("baseline_source_hash");
    expect(buildFullLocalSecurityInventoryExpression(options)).toBe(before);
  });

  it("requires the complete C03 and C01 predecessor chain", () => {
    expect(() => buildFullLocalSecurityInventoryExpression({ includeQuantityInputV4Functions: true })).toThrow();
    expect(() => buildFullLocalSecurityInventoryExpression({ ...options, includeCookedWeightEvidenceFunctions: false,
      includeQuantityInputV4Functions: true })).toThrow();
  });

  it("fails closed on every source/execution mismatch and unexpected result fields", () => {
    const valid = { required_functions: 63, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0 };
    expect(assertQuantityInputV4SourceFunctionInventoryResult(valid)).toEqual(valid);
    for (const field of Object.keys(valid)) expect(() => assertQuantityInputV4SourceFunctionInventoryResult({ ...valid, [field]: 1 })).toThrow("failed closed");
    expect(() => assertQuantityInputV4SourceFunctionInventoryResult({ ...valid, unreviewed: 0 })).toThrow("failed closed");
  });
});
