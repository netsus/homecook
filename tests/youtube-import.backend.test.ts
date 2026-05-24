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

function createEmptyIngredientSynonymsTable() {
  return createLookupTable({
    data: [],
    error: null,
  });
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
  lookupRows = [],
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
  lookupRows?: Array<{
    id: string;
    code: string;
    label: string;
    color_key: string;
    is_system: boolean;
  }>;
}) {
  const lookupResult = { data: lookupRows, error: null };
  const selectQuery = {
    ...createMaybeSingleQuery([existingResult]),
    in: vi.fn(() => selectQuery),
    order: vi.fn(() => selectQuery),
    then: createAwaitableQuery(lookupResult).then,
  };
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

interface YoutubeIngredientRegistrationRpcData {
  ingredient_id: string;
  standard_name: string;
  category: string;
  default_unit: string | null;
  synonym_status:
    | "attached"
    | "already_attached"
    | "skipped_same_as_standard"
    | "skipped_ambiguous"
    | "not_requested";
  warnings: string[];
}

const userId = "550e8400-e29b-41d4-a716-446655440030";
const recipeId = "550e8400-e29b-41d4-a716-446655441001";
const kimchiIngredientId = "550e8400-e29b-41d4-a716-446655440013";
const saltIngredientId = "550e8400-e29b-41d4-a716-446655440015";
const prepMethodId = "550e8400-e29b-41d4-a716-446655440218";
const mixMethodId = "550e8400-e29b-41d4-a716-446655440217";
const grillMethodId = "550e8400-e29b-41d4-a716-446655440215";
const newMethodId = "550e8400-e29b-41d4-a716-446655441101";
const extractionId = "550e8400-e29b-41d4-a716-446655441201";
const draftIngredientId = "550e8400-e29b-41d4-a716-446655441301";
const mustardIngredientId = "550e8400-e29b-41d4-a716-446655441401";
const recipeUrl = "https://www.youtube.com/watch?v=recipe12345";
const nonRecipeUrl = "https://youtu.be/nonrecipe123";
const uncertainUrl = "https://www.youtube.com/watch?v=uncertain123";
const incompleteUrl = "https://www.youtube.com/watch?v=incomplete123";
const needsReviewUrl = "https://www.youtube.com/watch?v=needsreview123";
const missingVideoUrl = "https://www.youtube.com/watch?v=missing123";
const cucumberSandwichUrl = "https://www.youtube.com/watch?v=cucumber123";
const cucumberSandwichDescription = [
  "제가 사용한 제품 정보는 영상 왼쪽 아래 '제품'을 누르시면 됩니다❤",
  "",
  "정남이cook 레시피📒",
  "",
  "[오이 그릭 샌드위치]",
  "",
  "✅재료",
  "청오이 1개(120g)",
  "두유 그릭 요거트",
  "호밀빵 2장",
  "소금 1t",
  "올리브 오일 1T",
  "후추",
  "알룰로스",
  "",
  "✅순서",
  "-깨끗이 씻은 오이는 양끝을 잘라내고 끄트머리 쪽에 포크를 꽂아 필러를 이용해 얇게 포를 떠준다",
  "-그리고 소금에 버무려 10분간 절여준다",
  "-절여진 오이는 키친타올에 넓게 펼쳐 물기를 닦아준다",
  "-물기가 제거된 오이는 올리브오일과 후추를 갈아 넣어 버무려준다",
  "-빵은 바삭하게 구워주고 두유 그릭 요거트를 듬뿍 발라 오이 샐러드를 올려주고 취향에 따라 알룰로스를 살짝 뿌려주면 완성",
  "",
  "#오이샌드위치 #오이요리 #샌드위치 #그릭요거트 #다이어트 #토스트 #두유그릭요거트",
  "#정남이cook #정남이쿡 #레시피 #자취요리 #요리 #간단요리",
  "#fyp #shorts #viral #shortsvideo #reels #cooking",
  "",
  "크림치즈가 대신 '두유 그릭 요거트'를 사용해서",
  "만들었는데 정말 치즈보다 훨씬다 담백하고 고소해서",
  "더 맛있더라고요!",
].join("\n");
const porkGalbiUrl = "https://www.youtube.com/watch?v=porkgalbi123";
const porkGalbiDescription = [
  "목살에 돼지갈비양념을 했어요! 배, 양파 안넣고 만드는 간단 버전입니다!",
  "",
  "📌재료(*밥 숟가락 기준)",
  "목살 300g~400g, 다진 마늘 0.5스푼, 진간장 3스푼(또는 양조간장), 맛술 1.5스푼, 물엿 1스푼, 설탕 1스푼, 후추, 연겨자 0.2스푼, 물 3스푼, 참기름 0.3스푼",
  "",
  "* 영상 속의 연겨자 양 2번 넣었습니다",
  "",
  "📌만드는 법",
  "1. 목살은 앞뒤로 칼집을 내주세요.",
  "2. 진간장, 다진 마늘, 맛술, 물엿, 설탕, 후추, 연겨자, 물, 참기름을 넣고 잘 섞어서 양념을 만들어주세요.",
  "3. 고기에 양념을 잘 버무린 뒤 최소 30분 이상 재우고 프라이팬에 중약불(또는 약불)로 자주 뒤집어가며 타지 않게 구워주세요.",
].join("\n");
const eggRiceUrl = "https://www.youtube.com/watch?v=eggrice123";
const eggRiceDescription = [
  "오늘은 냉장고 재료로 빠르게 만드는 볶음밥이에요.",
  "제품 정보와 팬은 아래 링크를 참고해주세요.",
  "",
  "🧂 재료 (2인분)",
  "- 달걀2개",
  "- 양파 1/2개",
  "- 대파: 1대",
  "- 진간장 1.5T",
  "- 후추 약간",
  "",
  "🍳 만드는 방법",
  "00:05 1) 달걀은 잘 풀어주세요.",
  "00:11 2) 팬에 기름을 두르고 대파를 볶아요.",
  "00:23 3) 밥을 넣고 간장으로 간을 맞춰요.",
  "",
  "BGM 출처는 영상 설명을 확인해주세요.",
  "#볶음밥 #간단요리 #shorts",
].join("\n");
const bakingComponentUrl = "https://www.youtube.com/watch?v=baking1234";
const bakingComponentDescription = [
  "딸기 치즈 타르트 레시피",
  "",
  "재료",
  "[타르트 반죽]",
  "박력분120g",
  "아몬드가루 20g",
  "버터 60g",
  "설탕 35g",
  "바닐라 페이스트 1t",
  "노른자 1개",
  "",
  "[치즈 필링]",
  "크림치즈 200g",
  "생크림 100g",
  "설탕 30~40g",
  "레몬즙 1t",
  "",
  "만드는 법",
  "반죽",
  "1) 버터를 부드럽게 풀고 설탕을 섞어요.",
  "2) 노른자와 바닐라 페이스트를 넣고 섞어요.",
  "필링",
  "9) 크림치즈에 설탕을 넣고 풀어요.",
  "10) 식힌 타르트지에 필링을 채워요.",
  "",
  "제품 정보와 BGM은 더보기 링크를 확인해주세요.",
  "#베이킹 #타르트",
].join("\n");
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

function createIngredientRegistrationDbClient({
  sessionResult = {
    data: buildYoutubeSession({
      draft_json: buildIngredientRegistrationDraftJson(),
    }),
    error: null,
  },
  rpcResult = {
    data: {
      ingredient_id: mustardIngredientId,
      standard_name: "연겨자",
      category: "양념",
      default_unit: null,
      synonym_status: "skipped_same_as_standard",
      warnings: [],
    } satisfies YoutubeIngredientRegistrationRpcData,
    error: null,
  },
}: {
  sessionResult?: QueryResult<YoutubeSessionRow | null>;
  rpcResult?: QueryResult<YoutubeIngredientRegistrationRpcData | null>;
} = {}) {
  const sessionsTable = createYoutubeSessionsTable({
    selectResult: sessionResult,
  });
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    if (table === "youtube_extraction_sessions") return sessionsTable;
    throw new Error(`unexpected table: ${table}`);
  });
  const dbClient = { from, rpc };

  return {
    dbClient,
    from,
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

function buildIngredientRegistrationDraftJson(
  ingredientOverrides: Record<string, unknown> = {},
) {
  return {
    extraction_id: extractionId,
    ingredients: [
      {
        draft_ingredient_id: draftIngredientId,
        ingredient_id: "",
        standard_name: "연겨자",
        amount: 0.2,
        unit: "스푼",
        ingredient_type: "QUANT",
        display_text: "연겨자 0.2스푼",
        sort_order: 1,
        scalable: true,
        confidence: null,
        resolution_status: "unresolved",
        candidates: [],
        raw_text: "연겨자 0.2스푼",
        ...ingredientOverrides,
      },
    ],
  };
}

function buildIngredientRegistrationBody(
  overrides: Record<string, unknown> = {},
) {
  return {
    extraction_id: extractionId,
    draft_ingredient_id: draftIngredientId,
    standard_name: " 연겨자 ",
    category: "양념",
    default_unit: null,
    synonym: "연겨자",
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

async function importIngredientRegistrationRoute() {
  return import("@/app/api/v1/recipes/youtube/ingredient-registration/route");
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
      {
        importRoute: importIngredientRegistrationRoute,
        path: "ingredient-registration",
        body: buildIngredientRegistrationBody(),
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

  it("schema includes the user-confirmed YouTube ingredient registration RPC", () => {
    const registrationSchema = readFileSync(
      "supabase/migrations/20260522102000_22_youtube_ingredient_registration_rpc.sql",
      "utf8",
    );

    expect(registrationSchema).toContain("register_youtube_ingredient");
    expect(registrationSchema).toContain("on conflict (standard_name) do nothing");
    expect(registrationSchema).toContain("on conflict (ingredient_id, synonym) do nothing");
    expect(registrationSchema).toContain("skipped_same_as_standard");
    expect(registrationSchema).toContain("skipped_ambiguous");
    expect(registrationSchema).toContain("already_attached");
    expect(registrationSchema).toContain("grant execute on function public.register_youtube_ingredient");
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

  it("POST /api/v1/recipes/youtube/validate uses oEmbed preview without spending YouTube Data API quota", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        title: "미리보기 김치찌개",
        author_name: "집밥 채널",
        thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importValidateRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "uncertain",
        classification_reasons: ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
        video_info: {
          video_id: "recipe12345",
          title: "미리보기 김치찌개",
          channel: "집밥 채널",
          thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
        },
      },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://www.youtube.com/oembed?"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Drecipe12345"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("youtube.googleapis.com"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("key=test-key"));
  });

  it("POST /api/v1/recipes/youtube/validate defers recipe classification until extraction", async () => {
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
        classification_status: "uncertain",
        classification_reasons: ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
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
        classification_reasons: ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
      },
      error: null,
    });
    await expect(nonRecipeResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "uncertain",
        classification_reasons: ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
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

  it("POST /api/v1/recipes/youtube/validate maps oEmbed provider failures", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "missing" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importValidateRoute();
    const providerResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const notFoundResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));

    await expect(providerResponse.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "PROVIDER_ERROR", fields: [] },
    });
    await expect(notFoundResponse.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "VIDEO_NOT_FOUND", fields: [] },
    });
    expect(providerResponse.status).toBe(502);
    expect(notFoundResponse.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://www.youtube.com/oembed?"));
  });

  it("POST /api/v1/recipes/youtube/extract maps YouTube Data API provider failures and quota errors", async () => {
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

    const { POST } = await importExtractRoute();
    const providerResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: recipeUrl }),
    }));
    const quotaResponse = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
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
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
    expect(body.data.ingredients.map((ingredient: { draft_ingredient_id: string }) =>
      ingredient.draft_ingredient_id,
    )).toHaveLength(2);
    expect(body.data.ingredients.every((ingredient: { draft_ingredient_id: string }) =>
      /^[0-9a-f-]{36}$/i.test(ingredient.draft_ingredient_id),
    )).toBe(true);
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
    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      draft_json: { ingredients: Array<{ draft_ingredient_id: string }> };
    };
    expect(insertedSession.draft_json.ingredients.map((ingredient) =>
      ingredient.draft_ingredient_id,
    )).toEqual(body.data.ingredients.map((ingredient: { draft_ingredient_id: string }) =>
      ingredient.draft_ingredient_id,
    ));
  });

  it("POST /api/v1/recipes/youtube/extract parses structured Korean description without fixed fallback ingredients", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "살찔 걱정 절대 없는 초간단 오이 샌드위치",
              channelTitle: "정남이cook",
              description: cucumberSandwichDescription,
              tags: ["오이샌드위치", "레시피"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/cucumber123/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT58S",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ingredientsTable = createLookupTable({
      data: [
        { id: "ing-cucumber", standard_name: "청오이" },
        { id: "ing-yogurt", standard_name: "두유 그릭 요거트" },
        { id: "ing-bread", standard_name: "호밀빵" },
        { id: "ing-salt", standard_name: "소금" },
        { id: "ing-oil", standard_name: "올리브 오일" },
        { id: "ing-pepper", standard_name: "후추" },
        { id: "ing-allulose", standard_name: "알룰로스" },
      ],
      error: null,
    });
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
      lookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: newMethodId,
          code: "auto_salt",
          label: "절이기",
          color_key: "unassigned",
          is_system: false,
        },
        {
          id: mixMethodId,
          code: "mix",
          label: "무치기",
          color_key: "green",
          is_system: true,
        },
        {
          id: grillMethodId,
          code: "grill",
          label: "굽기",
          color_key: "brown",
          is_system: true,
        },
      ],
    });
    const sessionsTable = createYoutubeSessionsTable({});
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
      body: JSON.stringify({ youtube_url: cucumberSandwichUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "살찔 걱정 절대 없는 초간단 오이 샌드위치",
        blocking_issues: [],
      },
      error: null,
    });
    expect(body.data.ingredients.slice(0, 3)).toMatchObject([
      {
        standard_name: "청오이",
        amount: 1,
        unit: "개",
        ingredient_id: "ing-cucumber",
        resolution_status: "resolved",
        raw_text: "청오이 1개(120g)",
      },
      {
        standard_name: "두유 그릭 요거트",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        ingredient_id: "ing-yogurt",
        resolution_status: "resolved",
      },
      {
        standard_name: "호밀빵",
        amount: 2,
        unit: "장",
        ingredient_id: "ing-bread",
        resolution_status: "resolved",
      },
    ]);
    expect(body.data.ingredients.map((ingredient: { standard_name: string }) => ingredient.standard_name))
      .not.toContain("김치");
    expect(body.data.ingredients).toHaveLength(7);
    expect(body.data.steps).toHaveLength(5);
    expect(body.data.steps.slice(0, 2)).toMatchObject([
      {
        step_number: 1,
        instruction: "깨끗이 씻은 오이는 양끝을 잘라내고 끄트머리 쪽에 포크를 꽂아 필러를 이용해 얇게 포를 떠준다",
        is_incomplete: false,
        missing_fields: [],
        cooking_method: {
          code: "prep",
          label: "손질",
        },
      },
      {
        step_number: 2,
        instruction: "그리고 소금에 버무려 10분간 절여준다",
        cooking_method: {
          code: "auto_salt",
          label: "절이기",
        },
      },
    ]);
    expect(body.data.steps.map((step: { cooking_method: { code: string } }) =>
      step.cooking_method.code,
    )).toEqual(["prep", "auto_salt", "prep", "mix", "grill"]);
    expect(new Set(body.data.steps.map((step: { cooking_method: { code: string } }) =>
      step.cooking_method.code,
    )).size).toBeGreaterThan(1);
    expect(ingredientsTable.__query.in).toHaveBeenCalledWith("standard_name", [
      "청오이",
      "두유 그릭 요거트",
      "호밀빵",
      "소금",
      "올리브 오일",
      "후추",
      "알룰로스",
    ]);
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      raw_source_text: cucumberSandwichDescription,
      draft_json: expect.objectContaining({
        ingredients: expect.arrayContaining([
          expect.objectContaining({ standard_name: "청오이" }),
        ]),
      }),
    }));
  });

  it("POST /api/v1/recipes/youtube/extract splits one-line comma ingredients before resolving them", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "목살 돼지갈비 양념",
              channelTitle: "집밥 채널",
              description: porkGalbiDescription,
              tags: ["목살", "돼지갈비", "레시피"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/porkgalbi123/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT52S",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ingredientsTable = createLookupTable({
      data: [
        { id: "ing-pork-neck", standard_name: "목살" },
        { id: "ing-cooking-wine", standard_name: "맛술" },
        { id: "ing-corn-syrup", standard_name: "물엿" },
        { id: "ing-sugar", standard_name: "설탕" },
        { id: "ing-pepper", standard_name: "후추" },
        { id: "ing-mustard", standard_name: "연겨자" },
        { id: "ing-water", standard_name: "물" },
        { id: "ing-sesame-oil", standard_name: "참기름" },
      ],
      error: null,
    });
    const ingredientSynonymsTable = createLookupTable({
      data: [
        {
          synonym: "다진 마늘",
          ingredients: { id: "ing-minced-garlic", standard_name: "다진마늘" },
        },
        {
          synonym: "진간장",
          ingredients: { id: "ing-soy-sauce", standard_name: "간장" },
        },
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
      body: JSON.stringify({ youtube_url: porkGalbiUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "목살 돼지갈비 양념",
        blocking_issues: [],
      },
      error: null,
    });
    expect(body.data.ingredients.map((ingredient: { standard_name: string }) => ingredient.standard_name)).toEqual([
      "목살",
      "다진마늘",
      "간장",
      "맛술",
      "물엿",
      "설탕",
      "후추",
      "연겨자",
      "물",
      "참기름",
    ]);
    expect(body.data.ingredients.every((ingredient: { resolution_status: string }) =>
      ingredient.resolution_status === "resolved",
    )).toBe(true);
    expect(body.data.ingredients.every((ingredient: { standard_name: string }) =>
      !ingredient.standard_name.includes(","),
    )).toBe(true);
    expect(body.data.ingredients[0]).toMatchObject({
      standard_name: "목살",
      amount: 300,
      unit: "g",
      ingredient_id: "ing-pork-neck",
      raw_text: "목살 300g~400g",
    });
    expect(body.data.steps.map((step: { instruction: string }) => step.instruction)).toEqual([
      "목살은 앞뒤로 칼집을 내주세요.",
      "진간장, 다진 마늘, 맛술, 물엿, 설탕, 후추, 연겨자, 물, 참기름을 넣고 잘 섞어서 양념을 만들어주세요.",
      "고기에 양념을 잘 버무린 뒤 최소 30분 이상 재우고 프라이팬에 중약불(또는 약불)로 자주 뒤집어가며 타지 않게 구워주세요.",
    ]);
    expect(ingredientsTable.__query.in).toHaveBeenCalledWith("standard_name", [
      "목살",
      "다진 마늘",
      "진간장",
      "맛술",
      "물엿",
      "설탕",
      "후추",
      "연겨자",
      "물",
      "참기름",
    ]);
    expect(ingredientSynonymsTable.__query.in).toHaveBeenCalledWith("synonym", [
      "목살",
      "다진 마늘",
      "진간장",
      "맛술",
      "물엿",
      "설탕",
      "후추",
      "연겨자",
      "물",
      "참기름",
    ]);
  });

  it("POST /api/v1/recipes/youtube/extract parses varied headings, compact amounts, and timestamped steps", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "초간단 계란 볶음밥",
              channelTitle: "집밥 채널",
              description: eggRiceDescription,
              tags: ["볶음밥", "레시피"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/eggrice123/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT45S",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ingredientsTable = createLookupTable({
      data: [
        { id: "ing-egg", standard_name: "달걀" },
        { id: "ing-onion", standard_name: "양파" },
        { id: "ing-green-onion", standard_name: "대파" },
        { id: "ing-soy-sauce", standard_name: "간장" },
        { id: "ing-pepper", standard_name: "후추" },
      ],
      error: null,
    });
    const ingredientSynonymsTable = createLookupTable({
      data: [
        {
          synonym: "진간장",
          ingredients: { id: "ing-soy-sauce", standard_name: "간장" },
        },
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
      body: JSON.stringify({ youtube_url: eggRiceUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "초간단 계란 볶음밥",
        blocking_issues: [],
        ingredients: [
          {
            standard_name: "달걀",
            amount: 2,
            unit: "개",
            resolution_status: "resolved",
          },
          {
            standard_name: "양파",
            amount: 0.5,
            unit: "개",
            resolution_status: "resolved",
          },
          {
            standard_name: "대파",
            amount: 1,
            unit: "대",
            resolution_status: "resolved",
          },
          {
            standard_name: "간장",
            amount: 1.5,
            unit: "T",
            resolution_status: "resolved",
          },
          {
            standard_name: "후추",
            amount: null,
            unit: null,
            ingredient_type: "TO_TASTE",
            resolution_status: "resolved",
          },
        ],
        steps: [
          {
            step_number: 1,
            instruction: "달걀은 잘 풀어주세요.",
          },
          {
            step_number: 2,
            instruction: "팬에 기름을 두르고 대파를 볶아요.",
          },
          {
            step_number: 3,
            instruction: "밥을 넣고 간장으로 간을 맞춰요.",
          },
        ],
      },
      error: null,
    });
    expect(ingredientsTable.__query.in).toHaveBeenCalledWith("standard_name", [
      "달걀",
      "양파",
      "대파",
      "진간장",
      "후추",
    ]);
    expect(ingredientSynonymsTable.__query.in).toHaveBeenCalledWith("synonym", [
      "달걀",
      "양파",
      "대파",
      "진간장",
      "후추",
    ]);
  });

  it("POST /api/v1/recipes/youtube/extract parses multi-component baking descriptions with v2 parser diagnostics", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "딸기 치즈 타르트",
              channelTitle: "베이킹 채널",
              description: bakingComponentDescription,
              tags: ["베이킹", "레시피"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/baking1234/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT12M",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ingredientsTable = createLookupTable({
      data: [
        { id: "ing-flour", standard_name: "박력분" },
        { id: "ing-almond-powder", standard_name: "아몬드가루" },
        { id: "ing-butter", standard_name: "버터" },
        { id: "ing-sugar", standard_name: "설탕" },
        { id: "ing-vanilla-paste", standard_name: "바닐라 페이스트" },
        { id: "ing-yolk", standard_name: "노른자" },
        { id: "ing-cream-cheese", standard_name: "크림치즈" },
        { id: "ing-cream", standard_name: "생크림" },
        { id: "ing-lemon-juice", standard_name: "레몬즙" },
      ],
      error: null,
    });
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
      body: JSON.stringify({ youtube_url: bakingComponentUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "딸기 치즈 타르트",
        blocking_issues: [],
        draft_warnings: expect.arrayContaining([
          "원본 조리 순서 번호가 1, 2, 9, 10처럼 비연속이라 중간 단계 누락 가능성이 있어요.",
          "같은 재료를 컴포넌트별로 합산했어요. 인분을 바꾸면 괄호 안 원본 수량은 자동으로 바뀌지 않아요.",
        ]),
      },
      error: null,
    });
    expect(body.data.ingredients.map((ingredient: { standard_name: string }) => ingredient.standard_name)).toEqual([
      "박력분",
      "아몬드가루",
      "버터",
      "설탕",
      "바닐라 페이스트",
      "노른자",
      "크림치즈",
      "생크림",
      "레몬즙",
    ]);
    expect(body.data.ingredients.find((ingredient: { standard_name: string }) => ingredient.standard_name === "바닐라 페이스트"))
      .toMatchObject({
        amount: 1,
        unit: "t",
        display_text: "[타르트 반죽] 바닐라 페이스트 1t",
        resolution_status: "resolved",
      });
    expect(body.data.ingredients.find((ingredient: { standard_name: string }) => ingredient.standard_name === "노른자"))
      .toMatchObject({
        amount: 1,
        unit: "개",
        resolution_status: "resolved",
      });
    expect(body.data.ingredients.find((ingredient: { standard_name: string }) => ingredient.standard_name === "설탕"))
      .toMatchObject({
        amount: 65,
        unit: "g",
        display_text: "[타르트 반죽+치즈 필링] 설탕 65g (타르트 반죽 35g + 치즈 필링 30g)",
      });
    expect(body.data.steps.map((step: { instruction: string }) => step.instruction)).toEqual([
      "[타르트 반죽] 버터를 부드럽게 풀고 설탕을 섞어요.",
      "[타르트 반죽] 노른자와 바닐라 페이스트를 넣고 섞어요.",
      "[치즈 필링] 크림치즈에 설탕을 넣고 풀어요.",
      "[치즈 필링] 식힌 타르트지에 필링을 채워요.",
    ]);
    expect(ingredientsTable.__query.in).toHaveBeenCalledWith("standard_name", [
      "박력분",
      "아몬드가루",
      "버터",
      "설탕",
      "바닐라 페이스트",
      "노른자",
      "크림치즈",
      "생크림",
      "레몬즙",
    ]);
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      extraction_meta_json: expect.objectContaining({
        description_parser_version: "v2",
        description_parser_selection_outcome: "selected_single_recipe",
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
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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
    const ingredientSynonymsTable = createEmptyIngredientSynonymsTable();
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
        if (table === "ingredient_synonyms") return ingredientSynonymsTable;
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

  it("POST /api/v1/recipes/youtube/ingredient-registration returns 401 before validating the body", async () => {
    mockAuth(null);

    const { POST } = await importIngredientRegistrationRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/ingredient-registration", {
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
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/ingredient-registration validates user-confirmed ingredient input before database writes", async () => {
    mockAuth();

    const { POST } = await importIngredientRegistrationRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/ingredient-registration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildIngredientRegistrationBody({
        extraction_id: "not-a-uuid",
        draft_ingredient_id: "",
        standard_name: "  ",
        category: "디저트",
        default_unit: "123456789012345678901",
        synonym: "bad\nname",
      })),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "extraction_id", reason: "invalid_uuid" },
          { field: "draft_ingredient_id", reason: "required" },
          { field: "standard_name", reason: "required" },
          { field: "category", reason: "invalid_enum" },
          { field: "default_unit", reason: "max_length" },
          { field: "synonym", reason: "control_chars" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/ingredient-registration validates session ownership, expiry, status, and draft row", async () => {
    const missingDraftId = "550e8400-e29b-41d4-a716-446655441302";
    const cases = [
      {
        sessionResult: { data: null, error: null },
        status: 404,
        code: "NOT_FOUND",
      },
      {
        sessionResult: {
          data: buildYoutubeSession({
            user_id: "550e8400-e29b-41d4-a716-446655449999",
            draft_json: buildIngredientRegistrationDraftJson(),
          }),
          error: null,
        },
        status: 404,
        code: "NOT_FOUND",
      },
      {
        sessionResult: {
          data: buildYoutubeSession({
            expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
            draft_json: buildIngredientRegistrationDraftJson(),
          }),
          error: null,
        },
        status: 410,
        code: "SESSION_EXPIRED",
      },
      {
        sessionResult: {
          data: buildYoutubeSession({
            status: "consumed",
            draft_json: buildIngredientRegistrationDraftJson(),
          }),
          error: null,
        },
        status: 409,
        code: "CONFLICT",
      },
      {
        sessionResult: {
          data: buildYoutubeSession({
            draft_json: buildIngredientRegistrationDraftJson({
              draft_ingredient_id: missingDraftId,
            }),
          }),
          error: null,
        },
        status: 409,
        code: "CONFLICT",
      },
      {
        sessionResult: {
          data: buildYoutubeSession({
            draft_json: buildIngredientRegistrationDraftJson({
              ingredient_id: mustardIngredientId,
              resolution_status: "resolved",
            }),
          }),
          error: null,
        },
        status: 409,
        code: "CONFLICT",
      },
    ] satisfies Array<{
      sessionResult: QueryResult<YoutubeSessionRow | null>;
      status: number;
      code: string;
    }>;

    const { POST } = await importIngredientRegistrationRoute();

    for (const currentCase of cases) {
      mockAuth();
      const { dbClient, rpc } = createIngredientRegistrationDbClient({
        sessionResult: currentCase.sessionResult,
      });
      createServiceRoleClient.mockReturnValue(dbClient);

      const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/ingredient-registration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildIngredientRegistrationBody()),
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
    }
  });

  it("POST /api/v1/recipes/youtube/ingredient-registration delegates ingredient creation to the RPC", async () => {
    mockAuth();

    const { dbClient, rpc, sessionsTable } = createIngredientRegistrationDbClient({
      rpcResult: {
        data: {
          ingredient_id: mustardIngredientId,
          standard_name: "연겨자 소스",
          category: "양념",
          default_unit: "g",
          synonym_status: "attached",
          warnings: [],
        },
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importIngredientRegistrationRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/ingredient-registration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildIngredientRegistrationBody({
        standard_name: "  연겨자   소스  ",
        default_unit: " g ",
        synonym: "Soy Sauce",
      })),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        ingredient: {
          ingredient_id: mustardIngredientId,
          standard_name: "연겨자 소스",
          category: "양념",
          default_unit: "g",
          resolution_status: "resolved",
        },
        synonym_status: "attached",
        warnings: [],
      },
      error: null,
    });
    expect(sessionsTable.__selectQuery.eq).toHaveBeenCalledWith("id", extractionId);
    expect(rpc).toHaveBeenCalledWith("register_youtube_ingredient", {
      p_standard_name: "연겨자 소스",
      p_category: "양념",
      p_default_unit: "g",
      p_synonym: "soy sauce",
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
