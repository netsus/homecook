import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});
const readUserGamification = vi.fn();
const markUserGamificationNotificationsSeen = vi.fn();
const dismissUserGamificationTutorialQuest = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-gamification", () => ({
  dismissUserGamificationTutorialQuest,
  markUserGamificationNotificationsSeen,
  readUserGamification,
}));

async function importReadRoute() {
  return import("@/app/api/v1/users/me/gamification/route");
}

async function importSeenRoute() {
  return import("@/app/api/v1/users/me/gamification/notifications/seen/route");
}

async function importDismissRoute() {
  return import("@/app/api/v1/users/me/gamification/tutorial-quests/[quest_key]/dismiss/route");
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/v1/users/me/gamification/notifications/seen", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("user gamification routes", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    readUserGamification.mockReset();
    markUserGamificationNotificationsSeen.mockReset();
    dismissUserGamificationTutorialQuest.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("returns 401 for unauthenticated gamification reads", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { GET } = await importReadRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
    expect(readUserGamification).not.toHaveBeenCalled();
  });

  it("returns the documented gamification envelope for an authenticated user", async () => {
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    readUserGamification.mockResolvedValue({
      data: {
        level: {
          current_level: 1,
          total_xp: 0,
          xp_to_next_level: 100,
          progress_percent: 0,
        },
        featured_badges: [],
        badges: { earned: [], locked: [] },
        quests: { active: [], completed_recent: [] },
        tutorial: { active_steps: [] },
        notifications: { unseen: [] },
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });

    const { GET } = await importReadRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        level: {
          current_level: 1,
          total_xp: 0,
          xp_to_next_level: 100,
          progress_percent: 0,
        },
        featured_badges: [],
        badges: { earned: [], locked: [] },
        quests: { active: [], completed_recent: [] },
        tutorial: { active_steps: [] },
        notifications: { unseen: [] },
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });
    expect(readUserGamification).toHaveBeenCalledWith(routeClient, "user-1");
  });

  it("rejects malformed notification seen bodies", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });

    const { POST } = await importSeenRoute();
    const response = await POST(createRequest({ notification_ids: ["not-a-uuid"] }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "notification_ids", reason: "invalid_uuid" }],
      },
    });
    expect(markUserGamificationNotificationsSeen).not.toHaveBeenCalled();
  });

  it("marks only owned notifications as seen without exposing other owners", async () => {
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    markUserGamificationNotificationsSeen.mockResolvedValue({
      data: {
        seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"],
      },
      error: null,
    });

    const { POST } = await importSeenRoute();
    const response = await POST(createRequest({
      notification_ids: [
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440002",
      ],
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"],
      },
      error: null,
    });
    expect(markUserGamificationNotificationsSeen).toHaveBeenCalledWith(routeClient, "user-1", [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
    ]);
  });

  it("returns 404 for an unknown tutorial quest key", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    dismissUserGamificationTutorialQuest.mockResolvedValue({
      data: null,
      error: { code: "UNKNOWN_TUTORIAL_QUEST", message: "unknown tutorial quest" },
    });

    const { POST } = await importDismissRoute();
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ quest_key: "not_real" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("dismisses a tutorial quest without changing progress XP", async () => {
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    dismissUserGamificationTutorialQuest.mockResolvedValue({
      data: {
        quest_key: "first_shopping_done",
        status: "dismissed",
      },
      error: null,
    });

    const { POST } = await importDismissRoute();
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ quest_key: "first_shopping_done" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        quest_key: "first_shopping_done",
        status: "dismissed",
      },
      error: null,
    });
    expect(dismissUserGamificationTutorialQuest).toHaveBeenCalledWith(
      routeClient,
      "user-1",
      "first_shopping_done",
    );
  });
});
