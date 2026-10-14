import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mock.client,
  createRemoteCompatibilityServiceRoleClient: () => null, createRecipeImageInternalClient: () => null,
  createRecipeFuturePropagationInternalClient: () => null }));
vi.mock("@/lib/server/recipe-nutrition-snapshot", async (original) => ({
  ...await original<typeof import("@/lib/server/recipe-nutrition-snapshot")>(), readCurrentRecipeNutritionSnapshot: async () => null,
}));
vi.mock("@/lib/server/recipe-snapshot-entrypoint", () => ({ readRecipeSnapshotEntrypointContext: async () => ({ revision: 1 }) }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: async (_client: unknown, user: {id: string}) => ({ok:true,sessionAuthority:{ownerUuid:user.id}}) }));
const id = (n: number) => `79000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner = id(1), recipe = id(2), product = id(3), version = id(4);
function client(actor: string | null, allowed: boolean) {
  const row = { id:id(5), ingredient_id: id(6), food_product_id:product,food_product_nutrition_version_id:version,
    amount:0.125,unit:"package",ingredient_type:"QUANT",display_text:"사용량",component_label:null,scalable:true,sort_order:0,ingredients:{standard_name:"일반 분류"} };
  const result = (table: string) => ({ data: table==="recipes" ? { id:recipe,title:"공개 레시피",base_servings:2,source_type:"system",created_by:owner,visibility:"public",deleted_at:null,revision:1,tags:[],thumbnail_url:null }
    : table==="recipe_sources" ? null : table==="recipe_ingredients" ? [actor ? row : {...row,food_product_id:undefined,food_product_nutrition_version_id:undefined}] : table==="food_products" && allowed ? [{id:product,name:"비공개 제품명",brand:"소유자 업체"}] : [], error:null });
  return { auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},
    rpc:vi.fn(async()=>({data:allowed?[{row_key:row.id,food_product_id:product,food_product_nutrition_version_id:version,food_product_name:"공개 제품명",food_product_brand:null}]:[],error:allowed?null:{message:"RECIPE_PRODUCT_READ_UNAVAILABLE"}})),
    from:(table:string)=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,
      maybeSingle:async()=>result(table),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result(table)).then(resolve)};return q;},
  };
}
beforeEach(()=>{vi.resetModules();mock.client.mockReset();});
describe("public recipe product identity boundary",()=>{
  it.each([null,id(9)])("never returns an excluded legacy private product pin to anon or another account (%s)",async(actor)=>{
    mock.client.mockResolvedValue(client(actor,false));
    const detail=await import("@/app/api/v1/recipes/[id]/route");
    const cook=await import("@/app/api/v1/recipes/[id]/cook-mode/route");
    for(const response of [await detail.GET(new Request("http://localhost/api/v1/recipes/"+recipe),{params:Promise.resolve({id:recipe})}),
      await cook.GET(new Request("http://localhost/api/v1/recipes/"+recipe+"/cook-mode?servings=2"),{params:Promise.resolve({id:recipe})})]){
      expect(response.status).toBe(500);
      const text=await response.text();
      for(const secret of [product,version,"비공개 제품명","소유자 업체"]) expect(text).not.toContain(secret);
      expect(JSON.parse(text)).toMatchObject({success:false,data:null,error:{code:"INTERNAL_ERROR"}});
    }
  });
  it.each([null,owner])("preserves approved public or source-owner labels and original quantity (%s)",async(actor)=>{
    mock.client.mockResolvedValue(client(actor,true));
    const {GET}=await import("@/app/api/v1/recipes/[id]/cook-mode/route");
    const response=await GET(new Request("http://localhost/api/v1/recipes/"+recipe+"/cook-mode?servings=2"),{params:Promise.resolve({id:recipe})});
    expect(response.status).toBe(200);
    expect((await response.json()).data.recipe.ingredients[0]).toMatchObject({amount:0.125,unit:"package",display_text: `${actor ? "소유자 업체 · 비공개 제품명" : "공개 제품명"} 0.125package`,food_product_id:product,food_product_nutrition_version_id:version});
  });
});
