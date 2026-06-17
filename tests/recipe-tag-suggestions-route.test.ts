import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

async function importTagSuggestionsRoute() {
  return import("@/app/api/v1/recipes/tag-suggestions/route");
}

describe("36b recipe tag suggestions route", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
  });

  it("returns deterministic semantic/source suggestions without database writes", async () => {
    const { POST } = await importTagSuggestionsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/tag-suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_type: "youtube",
        title: "초보도 쉬운 매콤 김치찌개",
        ingredients: [{ standard_name: "김치" }, { standard_name: "돼지고기" }],
        steps: [{ instruction: "물을 붓고 보글보글 끓여요." }],
        cooking_method_labels: ["끓이기"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        suggested_tags: [
          expect.objectContaining({ label: "유튜브레시피", normalized_key: "유튜브레시피", kind: "source" }),
          expect.objectContaining({ label: "한식", normalized_key: "한식", kind: "semantic" }),
          expect.objectContaining({ label: "국물요리", normalized_key: "국물요리", kind: "semantic" }),
          expect.objectContaining({ label: "매콤", normalized_key: "매콤", kind: "semantic" }),
          expect.objectContaining({ label: "초보가능", normalized_key: "초보가능", kind: "semantic" }),
          expect.objectContaining({ label: "고단백", normalized_key: "고단백", kind: "semantic" }),
        ],
        tags: ["유튜브레시피", "한식", "국물요리", "매콤", "초보가능", "고단백"],
      },
      error: null,
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("requires a logged-in user", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { POST } = await importTagSuggestionsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/tag-suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "김치찌개" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });
});
