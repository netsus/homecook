import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/recipes/[id]/publish/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), verified: vi.fn(), rpc: vi.fn(), prepare: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: async () => ({ auth: { getUser: mocks.auth } }),
  createRecipeFuturePropagationInternalClient: () => ({ rpc: mocks.rpc }),
  createRecipeImageInternalClient: () => ({ storage: {} }),
}));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: mocks.verified }));
vi.mock("@/lib/server/recipe-nutrition-service", () => ({ prepareRecipeNutritionSnapshot: mocks.prepare }));
vi.mock("@/lib/server/recipe-nutrition-snapshot", () => ({ createRecipeNutritionSnapshotPayload: () => ({ complete: true }) }));
vi.mock("@/lib/server/manual-recipe-publication", () => ({ publishManualRecipe: mocks.publish }));
const recipeId = "00000000-0000-4000-8000-000000000001";
const key = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: recipeId }) };
const request = () => new Request(`http://localhost/api/v1/recipes/${recipeId}/publish`, { method: "POST", body: JSON.stringify({ owner: "other", idempotency_key: "untrusted", visibility: "public" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.verified.mockResolvedValue({ ok: true, sessionAuthority: { ownerUuid: "owner" } });
  mocks.rpc.mockResolvedValue({ data: { recipe_id: recipeId, idempotency_key: key }, error: null });
  mocks.prepare.mockResolvedValue({ calculation: {}, expectedRecipeVersion: "version", inputGuard: { rows: [] } });
  mocks.publish.mockResolvedValue({ id: recipeId, visibility: "public" });
});
describe("explicit publication of an existing authored recipe", () => {
  it("uses only the verified owner and stored receipt key, and publishes after preparing nutrition", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("read_owned_manual_recipe_publication_context", expect.objectContaining({ p_owner_uuid: "owner", p_recipe_id: recipeId }));
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: key, recipeId, expectedUpdatedAt: "version", nutritionSnapshot: { complete: true } }));
    expect((await response.json()).data).toEqual({ id: recipeId, visibility: "public" });
  });
  it("does not publish without a logged-in session", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects stale or mismatched owner authority", async () => {
    mocks.verified.mockResolvedValue({ ok: true, sessionAuthority: { ownerUuid: "other" } });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing authored receipts and forks before calculating or publishing", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "RESOURCE_NOT_FOUND" } });
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects a mismatched receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: { recipe_id: key, idempotency_key: key }, error: null });
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("never reports success when publication or nutrition preparation fails", async () => {
    mocks.publish.mockRejectedValue(new Error("copy interrupted"));
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect((await response.json()).success).toBe(false);
  });
});
