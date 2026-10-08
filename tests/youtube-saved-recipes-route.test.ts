import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, readVerified, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  readVerified: vi.fn(),
  rpc: vi.fn(),
}));

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
  getUser.mockResolvedValue({ data: { user: { id: authority.ownerUuid } } });
  readVerified.mockResolvedValue({ ok: true, sessionAuthority: authority });
});

describe("youtube saved recipe route boundary", () => {
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
