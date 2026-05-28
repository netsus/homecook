import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

const userId = "550e8400-e29b-41d4-a716-446655440030";

function createMaybeSingleQuery(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return query;
}

async function importCheckRoute() {
  return import("@/app/api/v1/recipes/youtube/recipio/check/route");
}

function enableYoutubeImport() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
}

describe("Recipio-style YouTube duplicate lookup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("keeps duplicate lookup behind the YouTube feature flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT;
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT;

    const { GET } = await importCheckRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/recipes/youtube/recipio/check?youtube_url=https://youtu.be/X9CqUvteeMo"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FEATURE_DISABLED" },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("returns the existing recipe for a matching YouTube video id", async () => {
    enableYoutubeImport();

    const sourceQuery = createMaybeSingleQuery({
      data: {
        recipe_id: "550e8400-e29b-41d4-a716-446655441001",
        youtube_url: "https://www.youtube.com/watch?v=X9CqUvteeMo",
        youtube_video_id: "X9CqUvteeMo",
        recipes: {
          id: "550e8400-e29b-41d4-a716-446655441001",
          title: "백종원 불어묵 꼬마김밥",
          thumbnail_url: "https://img.youtube.com/vi/X9CqUvteeMo/hqdefault.jpg",
        },
      },
      error: null,
    });
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_sources") return sourceQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createRouteHandlerClient.mockResolvedValue(routeClient);

    const { GET } = await importCheckRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/recipes/youtube/recipio/check?youtube_url=https://youtu.be/X9CqUvteeMo"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sourceQuery.eq).toHaveBeenCalledWith("youtube_video_id", "X9CqUvteeMo");
    expect(body).toEqual({
      success: true,
      data: {
        is_duplicate: true,
        recipe: {
          recipe_id: "550e8400-e29b-41d4-a716-446655441001",
          title: "백종원 불어묵 꼬마김밥",
          thumbnail_url: "https://img.youtube.com/vi/X9CqUvteeMo/hqdefault.jpg",
          youtube_url: "https://www.youtube.com/watch?v=X9CqUvteeMo",
          youtube_video_id: "X9CqUvteeMo",
        },
      },
      error: null,
    });
  });

  it("returns a non-duplicate result when no source row exists", async () => {
    enableYoutubeImport();

    const sourceQuery = createMaybeSingleQuery({ data: null, error: null });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_sources") return sourceQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importCheckRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/recipes/youtube/recipio/check?youtube_url=https://youtu.be/X9CqUvteeMo"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        is_duplicate: false,
        recipe: null,
      },
      error: null,
    });
  });
});
