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
const readUserProgress = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-progress", () => ({
  readUserProgress,
}));

async function importRoute() {
  return import("@/app/api/v1/users/me/progress/route");
}

describe("GET /api/v1/users/me/progress", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    readUserProgress.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
    expect(readUserProgress).not.toHaveBeenCalled();
  });

  it("returns the existing 500 envelope when the Supabase client cannot initialize", async () => {
    createRouteHandlerClient.mockRejectedValue(new Error("Supabase environment variables are missing"));

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "사용자 진도를 불러오지 못했어요.",
        fields: [],
      },
    });
    expect(readUserProgress).not.toHaveBeenCalled();
  });

  it("returns the existing 500 envelope when the authenticated user lookup fails", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("auth provider unavailable")),
      },
    });

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "사용자 진도를 불러오지 못했어요.",
        fields: [],
      },
    });
    expect(readUserProgress).not.toHaveBeenCalled();
  });

  it("returns level 1 / 0 XP for a new user without prior progress", async () => {
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    readUserProgress.mockResolvedValue({
      data: {
        level: {
          current_level: 1,
          total_xp: 0,
          current_level_start_xp: 0,
          next_level_start_xp: 100,
          xp_into_current_level: 0,
          xp_to_next_level: 100,
          progress_ratio: 0,
          progress_percent: 0,
        },
        event_counts: {
          cooking_completed: 0,
          shopping_completed: 0,
          recipe_saved_distinct_ever: 0,
          custom_book_created: 0,
        },
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        level: {
          current_level: 1,
          total_xp: 0,
          current_level_start_xp: 0,
          next_level_start_xp: 100,
          xp_into_current_level: 0,
          xp_to_next_level: 100,
          progress_ratio: 0,
          progress_percent: 0,
        },
        event_counts: {
          cooking_completed: 0,
          shopping_completed: 0,
          recipe_saved_distinct_ever: 0,
          custom_book_created: 0,
        },
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });
    expect(readUserProgress).toHaveBeenCalledWith(routeClient, "user-1");
  });

  it("returns a 500 envelope when the progress module fails", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    readUserProgress.mockResolvedValue({
      data: null,
      error: { message: "projection failure" },
    });

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("returns the documented envelope shape for a user with XP", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    readUserProgress.mockResolvedValue({
      data: {
        level: {
          current_level: 3,
          total_xp: 420,
          current_level_start_xp: 300,
          next_level_start_xp: 600,
          xp_into_current_level: 120,
          xp_to_next_level: 180,
          progress_ratio: 0.4,
          progress_percent: 40,
        },
        event_counts: {
          cooking_completed: 8,
          shopping_completed: 5,
          recipe_saved_distinct_ever: 23,
          custom_book_created: 2,
        },
        last_updated_at: "2026-06-10T12:34:56.000Z",
      },
      error: null,
    });

    const { GET } = await importRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        level: {
          current_level: 3,
          total_xp: 420,
          current_level_start_xp: 300,
          next_level_start_xp: 600,
          xp_into_current_level: 120,
          xp_to_next_level: 180,
          progress_ratio: 0.4,
          progress_percent: 40,
        },
        event_counts: {
          cooking_completed: 8,
          shopping_completed: 5,
          recipe_saved_distinct_ever: 23,
          custom_book_created: 2,
        },
        last_updated_at: "2026-06-10T12:34:56.000Z",
      },
      error: null,
    });
  });
});
