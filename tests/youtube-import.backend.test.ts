import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import fixtureData from "@/qa/fixtures/slices-01-05.json";

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

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

interface QueryResult<T> {
  data: T;
  error: { code?: string; message: string } | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createArrayQuery<T>(result: QueryResult<T[]>) {
  const query = {
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: createAwaitableQuery(result).then,
  };

  return query;
}

function createLookupTable<T>(result: QueryResult<T[]>) {
  const query = createArrayQuery(result);

  return {
    __query: query,
    select: vi.fn(() => query),
  };
}

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      }),
    ),
  };

  return query;
}

function createCookingMethodsTable({
  existingResult,
  insertResult,
}: {
  existingResult: QueryResult<{
    id: string;
    code: string;
    label: string;
    color_key: string;
    is_system: boolean;
  } | null>;
  insertResult: QueryResult<{
    id: string;
    code: string;
    label: string;
    color_key: string;
    is_system: boolean;
  } | null>;
}) {
  const selectQuery = createMaybeSingleQuery([existingResult]);
  const insertQuery = createMaybeSingleQuery([insertResult]);

  return {
    __selectQuery: selectQuery,
    __insertQuery: insertQuery,
    select: vi.fn(() => selectQuery),
    insert: vi.fn((values: unknown) => {
      void values;
      return insertQuery;
    }),
  };
}

function createYoutubeSessionsTable({
  selectResult,
  insertResult = { data: null, error: null },
}: {
  selectResult?: QueryResult<YoutubeSessionRow | null>;
  insertResult?: QueryResult<null>;
}) {
  const selectQuery = createMaybeSingleQuery<YoutubeSessionRow>([
    selectResult ?? { data: null, error: { message: "session lookup not configured" } },
  ]);

  return {
    __selectQuery: selectQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
  };
}

interface YoutubeSessionRow {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_video_id: string;
  provider_version: string | null;
  extraction_methods: string[];
  raw_source_text: string | null;
  extraction_meta_json: Record<string, unknown>;
  draft_json: Record<string, unknown>;
  status: "draft" | "consumed" | "expired";
  expires_at: string;
}

const userId = "550e8400-e29b-41d4-a716-446655440030";
const recipeId = "550e8400-e29b-41d4-a716-446655441001";
const kimchiIngredientId = "550e8400-e29b-41d4-a716-446655440013";
const saltIngredientId = "550e8400-e29b-41d4-a716-446655440015";
const prepMethodId = "550e8400-e29b-41d4-a716-446655440218";
const newMethodId = "550e8400-e29b-41d4-a716-446655441101";
const extractionId = "550e8400-e29b-41d4-a716-446655441201";
const recipeUrl = "https://www.youtube.com/watch?v=recipe12345";
const nonRecipeUrl = "https://youtu.be/nonrecipe123";
const uncertainUrl = "https://www.youtube.com/watch?v=uncertain123";
const incompleteUrl = "https://www.youtube.com/watch?v=incomplete123";
const needsReviewUrl = "https://www.youtube.com/watch?v=needsreview123";
const missingVideoUrl = "https://www.youtube.com/watch?v=missing123";
const ORIGINAL_YOUTUBE_IMPORT_FLAG = process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT;
const ORIGINAL_PUBLIC_YOUTUBE_IMPORT_FLAG = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT;

function restoreYoutubeImportEnv() {
  vi.unstubAllEnvs();

  if (ORIGINAL_YOUTUBE_IMPORT_FLAG === undefined) {
    delete process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT;
  } else {
    process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT = ORIGINAL_YOUTUBE_IMPORT_FLAG;
  }

  if (ORIGINAL_PUBLIC_YOUTUBE_IMPORT_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT;
  } else {
    process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT = ORIGINAL_PUBLIC_YOUTUBE_IMPORT_FLAG;
  }
}

