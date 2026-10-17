import {beforeEach,describe,expect,it,vi} from "vitest";
const spies=vi.hoisted(()=>({rpc:vi.fn(),calculate:vi.fn(),authorized:true}));
vi.mock("@/lib/server/cooked-batch-route",()=>({authorizeCookedBatchRequest:async()=>spies.authorized?{ok:true,user:{id:"owner"},authorityArgs:{fixture_authority:"unchanged"},client:{rpc:spies.rpc},routeClient:{rpc:spies.rpc}}:{ok:false,response:new Response(JSON.stringify({success:false,data:null,error:{code:"UNAUTHORIZED",message:"login",fields:[]}}),{status:401})},readJson:async(request:Request)=>({ok:true,value:await request.json()})}));
vi.mock("@/lib/supabase/server",()=>({createRecipeMealWeightReadInternalClient:()=>({from:()=>null})}));
vi.mock("@/lib/server/cooking-execution-quantities",async actual=>({...await actual<typeof import("@/lib/server/cooking-execution-quantities")>(),calculateExecutionQuantities:spies.calculate}));
import {PATCH} from "@/app/api/v1/cooking/session-attempts/[id]/ingredients/route";
const id="c3000000-0000-4000-8000-000000000001",ingredient="c5000000-0000-4000-8000-000000000001",pin="c2000000-0000-4000-8000-000000000001";
const row={ingredient_id:ingredient,standard_name:"food",amount:100,unit:"g",ingredient_type:"QUANT",scalable:true,display_text:null};
const state={revision:0,snapshot_id:pin,base_servings:2,cooking_servings:4,original_rows:[row],rows:[row],steps:[],nutrition_snapshot:null,prediction:null};
const mode={session_id:id,contract_version:"snapshot_v2",mode:"standalone",status:"in_progress",recipe:{id:ingredient,title:"food",base_servings:2,cooking_servings:4,ingredients:[row],steps:[]},pantry_candidates:[]};
const body={expected_revision:0,changes:[{row_index:0,amount:190,unit:"g"}]};
const context={params:Promise.resolve({id})};
function request(value:unknown=body){return new Request("http://fixture.invalid/ingredients",{method:"PATCH",headers:{"Idempotency-Key":"c4000000-0000-4000-8000-000000000001"},body:JSON.stringify(value)});}
beforeEach(()=>{spies.authorized=true;spies.rpc.mockReset();spies.calculate.mockReset();spies.calculate.mockResolvedValue({nutritionSnapshot:{server_only:true},prediction:{server_only:true}});spies.rpc.mockResolvedValueOnce({data:mode,error:null}).mockResolvedValueOnce({data:state,error:null}).mockResolvedValueOnce({data:{success:true,data:{revision:1},error:null},error:null});});
describe("execution quantity PATCH boundary",()=>{
 it("passes only server calculated nutrition and identity-preserving rows to the scoped writer",async()=>{
  expect((await PATCH(request(),context)).status).toBe(200);expect(spies.calculate.mock.calls[0][0].rows[0]).toMatchObject({ingredient_id:ingredient,amount:190,scalable:false});
  expect(spies.rpc.mock.calls[2][0]).toBe("save_cooking_execution_quantities");expect(spies.rpc.mock.calls[2][1]).toMatchObject({fixture_authority:"unchanged",p_expected_revision:0,p_nutrition_snapshot:{server_only:true},p_prediction:{server_only:true},p_request_changes:body.changes});
 });
 it("rejects client supplied nutrition and source identity fields before any read",async()=>{for(const value of [{...body,prediction:{totalGrams:1000}},{...body,changes:[{...body.changes[0],ingredient_id:"other"}]}])expect((await PATCH(request(value),context)).status).toBe(422);expect(spies.rpc).not.toHaveBeenCalled();});
 it("rejects unauthenticated requests without reading any source or calculation",async()=>{spies.authorized=false;expect((await PATCH(request(),context)).status).toBe(401);expect(spies.rpc).not.toHaveBeenCalled();expect(spies.calculate).not.toHaveBeenCalled();});
 it("preserves state conflicts and infrastructure failure instead of returning fake save success",async()=>{
  spies.rpc.mockReset();spies.rpc.mockResolvedValueOnce({data:mode,error:null}).mockResolvedValueOnce({data:state,error:null}).mockResolvedValueOnce({data:null,error:{code:"55000",message:"CONFLICT"}});expect((await PATCH(request(),context)).status).toBe(409);
  spies.rpc.mockReset();spies.rpc.mockResolvedValueOnce({data:mode,error:null}).mockResolvedValueOnce({data:state,error:null});spies.calculate.mockRejectedValue(new Error("SOURCE_READ_FAILED"));expect((await PATCH(request(),context)).status).toBe(503);expect(spies.rpc).toHaveBeenCalledTimes(2);
 });
});
