import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({route:vi.fn(),internal:vi.fn(),evidence:vi.fn(),calculate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createRouteHandlerClient:mocks.route,createRemoteCompatibilityServiceRoleClient:()=>null,createRecipeFuturePropagationInternalClient:mocks.internal,createRecipeMealWeightReadInternalClient:mocks.evidence,createRecipeImageInternalClient:()=>null,createRecipeViewInternalClient:()=>null}));
vi.mock("@/lib/server/youtube-public-recipe-nutrition",()=>({calculatePublicYoutubeRecipeNutrition:mocks.calculate}));
vi.mock("@/lib/server/recipe-product-labels",()=>({readPublicRecipeProductLabels:async (_client:unknown,_id:unknown,rows:unknown)=>rows,readRecipeProductLabels:async (_client:unknown,rows:unknown)=>rows,recipeProductLabel:()=>""}));
const id="550e8400-e29b-41d4-a716-446655440501";
const projectedRow={id:"row",ingredient_id:"550e8400-e29b-41d4-a716-446655440502",standard_name:"양파",amount:100,unit:"g",ingredient_type:"QUANT",display_text:null,component_label:null,scalable:true,sort_order:1};
function fixture({bridge=true,projection=true,snapshotError=false,privateRecipe=false}={}){
 const recipe={id,title:"공개 유튜브",description:null,thumbnail_url:null,base_servings:2,tags:[],source_type:"youtube",created_by:"owner",visibility:privateRecipe?"private":"public",origin_recipe_id:null,deleted_at:null,revision:3,view_count:0,like_count:0,save_count:0,plan_count:0,cook_count:0};
 const from=vi.fn((table:string)=>{const data=table==="recipes"?recipe:table==="recipe_sources"?{youtube_url:"https://youtube.com/watch?v=test",youtube_video_id:"test",extraction_meta_json:bridge?{youtube_saved_canonical_bridge:true}:{}}:table==="recipe_nutrition_snapshots"?null:[];const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),order:vi.fn(()=>q),maybeSingle:async()=>({data,error:table==="recipe_nutrition_snapshots"&&snapshotError?{message:"READ_FAILED"}:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q});
 mocks.route.mockResolvedValue({auth:{getUser:async()=>({data:{user:null}})},from});
 mocks.internal.mockReturnValue({rpc:vi.fn(async()=>({data:projection?{ingredients:[projectedRow],steps:[]}:null,error:null}))});
 mocks.evidence.mockReturnValue({from:vi.fn()});
 mocks.calculate.mockResolvedValue({basis:{amount:2,unit:"serving"},values:{energy_kcal:{amount:200,status:"complete",known_amount:200,display_mode:"total"}},calculation_status:"partial",availability_reason:null,sources:[],warnings:[]});
 return from;
}
async function read(){const {GET}=await import("@/app/api/v1/recipes/[id]/route");return GET(new Request(`http://localhost/api/v1/recipes/${id}`),{params:Promise.resolve({id})});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("HOMECOOK_ENABLE_QA_FIXTURES","0");});
it("calculates missing snapshot only from an authorized public canonical projection",async()=>{fixture();const response=await read();expect(response.status).toBe(200);const body=await response.json();expect(body.data.nutrition.values.energy_kcal.amount).toBe(200);expect(mocks.calculate).toHaveBeenCalledWith(expect.objectContaining({recipeId:id,revision:3,baseServings:2,ingredients:[projectedRow]}));expect(mocks.evidence).toHaveBeenCalledOnce();});
it.each([{bridge:false},{projection:false},{privateRecipe:true},{snapshotError:true}])("never uses the fallback when projection/visibility/snapshot-read preconditions fail %j",async options=>{fixture(options);const response=await read();expect(response.status).toBe(options.privateRecipe?404:options.projection===false?500:200);expect(mocks.calculate).not.toHaveBeenCalled();expect(mocks.evidence).not.toHaveBeenCalled();});
it("keeps source read errors temporary instead of returning invented nutrition",async()=>{fixture();mocks.calculate.mockRejectedValue(new Error("READ_FAILED"));const response=await read();expect(response.status).toBe(200);expect((await response.json()).data.nutrition.availability_reason).toBe("temporarily_unavailable");});

it("preserves hybrid account maintenance failures",async()=>{fixture();mocks.calculate.mockRejectedValue(new Error("HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_SESSION_STALE::409"));const response=await read();expect(response.status).toBe(409);expect((await response.json()).error.code).toBe("ACCOUNT_SESSION_STALE");});
