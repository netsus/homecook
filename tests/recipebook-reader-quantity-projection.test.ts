import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatScaledIngredient } from "@/lib/recipe";
const mocks = vi.hoisted(() => ({ route: vi.fn(), internal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createRecipeFuturePropagationInternalClient: mocks.internal }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: async () => {}, ensureUserBootstrapState: async () => {}, formatBootstrapErrorMessage: () => "bootstrap failed" }));
const book="550e8400-e29b-41d4-a716-446655440041", recipe="550e8400-e29b-41d4-a716-446655440051";
const product="550e8400-e29b-41d4-a716-446655440061", version="550e8400-e29b-41d4-a716-446655440062";
function quantity(raw: string, unit: string) { return { schema_version: "quantity-v4", raw_value: raw, raw_unit: unit, numerator:"1", denominator:raw.split('/')[1], normalized:null,
  quality:"unavailable",reason:"DENSITY_REQUIRED",evidence_ids:[],source_versions:[],batch_basis:null,context_sha256:"a".repeat(64) }; }
function fixture({ actor="owner", bookOwner="owner", member=true, hiddenProduct=false, productRow=false, invalid=false }={}) {
  const selects: Record<string,string>={};const reads:string[]=[];
  const rows=[{id:"milk",ingredient_id:"milk",source_kind:"ingredient",amount:1/3,unit:"L",ingredient_type:"QUANT",display_text:"우유",scalable:true,sort_order:1,ingredients:{standard_name:"우유"},quantity_input:quantity("1/3","L")},
    {id:"flour",ingredient_id:"flour",source_kind:"ingredient",amount:1/7,unit:"kg",ingredient_type:"QUANT",display_text:"밀가루",scalable:true,sort_order:2,ingredients:{standard_name:"밀가루"},quantity_input:quantity("1/7","kg")}];
  const productIngredient={id:"product-row",ingredient_id:null,source_kind:"food_product",food_product_id:product,food_product_nutrition_version_id:version,amount:1/3,unit:"package",ingredient_type:"QUANT",display_text:"원문 제품",scalable:true,sort_order:1,ingredients:null,
    quantity_input:{...quantity("1/3","package"),normalized:{amount:40,unit:"g"},quality:"direct",reason:null,source_versions:[invalid?"wrong-version":version]}};
  const ingredients:Record<string,unknown>[]=productRow?[productIngredient]:rows;
  const resolve=(table:string)=>({error:null,data:table==="recipe_books"?{id:book,user_id:bookOwner,book_type:"custom"}:table==="recipe_book_items"?(member?{id:"membership",added_at:"2026-10-17"}:null)
    :table==="recipes"?{id:recipe,title:"QA",base_servings:2,created_by:"owner",source_type:"manual",tags:[],thumbnail_url:null,view_count:0}
    :table==="recipe_steps"?[]:table==="food_products"?(hiddenProduct?[]:[{id:product,name:"제품",brand:"등록업체"}])
    :ingredients.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key==="ingredients"?selects[table].includes("ingredients("):selects[table].split(",").map(s=>s.trim()).includes(key))))});
  const client={auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},from:vi.fn((table:string)=>{
    reads.push(table);const q={select:vi.fn((columns:string)=>{selects[table]=columns;return q;}),eq:vi.fn(()=>q),order:vi.fn(()=>q),in:vi.fn(()=>q),maybeSingle:async()=>resolve(table),then:(r: (v:unknown)=>unknown,j: (e:unknown)=>unknown)=>Promise.resolve(resolve(table)).then(r,j)};return q;
  })};mocks.route.mockResolvedValue(client);return {selects,reads,ingredients};
}
async function read() {const {GET}=await import("@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route");return GET(new Request(`http://localhost/api/v1/recipe-books/${book}/recipes/${recipe}`),{params:Promise.resolve({book_id:book,recipe_id:recipe})});}
beforeEach(()=>{mocks.route.mockReset();mocks.internal.mockReset();vi.stubEnv("HOMECOOK_ENABLE_QA_FIXTURES","0");});
describe("real recipebook reader projection through formatter",()=>{
  it("selects and returns exact original quantities rather than relying on overcomplete fixture rows",async()=>{
    const f=fixture();const response=await read();const body=await response.json();expect(response.status).toBe(200);
    expect(body.data.ingredients.map((row: Parameters<typeof formatScaledIngredient>[0])=>formatScaledIngredient(row,2,2))).toEqual(["우유 1/3L","밀가루 1/7kg"]);
    expect(body.data.ingredients[0].quantity_input).toEqual(f.ingredients[0].quantity_input);
    expect(body.data.ingredients[0].amount).toBe(1/3);expect(f.reads).not.toContain("food_products");expect(mocks.internal).not.toHaveBeenCalled();
  });
  it("retains product/version and its raw package quantity using only the authenticated client's visible label",async()=>{
    fixture({productRow:true});const response=await read();const body=await response.json();expect(response.status).toBe(200);
    const row=body.data.ingredients[0];expect(row.food_product_id).toBe(product);expect(row.food_product_nutrition_version_id).toBe(version);
    expect(formatScaledIngredient(row,2,2)).toBe("등록업체 · 제품 1/3팩");expect(mocks.internal).not.toHaveBeenCalled();
  });
  it.each([{actor:"",expected:401},{bookOwner:"other",expected:403},{member:false,expected:404}])("keeps auth/book membership boundary $expected",async values=>{
    const f=fixture(values);expect((await read()).status).toBe(values.expected);expect(f.reads).not.toContain("recipe_ingredients");expect(mocks.internal).not.toHaveBeenCalled();
  });
  it.each([{hiddenProduct:true},{invalid:true}])("fails closed for unavailable product or invalid quantity proof %j",async values=>{
    fixture({productRow:true,...values});const response=await read();expect(response.status).toBe(500);expect(await response.json()).toMatchObject({success:false,data:null,error:{code:"INTERNAL_ERROR"}});
  });
});
