import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createSnapshotV2SessionInternalClient = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createSnapshotV2SessionInternalClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

const sessionId = "550e8400-e29b-41d4-a716-446655440301";
const ingredientId = "550e8400-e29b-41d4-a716-446655440401";

async function importCompleteRoute() {
  return import("@/app/api/v1/cooking/sessions/[session_id]/complete/route");
}

function context(id = sessionId) {
  return { params: Promise.resolve({ session_id: id }) };
}

function jsonRequest(body: unknown) {
  return new Request(
    `http://localhost:3000/api/v1/cooking/sessions/${sessionId}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("15a cook planner complete backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createSnapshotV2SessionInternalClient.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(
      jsonRequest({ consumed_ingredient_ids: [] }),
      context(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("validates consumed ingredient ids before authentication or writes", async () => {
    const { POST } = await importCompleteRoute();
    const response = await POST(
      jsonRequest({ consumed_ingredient_ids: [ingredientId, "not-a-uuid"] }),
      context(),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "consumed_ingredient_ids", reason: "invalid_uuid" }],
      },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("keeps the legacy overload migration for pre-cutover compatibility", async () => {
    const migration = await readFile(
      "supabase/migrations/20260429080000_15a_cook_planner_complete.sql",
      "utf8",
    );

    expect(migration).toContain("public.complete_cooking_session");
    expect(migration).toContain("p_session_id uuid");
    expect(migration).toContain("p_user_id uuid");
    expect(migration).toContain("p_consumed_ingredient_ids uuid[]");
  });
});
