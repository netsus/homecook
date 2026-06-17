import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_: unknown, fallbackMessage: string) => fallbackMessage);
const recordUserGrowthActivityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createLookupTable<T>(result: QueryResult<T[]>) {
  const query = {
    in: vi.fn(() => query),
    then: createAwaitableQuery(result).then,
  };

  return {
    select: vi.fn(() => query),
  };
}

function createSessionTable<T>(result: QueryResult<T | null>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => createAwaitableQuery(result)),
  };

  return {
    select: vi.fn(() => query),
  };
}

const userId = "550e8400-e29b-41d4-a716-446655440001";
const extractionId = "550e8400-e29b-41d4-a716-446655440002";
const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const ingredientId = "550e8400-e29b-41d4-a716-446655440201";
const saltIngredientId = "550e8400-e29b-41d4-a716-446655440202";
const cookingMethodId = "550e8400-e29b-41d4-a716-446655440301";
const draftIngredientId = "550e8400-e29b-41d4-a716-446655440401";
const saltDraftIngredientId = "550e8400-e29b-41d4-a716-446655440402";
const youtubeUrl = "https://www.youtube.com/watch?v=recipe12345";

function buildRegisterBody() {
  return {
    extraction_id: extractionId,
    title: "백종원 김치찌개",
    base_servings: 2,
    youtube_url: youtubeUrl,
    ingredients: [
      {
        draft_ingredient_id: draftIngredientId,
        ingredient_id: ingredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        scalable: true,
        sort_order: 1,
        quantity_confirmation_status: "not_required",
      },
      {
        draft_ingredient_id: saltDraftIngredientId,
        ingredient_id: saltIngredientId,
        standard_name: "소금",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        display_text: "소금 약간",
        scalable: false,
        sort_order: 2,
        quantity_confirmation_status: "not_required",
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "김치를 끓여요.",
        cooking_method_id: cookingMethodId,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: null,
        duration_text: null,
      },
    ],
  };
}

function buildSession() {
  return {
    id: extractionId,
    user_id: userId,
    youtube_url: youtubeUrl,
    youtube_video_id: "recipe12345",
    video_title: "백종원 김치찌개",
    channel_title: "백종원의 요리비책",
    thumbnail_url: "https://img.youtube.com/vi/recipe12345/hqdefault.jpg",
    provider_version: "youtube-videos-list-description-v1",
    source_providers: ["youtube_videos_list"],
    classification_status: "recipe",
    classification_reasons: [],
    extraction_methods: ["description"],
    raw_source_text: "김치찌개 레시피",
    extraction_meta_json: {},
    draft_json: {
      tags: ["유튜브레시피", "한식", "국물요리"],
      ingredients: [
        {
          draft_ingredient_id: draftIngredientId,
          ingredient_id: ingredientId,
          standard_name: "김치",
          amount: 200,
          unit: "g",
          ingredient_type: "QUANT",
          display_text: "김치 200g",
          scalable: true,
          quantity_source: "text_explicit",
          quantity_review_required: false,
          resolution_status: "resolved",
        },
        {
          draft_ingredient_id: saltDraftIngredientId,
          ingredient_id: saltIngredientId,
          standard_name: "소금",
          amount: null,
          unit: null,
          ingredient_type: "TO_TASTE",
          display_text: "소금 약간",
          scalable: false,
          quantity_source: "text_explicit",
          quantity_review_required: false,
          resolution_status: "resolved",
        },
      ],
    },
    status: "draft",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    session_kind: "single",
    parent_extraction_session_id: null,
    parent_candidate_id: null,
  };
}

function createDbClient() {
  const sessionsTable = createSessionTable({
    data: buildSession(),
    error: null,
  });
  const ingredientsTable = createLookupTable({
    data: [{ id: ingredientId }, { id: saltIngredientId }],
    error: null,
  });
  const cookingMethodsTable = createLookupTable({
    data: [{ id: cookingMethodId }],
    error: null,
  });
  const rpc = vi.fn(async () => ({
    data: { recipe_id: recipeId, title: "백종원 김치찌개" },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "youtube_extraction_sessions") return sessionsTable;
    if (table === "ingredients") return ingredientsTable;
    if (table === "cooking_methods") return cookingMethodsTable;
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, rpc };
}

async function importRegisterRoute() {
  return import("@/app/api/v1/recipes/youtube/register/route");
}

describe("36b YouTube recipe register tag write path", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    recordUserGrowthActivityEvent.mockReset();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
  });

  it("uses session tag suggestions when reviewed tags are absent", async () => {
    const dbClient = createDbClient();
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRegisterBody()),
    }));

    expect(response.status).toBe(201);
    expect(dbClient.rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", expect.objectContaining({
      p_tags: null,
      p_tag_source: "system_suggested",
    }));
  });

  it("accepts reviewed tags and sends normalized labels to the register RPC", async () => {
    const dbClient = createDbClient();
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildRegisterBody(),
        tags: ["#한식", "내메모"],
      }),
    }));

    expect(response.status).toBe(201);
    expect(dbClient.rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", expect.objectContaining({
      p_tags: ["한식", "내메모"],
      p_tag_source: "user_reviewed",
    }));
  });

  it("rejects invalid reviewed tags before database writes", async () => {
    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildRegisterBody(),
        tags: ["한식", "한식"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "tags", reason: "duplicate" }],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
