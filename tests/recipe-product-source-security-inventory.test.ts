import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertRecipeProductSourceFunctionInventoryResult, buildFullLocalSecurityInventoryExpression, buildRecipeProductSourceFunctionInventorySql } from "@/scripts/lib/full-local-security-inventory.mjs";
const options={includeSnapshotTables:true,includePersonalRecipeFunctions:true,includeRecipeFuturePropagationFunctions:true,includeRecipeProductFunctions:true};
describe("reviewed C03 function source registration",()=>{
  it("binds the local draft to the exact migration and preserves predecessor contracts",()=>{
    const manifest=JSON.parse(readFileSync("docs/security/recipe-product-source-function-postimages.json","utf8"));
    expect(manifest.status).toBe("local-review-draft");
    expect(createHash("sha256").update(readFileSync(manifest.migration)).digest("hex")).toBe(manifest.migration_sha256);
    expect(manifest.functions).toHaveLength(24);
    expect(manifest.functions.filter((entry:{checkedInInventoryPreimageMd5?:string})=>entry.checkedInInventoryPreimageMd5)).toHaveLength(5);
    for(const entry of manifest.functions) if(entry.preimage) for(const field of ["owner","securityDefiner","searchPath","allowedAcl","volatility"]) expect(entry.postimage[field]).toEqual(entry.preimage[field]);
    const previous=buildFullLocalSecurityInventoryExpression({...options,includeRecipeProductFunctions:false});
    const next=buildFullLocalSecurityInventoryExpression(options);
    for(const entry of manifest.functions) expect(next).toContain(entry.postimage.sourceHash);
    expect(next).toContain("unexpected_role_membership_count");
    expect(next).toContain("function_acl_drift_count");
    expect(previous).not.toContain("private.write_recipe_source_rows");
    expect(()=>buildFullLocalSecurityInventoryExpression({includeRecipeProductFunctions:true})).toThrow("requires all predecessor contracts");
  });
  it("fails closed for every exact source, owner, privilege or execution-context drift",()=>{
    const valid={required_functions:24,missing:0,body:0,owner:0,security:0,search_path:0,acl:0,volatility:0};
    expect(assertRecipeProductSourceFunctionInventoryResult(valid)).toEqual(valid);
    for(const field of Object.keys(valid)) expect(()=>assertRecipeProductSourceFunctionInventoryResult({...valid,[field]:1})).toThrow("failed closed");
    expect(()=>assertRecipeProductSourceFunctionInventoryResult({...valid,unreviewed:0})).toThrow("failed closed");
    expect(buildRecipeProductSourceFunctionInventorySql()).toContain("actual_volatility is distinct from volatility");
  });
});