function createRegisterDbClient({
  sessionResult = { data: buildYoutubeSession(), error: null },
  ingredientRows = [{ id: kimchiIngredientId }, { id: saltIngredientId }],
  cookingMethodRows = [{ id: prepMethodId }],
  rpcResult = { data: { recipe_id: recipeId, title: "백종원 김치찌개" }, error: null },
}: {
  sessionResult?: QueryResult<YoutubeSessionRow | null>;
  ingredientRows?: Array<{ id: string }>;
  cookingMethodRows?: Array<{ id: string }>;
  rpcResult?: QueryResult<{ recipe_id: string; title: string } | { error_code: string; message?: string } | null>;
} = {}) {
  const ingredientsTable = createLookupTable({
    data: ingredientRows,
    error: null,
  });
  const cookingMethodsTable = createLookupTable({
    data: cookingMethodRows,
    error: null,
  });
  const sessionsTable = createYoutubeSessionsTable({
    selectResult: sessionResult,
  });
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    if (table === "youtube_extraction_sessions") return sessionsTable;
    if (table === "ingredients") return ingredientsTable;
    if (table === "cooking_methods") return cookingMethodsTable;
    throw new Error(`unexpected table: ${table}`);
  });
  const dbClient = { from, rpc };

  return {
    cookingMethodsTable,
    dbClient,
    from,
    ingredientsTable,
    rpc,
    sessionsTable,
  };
}

function buildRegisterBody() {
  return {
    extraction_id: extractionId,
    title: "백종원 김치찌개",
    base_servings: 2,
    youtube_url: recipeUrl,
    ingredients: [
      {
        ingredient_id: kimchiIngredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        scalable: true,
        sort_order: 1,
      },
      {
        ingredient_id: saltIngredientId,
        standard_name: "소금",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        display_text: "소금 약간",
        scalable: false,
        sort_order: 2,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "김치를 한입 크기로 썬다.",
        cooking_method_id: prepMethodId,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: null,
        duration_text: null,
      },
    ],
  };
}

