import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertWeightImprovementParticipationSourceFunctionInventoryResult,
  buildWeightImprovementParticipationSourceFunctionInventorySql, buildRecipeProductSourceFunctionInventorySql,
  assertRecipeProductSourceFunctionInventoryResult, buildFullLocalSecurityInventoryExpression } from "@/scripts/lib/full-local-security-inventory.mjs";

const predecessor = { includeSnapshotTables: true, includePersonalRecipeFunctions: true,
  includeRecipeFuturePropagationFunctions: true, includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true };
const manifest = JSON.parse(readFileSync("docs/security/weight-improvement-participation-source-function-postimages.json", "utf8"));

describe("C03 → C01 → C05 exact source function registration", () => {
  it("binds the unchanged migration to the real schema-only 219 predecessor and preserved C01 scope", () => {
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    expect(manifest.migration_sha256).toBe("bc263347ef51f7ffc86731b7c161618f3181b81cd00bf8f2ec57a01b989eeda8");
    expect(manifest.application_rows_restored).toBe(0);
    expect(manifest.source_ledger_count).toBe(219);
    expect(manifest.C03_C01_integration_pending).toBe(false);
    expect(manifest.whole_inventory_drift_not_waived).toBe(true);
    expect(manifest.functions).toHaveLength(8);
    expect(manifest.functions.filter((entry: { preimage: unknown }) => entry.preimage)).toHaveLength(1);
    const before = buildFullLocalSecurityInventoryExpression(predecessor);
    const after = buildFullLocalSecurityInventoryExpression({ ...predecessor, includeWeightImprovementParticipationFunctions: true });
    for (const entry of manifest.functions) {
      expect(after).toContain(entry.postimage.sourceHash);
      if (entry.preimage) {
        expect(before).toContain(entry.checkedInInventoryPreimageMd5);
        for (const field of ["owner", "allowedAcl", "searchPath", "securityDefiner", "volatility", "configuration"]) {
          expect(entry.postimage[field]).toEqual(entry.preimage[field]);
        }
      }
    }
    const c01 = JSON.parse(readFileSync("docs/security/cooked-weight-evidence-source-function-postimages.json", "utf8"));
    for (const entry of c01.functions) expect(after).toContain(entry.postimage.sourceHash);
    expect(after).toContain("unexpected_role_membership_count");
    expect(after).toContain("function_acl_drift_count");
    expect(after).toContain("actual_configuration is distinct from exact_configuration::jsonb");
  });
  it("requires the C03 and C01 predecessor opt-ins, retaining the old default contracts", () => {
    expect(() => buildFullLocalSecurityInventoryExpression({ includeWeightImprovementParticipationFunctions: true }))
      .toThrow("requires the cooked weight predecessor");
    expect(() => buildRecipeProductSourceFunctionInventorySql({ includeWeightImprovementParticipationFunctions: true }))
      .toThrow("requires the cooked weight predecessor");
    expect(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true }))
      .not.toContain("verify_scope_pre_weight_participation_20261014");
    expect(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true,
      includeWeightImprovementParticipationFunctions: true })).toContain("verify_scope_pre_weight_participation_20261014");
  });
  it("rejects source, owner, ACL, full configuration and every unexpected result field", () => {
    const valid = { required_functions: 8, missing: 0, body: 0, owner: 0, security: 0, search_path: 0, acl: 0, volatility: 0, configuration: 0 };
    expect(assertWeightImprovementParticipationSourceFunctionInventoryResult(valid)).toEqual(valid);
    for (const field of Object.keys(valid)) {
      expect(() => assertWeightImprovementParticipationSourceFunctionInventoryResult({ ...valid, [field]: 1 })).toThrow("failed closed");
    }
    expect(() => assertWeightImprovementParticipationSourceFunctionInventoryResult({ ...valid, extra: 0 })).toThrow("failed closed");
    expect(() => assertWeightImprovementParticipationSourceFunctionInventoryResult({ ...valid, configuration: undefined })).toThrow("failed closed");
    expect(buildWeightImprovementParticipationSourceFunctionInventorySql()).toContain("actual_configuration is distinct from configuration::jsonb");
    expect(assertRecipeProductSourceFunctionInventoryResult({ ...valid, required_functions: 45 }, {
      includeCookedWeightEvidenceFunctions: true, includeWeightImprovementParticipationFunctions: true })).toMatchObject({ required_functions: 45 });
  });
});
