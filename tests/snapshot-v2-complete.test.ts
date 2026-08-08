import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createCookedBatchInternalClient = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const projectUserGamificationAfterProgressEvent = vi.fn();
const projectUserGamificationAfterActivityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createCookedBatchInternalClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/user-gamification", () => ({
  projectUserGamificationAfterProgressEvent,
  projectUserGamificationAfterActivityEvent,
}));

const ownerId = "550e8400-e29b-41d4-a716-446655440811";
const sessionId = "550e8400-e29b-41d4-a716-446655440812";
const key = "550e8400-e29b-41d4-a716-446655440813";

function request(body: unknown, idempotencyKey: string | null = key) {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return new Request(`http://localhost/api/v1/cooking/session-attempts/${sessionId}/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /cooking/session-attempts/{id}/complete", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createCookedBatchInternalClient.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    projectUserGamificationAfterProgressEvent.mockReset();
    projectUserGamificationAfterActivityEvent.mockReset();
    projectUserGamificationAfterProgressEvent.mockResolvedValue({ error: null });
    projectUserGamificationAfterActivityEvent.mockResolvedValue({ error: null });
  });

  it("reuses canonical event IDs so live gamification projection stays idempotent on replay", async () => {
    const progressEventId = "550e8400-e29b-41d4-a716-446655440818";
    const occurredAt = "2026-08-08T10:00:00.000Z";
    const progressQuery = {
      eq: vi.fn(() => progressQuery),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: progressEventId,
          xp_delta: 60,
          occurred_at: occurredAt,
          source_meta_json: { previous_level: 1 },
        },
        error: null,
      })),
    };
    const summaryQuery = {
      eq: vi.fn(() => summaryQuery),
      maybeSingle: vi.fn(async () => ({
        data: {
          total_xp: 60,
          event_counts: {
            cooking_completed: 1,
            shopping_completed: 0,
            recipe_saved_distinct_ever: 0,
            custom_book_created: 0,
            planner_registered_first: 0,
            planner_registered_repeat: 0,
            leftover_eaten: 0,
          },
          last_updated_at: occurredAt,
        },
        error: null,
      })),
    };
    const routeClient = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: ownerId } } })) },
      from: vi.fn((table: string) => ({
        select: vi.fn(() => table === "user_progress_events" ? progressQuery : summaryQuery),
      })),
    };
    const rpc = vi.fn(async () => ({
      data: {
        success: true,
        data: {
          session_id: sessionId,
          contract_version: "snapshot_v2",
          mode: "standalone",
          status: "completed",
          cooked_batch: {
            id: sessionId,
            recipe_id: "550e8400-e29b-41d4-a716-446655440815",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            status: "leftover",
            cooked_at: occurredAt,
            cooking_servings: 2,
            finished_weight_g: null,
            remaining_weight_g: null,
            weight_status: "missing",
            batch_status: "available",
            depleted_reason: null,
            revision: 1,
            nutrition_calculation_status: "partial",
            current_unweighed_closure_event_id: null,
          },
          meals_updated: 0,
          pantry_removed: 0,
          cook_count: 1,
        },
        error: null,
      },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue(routeClient);
    createCookedBatchInternalClient.mockReturnValue({ rpc });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ownerUuid: ownerId,
        authIdentityCreatedAt: "2026-08-08T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 1,
        sessionIssuedAt: "2026-08-08T00:00:00.000Z",
      },
    });

    const { POST } = await import("@/app/api/v1/cooking/session-attempts/[id]/complete/route");
    const response = await POST(request({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }), { params: Promise.resolve({ id: sessionId }) });
    const replayResponse = await POST(request({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }), { params: Promise.resolve({ id: sessionId }) });

    expect(response.status).toBe(200);
    expect(replayResponse.status).toBe(200);
    expect(projectUserGamificationAfterProgressEvent).toHaveBeenCalledTimes(2);
    expect(projectUserGamificationAfterProgressEvent).toHaveBeenNthCalledWith(
      1,
      routeClient,
      expect.objectContaining({
        userId: ownerId,
        progressEventId,
        xpDelta: 60,
        previousLevel: 1,
        awardInput: expect.objectContaining({
          eventType: "cooking_completed",
          sourceId: sessionId,
        }),
      }),
    );
    expect(projectUserGamificationAfterProgressEvent).toHaveBeenNthCalledWith(
      2,
      routeClient,
      expect.objectContaining({ progressEventId }),
    );
    expect(projectUserGamificationAfterActivityEvent).not.toHaveBeenCalled();
  });

  it("requires authentication before any privileged RPC", async () => {
    const rpc = vi.fn();
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    createCookedBatchInternalClient.mockReturnValue({ rpc });

    const { POST } = await import("@/app/api/v1/cooking/session-attempts/[id]/complete/route");
    const response = await POST(request({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }), { params: Promise.resolve({ id: sessionId }) });

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("delegates the whole completion to one RPC and returns the exact eight-key data", async () => {
    const cookedBatch = {
      id: "550e8400-e29b-41d4-a716-446655440814",
      recipe_id: "550e8400-e29b-41d4-a716-446655440815",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      status: "leftover",
      cooked_at: "2026-08-08T10:00:00.000Z",
      cooking_servings: 4,
      finished_weight_g: null,
      remaining_weight_g: null,
      weight_status: "missing",
      batch_status: "available",
      depleted_reason: null,
      revision: 1,
      nutrition_calculation_status: "partial",
      current_unweighed_closure_event_id: null,
    };
    const rpc = vi.fn(async () => ({
      data: {
        success: true,
        data: {
          session_id: sessionId,
          contract_version: "snapshot_v2",
          mode: "planner",
          status: "completed",
          cooked_batch: cookedBatch,
          meals_updated: 2,
          pantry_removed: 0,
          cook_count: 9,
          owner_uuid: ownerId,
        },
      },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: ownerId } } })) },
    });
    createCookedBatchInternalClient.mockReturnValue({ rpc });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ownerUuid: ownerId,
        authIdentityCreatedAt: "2026-08-08T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 1,
        sessionIssuedAt: "2026-08-08T00:00:00.000Z",
      },
    });

    const { POST } = await import("@/app/api/v1/cooking/session-attempts/[id]/complete/route");
    const response = await POST(request({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    }), { params: Promise.resolve({ id: sessionId }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.data)).toEqual([
      "session_id", "contract_version", "mode", "status", "cooked_batch",
      "meals_updated", "pantry_removed", "cook_count",
    ]);
    expect(body.data.cooked_batch).toEqual(cookedBatch);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "complete_snapshot_v2_cooking_session",
      expect.objectContaining({
        p_session_id: sessionId,
        p_idempotency_key: key,
        p_consumed_pantry_item_ids: [],
        p_weight_action: "weigh_later",
        p_finished_weight_g: null,
      }),
    );
  });
});
