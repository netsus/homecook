import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuthedGamificationClient = vi.fn();
const readUserGamificationArchive = vi.fn();
const decodeArchiveCursor = vi.fn();

vi.mock("@/app/api/v1/users/me/gamification/_helpers", () => ({
  createAuthedGamificationClient,
}));

vi.mock("@/lib/server/user-gamification", () => ({
  decodeArchiveCursor,
  readUserGamificationArchive,
}));

async function importRoute() {
  return import("@/app/api/v1/users/me/gamification/archive/route");
}

describe("GET /api/v1/users/me/gamification/archive", () => {
  beforeEach(() => {
    vi.resetModules();
    createAuthedGamificationClient.mockReset();
    readUserGamificationArchive.mockReset();
    decodeArchiveCursor.mockReset();
    decodeArchiveCursor.mockReturnValue(null);
  });

  it("returns 401 before reading archive when unauthenticated", async () => {
    const response401 = new Response(JSON.stringify({ success: false }), { status: 401 });
    createAuthedGamificationClient.mockResolvedValue({
      response: response401,
      dbClient: null,
      user: null,
    });

    const { GET } = await importRoute();
    const response = await GET(new Request("http://localhost/api/v1/users/me/gamification/archive"));

    expect(response.status).toBe(401);
    expect(readUserGamificationArchive).not.toHaveBeenCalled();
  });

  it("validates limit and cursor query params", async () => {
    createAuthedGamificationClient.mockResolvedValue({
      response: null,
      dbClient: {},
      user: { id: "user-1" },
    });

    const { GET } = await importRoute();
    const response = await GET(
      new Request("http://localhost/api/v1/users/me/gamification/archive?limit=99"),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fields).toEqual([{ field: "limit", reason: "range" }]);
  });

  it("rejects malformed archive cursors before reading user data", async () => {
    const invalidCursor = Buffer.from(
      "2026-06-10T10:00:00.000Z|not-a-uuid",
      "utf8",
    ).toString("base64url");

    const { GET } = await importRoute();
    const response = await GET(
      new Request(`http://localhost/api/v1/users/me/gamification/archive?cursor=${invalidCursor}`),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fields).toEqual([{ field: "cursor", reason: "invalid_cursor" }]);
    expect(createAuthedGamificationClient).not.toHaveBeenCalled();
    expect(readUserGamificationArchive).not.toHaveBeenCalled();
  });

  it("returns archive items in the API envelope", async () => {
    createAuthedGamificationClient.mockResolvedValue({
      response: null,
      dbClient: { from: vi.fn() },
      user: { id: "user-1" },
    });
    readUserGamificationArchive.mockResolvedValue({
      data: { items: [], next_cursor: null, has_next: false },
      error: null,
    });

    const { GET } = await importRoute();
    const response = await GET(
      new Request("http://localhost/api/v1/users/me/gamification/archive?limit=20"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { items: [], next_cursor: null, has_next: false },
      error: null,
    });
    expect(readUserGamificationArchive).toHaveBeenCalledWith(
      { from: expect.any(Function) },
      "user-1",
      { limit: 20, cursor: null },
    );
  });
});