function buildYoutubeSession(overrides: Partial<YoutubeSessionRow> = {}): YoutubeSessionRow {
  return {
    id: extractionId,
    user_id: userId,
    youtube_url: recipeUrl,
    youtube_video_id: "recipe12345",
    provider_version: "youtube-videos-list-description-v1",
    extraction_methods: ["description"],
    raw_source_text: "김치찌개 레시피\n재료\n김치 200g",
    extraction_meta_json: {
      provider_version: "youtube-videos-list-description-v1",
      classification_status: "recipe",
    },
    draft_json: {},
    status: "draft",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function mockAuth(user: { id: string } | null = { id: userId }) {
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: vi.fn(),
  };

  createRouteHandlerClient.mockResolvedValue(routeClient);

  return routeClient;
}

async function importValidateRoute() {
  return import("@/app/api/v1/recipes/youtube/validate/route");
}

async function importExtractRoute() {
  return import("@/app/api/v1/recipes/youtube/extract/route");
}

async function importRegisterRoute() {
  return import("@/app/api/v1/recipes/youtube/register/route");
}

describe("20 youtube real import backend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    restoreYoutubeImportEnv();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("keeps YouTube import API closed in production unless explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT;
    delete process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT;
    mockAuth();

    const routes = [
      {
        importRoute: importValidateRoute,
        path: "validate",
        body: { youtube_url: recipeUrl },
      },
      {
        importRoute: importExtractRoute,
        path: "extract",
        body: { youtube_url: recipeUrl },
      },
      {
        importRoute: importRegisterRoute,
        path: "register",
        body: buildRegisterBody(),
      },
    ];

    for (const route of routes) {
      const { POST } = await route.importRoute();
      const response = await POST(new Request(`http://localhost:3000/api/v1/recipes/youtube/${route.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(route.body),
      }));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body).toEqual({
        success: false,
        data: null,
        error: {
          code: "FEATURE_DISABLED",
          message: "유튜브 가져오기는 베타에서 준비 중이에요.",
          fields: [],
        },
      });
    }
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("fixture and schema baselines include YouTube import prerequisites", () => {
    const methodCodes = fixtureData.cookingMethods.map((method) => method.code);
    const schema = readFileSync("supabase/migrations/20260301000000_core_schema_bootstrap.sql", "utf8");
    const realImportSchema = readFileSync("supabase/migrations/20260521103000_20_youtube_real_import.sql", "utf8");

    expect(methodCodes).toEqual(expect.arrayContaining([
      "stir_fry",
      "boil",
      "deep_fry",
      "steam",
      "grill",
      "blanch",
      "mix",
      "prep",
    ]));
    expect(fixtureData.ingredients.length).toBeGreaterThanOrEqual(10);
    expect(schema).toContain("create table if not exists public.recipe_sources");
    expect(schema).toContain("youtube_video_id varchar(20)");
    expect(schema).toContain("extraction_methods text[]");
    expect(realImportSchema).toContain("create table if not exists public.youtube_extraction_sessions");
    expect(realImportSchema).toContain("alter table public.youtube_extraction_sessions enable row level security");
    expect(realImportSchema).toContain("create policy youtube_extraction_sessions_select_own");
    expect(realImportSchema).not.toContain("youtube_extraction_sessions_insert");
    expect(realImportSchema).toContain("youtube_extraction_session_id");
    expect(realImportSchema).toContain("register_youtube_recipe_from_session");
    expect(realImportSchema).toContain("v_session.youtube_url <> p_youtube_url");
  });

  it("POST /api/v1/recipes/youtube/validate returns 401 before validating an invalid body", async () => {
    mockAuth(null);

    const { POST } = await importValidateRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", fields: [] },
    });
  });

  it("POST /api/v1/recipes/youtube/validate rejects invalid URLs with field details", async () => {
    mockAuth();

    const { POST } = await importValidateRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: "https://example.com/not-youtube" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INVALID_URL",
        message: "유효한 유튜브 URL을 입력해주세요.",
        fields: [{ field: "youtube_url", reason: "invalid_url" }],
      },
    });
  });

  it("POST /api/v1/recipes/youtube/validate distinguishes recipe and non-recipe videos", async () => {
    mockAuth();

    const { POST } = await importValidateRoute();
    const recipeResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const nonRecipeResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: nonRecipeUrl }),
    }));
    const uncertainResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: uncertainUrl }),
    }));

    await expect(recipeResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "recipe",
        classification_reasons: expect.arrayContaining([expect.any(String)]),
        video_info: {
          video_id: "recipe12345",
          title: "백종원 김치찌개",
          channel: "백종원의 요리비책",
        },
      },
      error: null,
    });
    await expect(uncertainResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "uncertain",
        classification_reasons: expect.arrayContaining([expect.any(String)]),
      },
      error: null,
    });
    await expect(nonRecipeResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: false,
        classification_status: "non_recipe",
        classification_reasons: expect.arrayContaining([expect.any(String)]),
        message: "이 영상은 요리 레시피가 아닌 것 같아요",
      },
      error: null,
    });
  });

  it("POST /api/v1/recipes/youtube/validate returns 404 when the provider cannot find a video", async () => {
    mockAuth();

    const { POST } = await importValidateRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: missingVideoUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "VIDEO_NOT_FOUND", fields: [] },
    });
  });

  it("POST /api/v1/recipes/youtube/validate maps provider failures and quota errors", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          errors: [{ reason: "backendError" }],
        },
      }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          errors: [{ reason: "quotaExceeded" }],
        },
      }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importValidateRoute();
    const providerResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const quotaResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));

    await expect(providerResponse.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "PROVIDER_ERROR", fields: [] },
    });
    await expect(quotaResponse.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "QUOTA_EXCEEDED", fields: [] },
    });
    expect(providerResponse.status).toBe(502);
    expect(quotaResponse.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("part=snippet%2CcontentDetails"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("key=test-key"));
  });

  it("POST /api/v1/recipes/youtube/validate accepts common pasted YouTube URL shapes", async () => {
    mockAuth();

    const { POST } = await importValidateRoute();
    const cases = [
      ["watch URL", "https://www.youtube.com/watch?v=recipe12345", "recipe12345"],
      ["short URL", "https://youtu.be/recipe12345", "recipe12345"],
      ["shorts URL", "https://www.youtube.com/shorts/recipe12345?feature=share", "recipe12345"],
      ["playlist watch URL", "https://www.youtube.com/watch?v=recipe12345&list=PL123456789", "recipe12345"],
      ["mobile watch URL", "https://m.youtube.com/watch?v=nonrecipe123&feature=share", "nonrecipe123"],
    ];

    for (const [, url, videoId] of cases) {
      const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ youtube_url: url }),
      }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        data: {
          is_valid_url: true,
          video_info: {
            video_id: videoId,
          },
        },
        error: null,
      });
    }
  });

  it("POST /api/v1/recipes/youtube/extract creates a missing cooking method once and returns extracted recipe data", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
      ],
      error: null,
    });
    const cookingMethodsTable = createCookingMethodsTable({
      existingResult: { data: null, error: null },
      insertResult: {
        data: {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        error: null,
      },
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
        if (table === "youtube_extraction_sessions") return sessionsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "백종원 김치찌개",
        base_servings: 2,
        extraction_methods: ["description"],
        draft_warnings: [],
        blocking_issues: [],
        ingredients: [
          {
            standard_name: "김치",
            amount: 200,
            unit: "g",
            ingredient_type: "QUANT",
            ingredient_id: kimchiIngredientId,
            confidence: 0.95,
            resolution_status: "resolved",
          },
          {
            standard_name: "소금",
            amount: null,
            unit: null,
            ingredient_type: "TO_TASTE",
            ingredient_id: saltIngredientId,
            confidence: 0.8,
            resolution_status: "resolved",
          },
        ],
        steps: [
          {
            step_number: 1,
            cooking_method: {
              id: newMethodId,
              code: "auto_salt",
              label: "절이기",
              color_key: "unassigned",
              is_new: true,
            },
          },
        ],
        new_cooking_methods: [
          {
            id: newMethodId,
            code: "auto_salt",
            label: "절이기",
            color_key: "unassigned",
            is_new: true,
          },
        ],
      },
      error: null,
    });
    expect(body.data.extraction_id).toEqual(expect.any(String));
    expect(ingredientsTable.select).toHaveBeenCalledWith("id, standard_name");
    expect(ingredientsTable.__query.in).toHaveBeenCalledWith("standard_name", ["김치", "소금"]);
    expect(cookingMethodsTable.__selectQuery.eq).toHaveBeenCalledWith("code", "auto_salt");
    expect(cookingMethodsTable.insert).toHaveBeenCalledWith({
      code: "auto_salt",
      label: "절이기",
      color_key: "unassigned",
      is_system: false,
      display_order: 999,
    });
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      youtube_url: recipeUrl,
      youtube_video_id: "recipe12345",
      classification_status: "recipe",
      extraction_methods: ["description"],
      status: "draft",
      draft_json: expect.objectContaining({
        extraction_id: body.data.extraction_id,
      }),
    }));
  });

  it("POST /api/v1/recipes/youtube/extract keeps uncertain videos extractable with a review warning", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
      ],
      error: null,
    });
    const cookingMethodsTable = createCookingMethodsTable({
      existingResult: {
        data: {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        error: null,
      },
      insertResult: { data: null, error: { message: "should not insert" } },
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
        if (table === "youtube_extraction_sessions") return sessionsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: uncertainUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        draft_warnings: ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해주세요."],
        blocking_issues: [],
      },
      error: null,
    });
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      classification_status: "uncertain",
      extraction_meta_json: expect.objectContaining({
        draft_warnings: ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해주세요."],
      }),
    }));
  });

  it("POST /api/v1/recipes/youtube/extract reports unresolved ingredients and blocking step fields", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [{ id: kimchiIngredientId, standard_name: "김치" }],
      error: null,
    });
    const cookingMethodsTable = createCookingMethodsTable({
      existingResult: {
        data: {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        error: null,
      },
      insertResult: { data: null, error: { message: "should not insert" } },
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
        if (table === "youtube_extraction_sessions") return sessionsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: incompleteUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        blocking_issues: ["ingredients[1].ingredient_id", "steps[0].instruction"],
        ingredients: [
          { standard_name: "김치", resolution_status: "resolved" },
          {
            standard_name: "소금",
            ingredient_id: "",
            confidence: null,
            resolution_status: "unresolved",
            candidates: [],
          },
        ],
        steps: [
          {
            instruction: "",
            is_incomplete: true,
            missing_fields: ["instruction"],
          },
        ],
      },
      error: null,
    });
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      draft_json: expect.objectContaining({
        blocking_issues: ["ingredients[1].ingredient_id", "steps[0].instruction"],
      }),
    }));
  });

  it("POST /api/v1/recipes/youtube/extract can return needs_review candidates before registration", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
      ],
      error: null,
    });
    const cookingMethodsTable = createCookingMethodsTable({
      existingResult: {
        data: {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        error: null,
      },
      insertResult: { data: null, error: { message: "should not insert" } },
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
        if (table === "youtube_extraction_sessions") return sessionsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: needsReviewUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        blocking_issues: ["ingredients[1].ingredient_id"],
        ingredients: [
          { standard_name: "김치", resolution_status: "resolved" },
          {
            standard_name: "소금",
            ingredient_id: "",
            confidence: 0.8,
            resolution_status: "needs_review",
            candidates: [
              {
                ingredient_id: saltIngredientId,
                standard_name: "소금",
                confidence: 0.8,
              },
            ],
          },
        ],
      },
      error: null,
    });
  });

  it("POST /api/v1/recipes/youtube/extract returns 401 before parsing the URL", async () => {
    mockAuth(null);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", fields: [] },
    });
  });

  it("POST /api/v1/recipes/youtube/extract returns 500 for deterministic extraction failure", async () => {
    mockAuth();

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: "https://www.youtube.com/watch?v=fail999999" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "EXTRACTION_FAILED", fields: [] },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/extract blocks direct extraction for non-recipe videos", async () => {
    mockAuth();

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: nonRecipeUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_RECIPE_VIDEO", fields: [] },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/extract does not duplicate an existing generated cooking method", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
      ],
      error: null,
    });
    const cookingMethodsTable = createCookingMethodsTable({
      existingResult: {
        data: {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        error: null,
      },
      insertResult: {
        data: null,
        error: { message: "should not insert" },
      },
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
        if (table === "youtube_extraction_sessions") return sessionsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importExtractRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.steps[0].cooking_method).toMatchObject({
      id: newMethodId,
      code: "auto_salt",
      is_new: false,
    });
    expect(body.data.new_cooking_methods).toEqual([]);
    expect(cookingMethodsTable.insert).not.toHaveBeenCalled();
    expect(sessionsTable.insert).toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register returns 401 before validating the body", async () => {
    mockAuth(null);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", fields: [] },
    });
  });

  it("POST /api/v1/recipes/youtube/register validates ingredient type constraints before database writes", async () => {
    mockAuth();

    const body = buildRegisterBody();
    body.ingredients[1] = {
      ...body.ingredients[1],
      amount: 1,
      unit: "꼬집",
      scalable: true,
    };

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "ingredients[1].amount", reason: "must_be_null" },
          { field: "ingredients[1].unit", reason: "must_be_null" },
          { field: "ingredients[1].scalable", reason: "must_be_false" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register rejects missing required fields before database writes", async () => {
    mockAuth();

    const body = {
      ...buildRegisterBody(),
      extraction_id: "",
      title: "",
      youtube_url: "",
    };

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "extraction_id", reason: "required" },
          { field: "youtube_url", reason: "invalid_url" },
          { field: "title", reason: "required" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register rejects duplicate sort and step numbers before database writes", async () => {
    mockAuth();

    const body = buildRegisterBody();
    body.ingredients[1] = {
      ...body.ingredients[1],
      sort_order: 1,
    };
    body.steps.push({
      ...body.steps[0],
      step_number: 1,
      instruction: "중복 스텝입니다.",
    });

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "ingredients[1].sort_order", reason: "duplicate" },
          { field: "steps[1].step_number", reason: "duplicate" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register rejects unresolved and needs_review ingredient drafts before database writes", async () => {
    const { POST } = await importRegisterRoute();

    for (const resolutionStatus of ["unresolved", "needs_review"]) {
      mockAuth();

      const body = structuredClone(buildRegisterBody()) as ReturnType<typeof buildRegisterBody> & {
        ingredients: Array<ReturnType<typeof buildRegisterBody>["ingredients"][number] & {
          resolution_status?: string;
        }>;
      };
      body.ingredients[0] = {
        ...body.ingredients[0],
        resolution_status: resolutionStatus,
      };

      const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      const responseBody = await response.json();

      expect(response.status).toBe(422);
      expect(responseBody).toMatchObject({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          fields: [{ field: "ingredients[0].ingredient_id", reason: "unresolved" }],
        },
      });
      expect(createServiceRoleClient).not.toHaveBeenCalled();

      createRouteHandlerClient.mockReset();
      createServiceRoleClient.mockReset();
      createServiceRoleClient.mockReturnValue(null);
    }
  });

  it("POST /api/v1/recipes/youtube/register returns 404 when the extraction session is missing", async () => {
    mockAuth();

    const { dbClient, rpc } = createRegisterDbClient({
      sessionResult: { data: null, error: null },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRegisterBody()),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "EXTRACTION_NOT_FOUND", fields: [] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register hides cross-user extraction sessions", async () => {
    mockAuth();

    const { dbClient, rpc } = createRegisterDbClient({
      sessionResult: {
        data: buildYoutubeSession({ user_id: "550e8400-e29b-41d4-a716-446655449999" }),
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRegisterBody()),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "EXTRACTION_NOT_FOUND", fields: [] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register rejects expired, consumed, and mismatched extraction sessions", async () => {
    const cases = [
      {
        session: buildYoutubeSession({
          expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        }),
        body: buildRegisterBody(),
        status: 410,
        code: "EXTRACTION_EXPIRED",
      },
      {
        session: buildYoutubeSession({ status: "consumed" }),
        body: buildRegisterBody(),
        status: 409,
        code: "EXTRACTION_ALREADY_REGISTERED",
      },
      {
        session: buildYoutubeSession(),
        body: {
          ...buildRegisterBody(),
          youtube_url: nonRecipeUrl,
        },
        status: 409,
        code: "EXTRACTION_MISMATCH",
      },
    ];

    const { POST } = await importRegisterRoute();

    for (const currentCase of cases) {
      mockAuth();
      const { dbClient, rpc } = createRegisterDbClient({
        sessionResult: { data: currentCase.session, error: null },
      });
      createServiceRoleClient.mockReturnValue(dbClient);

      const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentCase.body),
      }));
      const body = await response.json();

      expect(response.status).toBe(currentCase.status);
      expect(body).toMatchObject({
        success: false,
        data: null,
        error: { code: currentCase.code, fields: [] },
      });
      expect(rpc).not.toHaveBeenCalled();

      createRouteHandlerClient.mockReset();
      createServiceRoleClient.mockReset();
      ensurePublicUserRow.mockReset();
      ensureUserBootstrapState.mockReset();
      ensurePublicUserRow.mockResolvedValue({});
      ensureUserBootstrapState.mockResolvedValue(undefined);
    }
  });

  it("POST /api/v1/recipes/youtube/register returns 422 when a cooking method id does not exist", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [{ id: kimchiIngredientId }, { id: saltIngredientId }],
      error: null,
    });
    const cookingMethodsTable = createLookupTable({
      data: [],
      error: null,
    });
    const sessionsTable = createYoutubeSessionsTable({
      selectResult: { data: buildYoutubeSession(), error: null },
    });
    const from = vi.fn((table: string) => {
      if (table === "youtube_extraction_sessions") return sessionsTable;
      if (table === "ingredients") return ingredientsTable;
      if (table === "cooking_methods") return cookingMethodsTable;
      throw new Error(`unexpected table: ${table}`);
    });

    createServiceRoleClient.mockReturnValue({ from });

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRegisterBody()),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "steps[0].cooking_method_id", reason: "not_found" }],
      },
    });
  });

  it("POST /api/v1/recipes/youtube/register delegates durable writes to the session RPC", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [{ id: kimchiIngredientId }, { id: saltIngredientId }],
      error: null,
    });
    const cookingMethodsTable = createLookupTable({
      data: [{ id: prepMethodId }],
      error: null,
    });
    const sessionsTable = createYoutubeSessionsTable({
      selectResult: { data: buildYoutubeSession(), error: null },
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

    createServiceRoleClient.mockReturnValue({ from, rpc });

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRegisterBody()),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        recipe_id: recipeId,
        title: "백종원 김치찌개",
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalled();
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), userId);
    expect(sessionsTable.__selectQuery.eq).toHaveBeenCalledWith("id", extractionId);
    expect(rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", {
      p_extraction_id: extractionId,
      p_user_id: userId,
      p_title: "백종원 김치찌개",
      p_base_servings: 2,
      p_youtube_url: recipeUrl,
      p_youtube_video_id: "recipe12345",
      p_ingredients: buildRegisterBody().ingredients,
      p_steps: buildRegisterBody().steps,
    });
    expect(from).not.toHaveBeenCalledWith("recipe_book_items");
  });
});
