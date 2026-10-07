import { describe, expect, it, vi, afterEach } from "vitest";
import { parseMealLogNutritionPreviewQuery, projectMealLogNutritionPreview } from "@/lib/server/meal-log-nutrition-preview";
import { fetchMealLogNutritionPreview } from "@/lib/api/meal-log-preview";
const input = { source: {type: "ingredient" as const,id:"11111111-1111-4111-8111-111111111111"},quantity:{amount:50,unit:"g"} };
const query = () => new URLSearchParams({source_type:input.source.type,source_id:input.source.id,amount:"50",unit:"g"});
const nutrition = {calculation_status:"partial",calories_kcal:42,carbohydrate_g:5,protein_g:null,fat_g:null,sodium_mg:null};
afterEach(()=>vi.unstubAllGlobals());
describe("readonly meal nutrition preview",()=>{
  it("parses exact source and quantity and rejects invalid/duplicate/unknown query fields",()=>{
    expect(parseMealLogNutritionPreviewQuery(query())).toEqual({ok:true,value:input});
    for(const amount of ["", "0", "-1", "Infinity", "NaN", "0x10"]){ const q=query();q.set("amount",amount);expect(parseMealLogNutritionPreviewQuery(q).ok).toBe(false); }
    const duplicate=query();duplicate.append("unit","kg");expect(parseMealLogNutritionPreviewQuery(duplicate).ok).toBe(false);
    const unknown=query();unknown.set("owner","another");expect(parseMealLogNutritionPreviewQuery(unknown).ok).toBe(false);
  });
  it("preserves partial and unknown nutrient evidence",()=>{
    expect(projectMealLogNutritionPreview(nutrition,input)?.nutrition).toEqual(nutrition);
    expect(projectMealLogNutritionPreview({...nutrition,protein_g:undefined},input)).toBeNull();
  });
  it("uses a cancellable no-store GET without mutation headers",async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({success:true,data:{...input,nutrition}})});vi.stubGlobal("fetch",fetcher);
    expect(await fetchMealLogNutritionPreview(input,new AbortController().signal)).toEqual({...input,nutrition});
    expect(fetcher.mock.calls[0][0]).toContain("/api/v1/meal-log/nutrition-preview?");
    expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  });
  it("rejects response identity mismatch and invalid evidence",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({success:true,data:{...input,quantity:{amount:99,unit:"g"},nutrition}})}));
    await expect(fetchMealLogNutritionPreview(input)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  });
});
