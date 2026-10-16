import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  finalizeResolvedSourceBoundQuantities,
  prepareSourceBoundQuantitiesForResolution,
} from "../scripts/lib/youtube-extraction-worker-runtime.mjs";

function ingredient(amount = "1/3", unit = "g") {
  return { name: "소금", amount, unit, quantityState: "explicit", amountBasis: "source-bound-stated",
    evidenceRefs: [{ source_method: "description", source_provider: "youtube", snippet: `소금 ${amount}${unit}` }] };
}

describe("worker quantity-v4 transport", () => {
  it("binds the native source postimages to the exact additive migration and unchanged existing permissions", () => {
    const manifest = JSON.parse(readFileSync("docs/security/youtube-worker-quantity-function-postimages.json", "utf8"));
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    expect(manifest.functions).toHaveLength(13);
    expect(manifest.functions.filter(({ preimage }: { preimage: unknown }) => preimage === null)
      .map(({ postimage }: { postimage: { signature: string } }) => postimage.signature)).toEqual([
      "private.validate_youtube_saved_quantity_legacy(jsonb, jsonb)",
      "private.youtube_worker_quantity_input_v4(jsonb, jsonb)",
      "private.youtube_worker_quantity_write_admission_v4()",
    ]);
    expect(manifest.catalog_computation_context).toEqual({ role: "youtube_extraction_credential_manager_rpc_owner", search_path: "" });
    const legacy = manifest.functions.find(({ postimage }: { postimage: { signature: string } }) =>
      postimage.signature === "private.validate_youtube_saved_quantity_legacy(jsonb, jsonb)");
    const validator = manifest.functions.find(({ postimage }: { postimage: { signature: string } }) =>
      postimage.signature === "private.validate_youtube_saved_recipe_editable_content(jsonb, jsonb)");
    expect(legacy.postimage.source_md5).toBe(validator.preimage.source_md5);
    for (const { preimage, postimage } of manifest.functions) {
      if (!preimage) continue;
      for (const key of ["owner", "security_definer", "config", "acl", "volatility"]) expect(postimage[key]).toEqual(preimage[key]);
    }
  });
  it.each(["1/3", "0.125", "200"])("carries verified literal %s without rounding or modifying the input", amount => {
    const input = { recipe: { ingredients: [ingredient(amount)] } };
    const before = structuredClone(input);
    const prepared = prepareSourceBoundQuantitiesForResolution(input);
    expect(prepared.runtimeResult.recipe.ingredients[0]).toMatchObject({
      amount, unit: "g", amountBasis: "stated",
      quantity_input: { schema_version: "quantity-v4", raw_value: amount, raw_unit: "g" },
    });
    expect(prepared.ingredientIndexes).toEqual([0]);
    expect(input).toEqual(before);
  });

  it("keeps original source units and never supplies density, cup or piece evidence", () => {
    for (const unit of ["mL", "T", "t", "cup", "통", "알", "package"]) {
      const prepared = prepareSourceBoundQuantitiesForResolution({ recipe: { ingredients: [ingredient("1", unit)] } });
      expect(prepared.runtimeResult.recipe.ingredients[0].quantity_input).toEqual({
        schema_version: "quantity-v4", raw_value: "1", raw_unit: unit,
      });
      expect(prepared.runtimeResult.recipe.ingredients[0]).not.toHaveProperty("unit_context");
    }
  });

  it("leaves metadata-missing legacy results byte-identical", () => {
    const input = { recipe: { ingredients: [{ name: "소금", amount: "1/3", unit: "g" }] } };
    expect(prepareSourceBoundQuantitiesForResolution(input).runtimeResult).toBe(input);
  });

  it("retains unsupported mixed fractions and source evidence without inventing a normalized input", () => {
    const input = ingredient("1 1/2");
    const output = prepareSourceBoundQuantitiesForResolution({ recipe: { ingredients: [input] } }).runtimeResult.recipe.ingredients[0];
    expect(output).not.toHaveProperty("quantity_input");
    expect(output.amount).toBe("1 1/2");
    expect(output.evidenceRefs).toEqual(input.evidenceRefs);
  });

  it.each(["unknown", "conflicting", "estimated", "to_taste"])("never promotes %s quality", quantityState => {
    const input = { ...ingredient("1"), quantityState, amountBasis: null };
    expect(prepareSourceBoundQuantitiesForResolution({ recipe: { ingredients: [input] } }).runtimeResult.recipe.ingredients[0])
      .not.toHaveProperty("quantity_input");
  });

  it("rejects prefilled model conversion metadata instead of treating it as server evidence", () => {
    for (const field of ["quantity_input", "unit_context"]) {
      expect(() => prepareSourceBoundQuantitiesForResolution({ recipe: { ingredients: [{ ...ingredient(), [field]: {} }] } }))
        .toThrow("untrusted worker quantity metadata");
    }
  });

  it("removes normalized metadata when the independent ingredient resolver fails", () => {
    const output = finalizeResolvedSourceBoundQuantities({ draft: { ingredients: [{ standard_name: "그릇",
      amount: 1, unit: "개", resolution_status: "unresolved", quantity_input: { normalized: { amount: 200, unit: "g" } },
      quantity_context_fingerprint: "a".repeat(64) }] } }, [0]);
    expect(output.draft.ingredients[0]).toMatchObject({ amount: null, unit: null, quantity_state: "unknown" });
    expect(output.draft.ingredients[0]).not.toHaveProperty("quantity_input");
    expect(output.draft.ingredients[0]).not.toHaveProperty("quantity_context_fingerprint");
  });
});
