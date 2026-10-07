import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/meals/route";
const mocks=vi.hoisted(()=>({auth:vi.fn(),session:vi.fn(),rpc:vi.fn(),from:vi.fn(),award:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createRouteHandlerClient:async()=>({auth:{getUser:mocks.auth},from:mocks.from}),createFutureMealWriteInternalClient:()=>({rpc:mocks.rpc}),createRecipeImageInternalClient:()=>null}));
vi.mock("@/lib/server/account-generation/session-authority",()=>({readVerifiedAccountGenerationSession:mocks.session}));
vi.mock("@/lib/server/user-bootstrap",()=>({ensurePublicUserRow:async()=>{},ensureUserBootstrapState:async()=>{},formatBootstrapErrorMessage:(_:unknown,message:string)=>message}));
vi.mock("@/lib/server/user-progress",()=>({awardUserProgressEvent:mocks.award}));
const owner="11111111-1111-4111-8111-111111111111",recipe="22222222-2222-4222-8222-222222222222",column="33333333-3333-4333-8333-333333333333",key="44444444-4444-4444-8444-444444444444";
const body={recipe_id:recipe,plan_date:"2026-10-06",column_id:column,planned_servings:2};
const meal={id:"55555555-5555-4555-8555-555555555555",...body,status:"registered",is_leftover:false,leftover_dish_id:null,recipe_nutrition_snapshot_id:null};
function request(header:string|null=key){return new Request("http://localhost/api/v1/meals",{method:"POST",headers:{"Content-Type":"application/json",...(header===null?{}:{"Idempotency-Key":header})},body:JSON.stringify(body)});}
beforeEach(()=>{
 vi.clearAllMocks();delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
 mocks.auth.mockResolvedValue({data:{user:{id:owner}}});mocks.session.mockResolvedValue({ok:true,sessionAuthority:{ownerUuid:owner,authIdentityCreatedAt:"2026-01-01",sessionKeyHash:"verified",hmacKeyVersion:1,sessionIssuedAt:"2026-01-02"}});
 mocks.rpc.mockResolvedValue({data:meal,error:null});mocks.award.mockResolvedValue({});
 mocks.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==="recipes"?{id:recipe}:{id:column,user_id:owner},error:null})};return q;});
});
it("keyed create skips source prelookup and uses verified authority with stable action key",async()=>{const response=await POST(request());expect(response.status).toBe(201);expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith("create_future_meal_idempotent",expect.objectContaining({p_owner_uuid:owner,p_idempotency_key:key,p_recipe_id:recipe,p_plan_date:body.plan_date,p_column_id:column,p_planned_servings:2}));expect((await response.json()).data).toEqual(meal);});
it("keeps unkeyed older caller behavior",async()=>{expect((await POST(request(null))).status).toBe(201);expect(mocks.from).toHaveBeenCalledWith("recipes");expect(mocks.rpc).toHaveBeenCalledWith("write_future_meal_with_snapshot_authority",expect.objectContaining({p_action:"create",p_meal_id:null}));});
it("rejects invalid key and unauthorized or stale session before RPC",async()=>{expect((await POST(request("invalid"))).status).toBe(422);expect(mocks.rpc).not.toHaveBeenCalled();mocks.auth.mockResolvedValue({data:{user:null}});expect((await POST(request())).status).toBe(401);mocks.auth.mockResolvedValue({data:{user:{id:owner}}});mocks.session.mockResolvedValue({ok:false});expect((await POST(request())).status).toBe(409);expect(mocks.rpc).not.toHaveBeenCalled();});
it("maps changed-payload receipt conflict to409 and preserves growth source id on replay",async()=>{expect((await POST(request())).status).toBe(201);expect((await POST(request())).status).toBe(201);expect(mocks.award).toHaveBeenNthCalledWith(2,expect.anything(),expect.objectContaining({sourceId:meal.id,eventType:"planner_registered"}));mocks.rpc.mockResolvedValue({data:null,error:{message:"IDEMPOTENCY_KEY_REUSED"}});const response=await POST(request());expect(response.status).toBe(409);expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");});
