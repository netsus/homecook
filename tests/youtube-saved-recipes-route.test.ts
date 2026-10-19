import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, readVerified, rpc, publication } = vi.hoisted(() => ({
  getUser: vi.fn(),
  readVerified: vi.fn(),
  rpc: vi.fn(),
  publication: vi.fn(),
}));

vi.mock("@/lib/server/youtube-saved-recipe-nutrition", () => ({ publishSavedYoutubeRecipeNutrition: publication }));

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser } })),
  createRecipeFuturePropagationInternalClient: vi.fn(() => ({ rpc })),
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession: readVerified,
}));

import {
  handleCreateYoutubeSavedRecipe,
  handleGetYoutubeSavedRecipe,
  handleUpdateYoutubeSavedRecipe,
} from "@/lib/server/youtube-saved-recipes";
import { GET } from "@/app/api/v1/recipes/youtube/saved-drafts/[draft_id]/route";

const authority = {
  ownerUuid: "10000000-0000-4000-8000-000000000001",
  authIdentityCreatedAt: "2026-01-01T00:00:00.000Z",
  sessionKeyHash: "a".repeat(64),
  hmacKeyVersion: 1,
  sessionIssuedAt: "2026-01-01T00:00:01.000Z",
};

const content = {
  title: "저장 결과",
  base_servings: 2,
  tags: [],
  ingredients: [{
    row_id: "40000000-0000-4000-8000-000000000001",
    source_draft_ingredient_id: null,
    standard_name: "알 수 없는 재료",
    quantity_mode: "unknown",
    amount: null,
    unit: null,
    display_text: null,
    component_label: null,
  }],
  steps: [{
    row_id: "50000000-0000-4000-8000-000000000001",
    source_step_index: null,
    instruction: "섞는다",
    component_label: null,
    duration_text: null,
  }],
};

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/v1/recipes/youtube/saved-drafts", {
    method,
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": "60000000-0000-4000-8000-000000000001",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  publication.mockResolvedValue({ status: "pending" });
  getUser.mockResolvedValue({ data: { user: { id: authority.ownerUuid } } });
  readVerified.mockResolvedValue({ ok: true, sessionAuthority: authority });
});
afterEach(() => vi.unstubAllEnvs());

