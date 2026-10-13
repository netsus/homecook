import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({client:vi.fn(),generation:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createRouteHandlerClient:mock.client,createAccountLifecycleInternalRpcClient:()=>null}));
vi.mock("@/lib/server/user-bootstrap",()=>({ensurePublicUserRow:async()=>{},ensureUserBootstrapState:async()=>{},formatBootstrapErrorMessage:()=>"failure"}));
vi.mock("@/lib/server/account-generation/profile-subject",()=>({readProfileAccountGeneration:mock.generation}));
const owner="79000000-0000-4000-8000-000000000001";
const profile={id:owner,nickname:"원래닉네임",email:"fixture@example.invalid",profile_image_url:null,social_provider:"google",settings:{screen_wake_lock:false}};
beforeEach(()=>{vi.resetModules();mock.client.mockReset();mock.generation.mockReset();mock.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:owner,created_at:"2026-01-01T00:00:00Z"}}})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{...profile,settings_json:{}},error:null})};return q;}});});
describe("owner profile optional subject",()=>{
 it.each([2,null])("preserves the entire profile with verified generation or missing metadata (%s)",async(generation)=>{mock.generation.mockResolvedValue(generation);const {GET}=await import("@/app/api/v1/users/me/route");const response=await GET(new Request("http://localhost/api/v1/users/me"));expect(response.status).toBe(200);const body=await response.json();expect(body).toEqual({success:true,data:generation===null?profile:{...profile,account_generation:2},error:null});expect(JSON.stringify(body)).not.toMatch(/session_key_hash|issuer|hmac_key/);});
 it("does not fail ordinary profile reads when subject transport is unavailable",async()=>{mock.generation.mockRejectedValue(new Error("offline"));const {GET}=await import("@/app/api/v1/users/me/route");const response=await GET(new Request("http://localhost/api/v1/users/me?account_generation=99"));expect(response.status).toBe(200);expect((await response.json()).data).toEqual(profile);});
});