describe("youtube saved recipe route boundary", () => {
  it.each(["ready", "pending", "stale"])("preserves the durable successful save and adds honest publication status=%s", async status => {
    const saved = { draft_id: "70000000-0000-4000-8000-000000000001", recipe_id: "80000000-0000-4000-8000-000000000001",
      revision: 3, canonical_content_hash: "c".repeat(64), updated_at: "2026-10-19T00:00:00+00:00",
      content: { ...content, ingredients: [{ ...content.ingredients[0], catalog_ingredient_id: null }] } };
    const before = structuredClone(saved);
    rpc.mockResolvedValue({ data: { success: true, data: saved, error: null }, error: null });
    publication.mockResolvedValue({ status });
    const response = await handleUpdateYoutubeSavedRecipe(request({ expected_revision: 2, content: saved.content }, "PATCH"), saved.draft_id);
    expect(response.status).toBe(200);expect((await response.json()).data).toEqual({ ...before, nutrition_publication: { status } });
    expect(publication).toHaveBeenCalledOnce();expect(publication.mock.calls[0][0]).toMatchObject({ receipt: before, authority });
    expect(saved).toEqual(before);expect(rpc).toHaveBeenCalledOnce();
  });

  it.each(["80000000-0000-4000-8000-000000000001", null])("passes an explicit catalog choice without changing an unknown quantity: %s", async catalog_ingredient_id => {
    const edited = { ...content, ingredients: [{ ...content.ingredients[0], catalog_ingredient_id }] };
    rpc.mockResolvedValue({ data: { success: true, data: {}, error: null }, error: null });
    const response = await handleUpdateYoutubeSavedRecipe(request({ expected_revision: 2, content: edited }, "PATCH"), "70000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("write_youtube_saved_recipe_result", expect.objectContaining({
      p_expected_revision: 2, p_editable_content: edited,
    }));
  });
  it.each(["not-a-uuid", 3, {}, "80000000-0000-4000-8000-000000000001/path"])("rejects malformed catalog selection %j before RPC", async catalog_ingredient_id => {
    const edited = { ...content, ingredients: [{ ...content.ingredients[0], catalog_ingredient_id }] };
    const response = await handleUpdateYoutubeSavedRecipe(request({ expected_revision: 2, content: edited }, "PATCH"), "70000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a requested protocol and the web write flag for raw fractional updates", async () => {
    const edited = { ...content, ingredients: [{ ...content.ingredients[0], quantity_mode: "quantity", amount: 1 / 3, unit: "g",
      quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g", expected_context_fingerprint: "b".repeat(64) } }] };
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    const missingHeader = await handleUpdateYoutubeSavedRecipe(request({ expected_revision: 1, content: edited }, "PATCH"), "70000000-0000-4000-8000-000000000001");
    expect(missingHeader.status).toBe(422); expect(rpc).not.toHaveBeenCalled();
    const withHeader = () => {
      const value = request({ expected_revision: 1, content: edited }, "PATCH");
      value.headers.set("X-Homecook-Quantity-Contract", "quantity-v4"); return value;
    };
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    expect((await handleUpdateYoutubeSavedRecipe(withHeader(), "70000000-0000-4000-8000-000000000001")).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "true");
    rpc.mockResolvedValue({ data: { success: true, data: { draft_id: "70000000-0000-4000-8000-000000000001" }, error: null }, error: null });
    expect((await handleUpdateYoutubeSavedRecipe(withHeader(), "70000000-0000-4000-8000-000000000001")).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("write_youtube_saved_recipe_result", expect.objectContaining({
      p_editable_content: expect.objectContaining({ ingredients: [expect.objectContaining({ quantity_input: edited.ingredients[0].quantity_input })] }),
    }));
  });

  it("separates opt-in stored quantity reads from current write capability and leaves the RPC data untouched", async () => {
    const data = { content: { ...content, ingredients: [{ ...content.ingredients[0], quantity_input: { schema_version: "quantity-v4", raw_value: "1/3" },
      quantity_context_fingerprint: "a".repeat(64) }] }, quantity_policy: "quantity-v4", quantity_contexts: {} };
    const before = structuredClone(data);
    rpc.mockResolvedValue({ data: { success: true, data, error: null }, error: null });
    const legacy = await (await handleGetYoutubeSavedRecipe("70000000-0000-4000-8000-000000000001")).json();
    expect(legacy.data.content.ingredients[0]).not.toHaveProperty("quantity_input");
    expect(legacy.data).not.toHaveProperty("quantity_policy");
    const read = new Request("http://localhost/fixture", { headers: { "X-Homecook-Quantity-Contract": "quantity-v4" } });
    vi.stubEnv("MUMEOK_QUANTITY_V4_ENABLED", "false");
    const opted = await (await handleGetYoutubeSavedRecipe("70000000-0000-4000-8000-000000000001", read)).json();
    expect(opted.data.content.ingredients[0].quantity_input.raw_value).toBe("1/3");
    expect(opted.data.quantity_policy).toBeNull();
    expect(data).toEqual(before);
  });

  it("forwards the real GET request opt-in and keeps the existing verified subject boundary", async () => {
    const data = { content: { ...content, ingredients: [{ ...content.ingredients[0], quantity_input: { raw_value: "1/3" } }] },
      quantity_policy: "quantity-v4", quantity_contexts: {} };
    rpc.mockResolvedValue({ data: { success: true, data, error: null }, error: null });
    const read = new Request("http://localhost/fixture", { headers: { "X-Homecook-Quantity-Contract": "quantity-v4" } });
    const context = { params: Promise.resolve({ draft_id: "70000000-0000-4000-8000-000000000001" }) };
    expect((await (await GET(read, context)).json()).data.content.ingredients[0].quantity_input).toEqual({ raw_value: "1/3" });
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: authority.ownerUuid } } });
    readVerified.mockResolvedValue({ ok: false, code: "ACCOUNT_SESSION_STALE" });
    expect((await GET(read, context)).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["QUANTITY_CONTEXT_CHANGED", 409], ["QUANTITY_INPUT_REQUIRED", 409], ["UNIT_POLICY_INACTIVE", 503], ["UNIT_CONVERSION_MISSING", 422]])
    ("returns %s without exposing the SQL detail", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { message: `${code}: private SQL detail` } });
      const response = await handleUpdateYoutubeSavedRecipe(request({ expected_revision: 1, content }, "PATCH"), "70000000-0000-4000-8000-000000000001");
      expect(response.status).toBe(status);
      const payload = await response.json();
      expect(payload.error.code).toBe(code);
      expect(JSON.stringify(payload)).not.toContain("private SQL detail");
    });
  it("ensures a saved result from only the trusted extraction id", async () => {
    rpc.mockResolvedValue({
      data: { success: true, data: { draft_id: "70000000-0000-4000-8000-000000000001" }, error: null },
      error: null,
    });
    const response = await handleCreateYoutubeSavedRecipe(request({
      extraction_id: "20000000-0000-4000-8000-000000000001",
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("ensure_youtube_saved_recipe_result", expect.objectContaining({
      p_extraction_id: "20000000-0000-4000-8000-000000000001",
      p_idempotency_key: "60000000-0000-4000-8000-000000000001",
      p_owner_uuid: authority.ownerUuid,
    }));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_editable_content");
  });

  it("requires authentication before calling the internal RPC", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await handleCreateYoutubeSavedRecipe(request({
      extraction_id: "20000000-0000-4000-8000-000000000001",
      content,
    }));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects client-supplied evidence and catalog identity fields", async () => {
    const response = await handleCreateYoutubeSavedRecipe(request({
      extraction_id: "20000000-0000-4000-8000-000000000001",
      content: {
        ...content,
        ingredients: [{
          ...content.ingredients[0],
          ingredient_id: "30000000-0000-4000-8000-000000000001",
          quantity_evidence_refs: [{ snippet: "spoof" }],
        }],
      },
    }));
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only normalized editable content to the scoped RPC", async () => {
    rpc.mockResolvedValue({
      data: { success: true, data: { draft_id: "70000000-0000-4000-8000-000000000001" }, error: null },
      error: null,
    });
    const response = await handleCreateYoutubeSavedRecipe(request({
      extraction_id: "20000000-0000-4000-8000-000000000001",
      content: { ...content, title: "  저장 결과  " },
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("write_youtube_saved_recipe_result", expect.objectContaining({
      p_action: "create",
      p_editable_content: expect.objectContaining({ title: "저장 결과" }),
      p_owner_uuid: authority.ownerUuid,
    }));
  });

  it("maps optimistic revision conflicts without exposing database details", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "CONFLICT internal detail" } });
    const response = await handleUpdateYoutubeSavedRecipe(request({
      expected_revision: 1,
      content,
    }, "PATCH"), "70000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error.code).toBe("CONFLICT");
    expect(JSON.stringify(payload)).not.toContain("internal detail");
  });

  it("requires authentication for saved-result reads", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await handleGetYoutubeSavedRecipe("70000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
