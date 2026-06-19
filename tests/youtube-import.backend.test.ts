import { existsSync, readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import fixtureData from "@/qa/fixtures/slices-01-05.json";
import { CANONICAL_COOKING_METHODS } from "@/lib/cooking-method-taxonomy";
import type {
  YoutubeAuthorCommentProvider,
  YoutubeRecipeLlmExtractor,
  YoutubeTranscriptProvider,
  YoutubeVideoProvider,
  YoutubeVisualQuantityExtractor,
  YoutubeVisualRecipeExtractor,
} from "@/lib/server/youtube-import";

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
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
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
  selectResults,
  insertResult = { data: null, error: null },
}: {
  selectResult?: QueryResult<YoutubeSessionRow | null>;
  selectResults?: Array<QueryResult<YoutubeSessionRow | null>>;
  insertResult?: QueryResult<null>;
}) {
  const selectQuery = createMaybeSingleQuery<YoutubeSessionRow>(
    selectResults ?? [
      selectResult ?? { data: null, error: { message: "session lookup not configured" } },
    ],
  );

  return {
    __selectQuery: selectQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
  };
}

interface YoutubeExtractionCandidateRow {
  id: string;
  extraction_session_id: string;
  candidate_id: string;
  status: "draft" | "promoted" | "registered" | "skipped" | "expired";
  child_extraction_session_id: string | null;
  recipe_id: string | null;
  title: string;
  start_ms: number | null;
  end_ms: number | null;
  confidence: number | null;
  draft_ingredient_ids_json: string[];
  source_meta_json: Record<string, unknown>;
  promoted_at?: string | null;
  registered_at?: string | null;
}

function createYoutubeExtractionCandidatesTable({
  selectResults = [{ data: null, error: { message: "candidate lookup not configured" } }],
  insertResult = { data: null, error: null },
  updateResult = { data: null, error: null },
}: {
  selectResults?: Array<QueryResult<YoutubeExtractionCandidateRow | null>>;
  insertResult?: QueryResult<null>;
  updateResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createMaybeSingleQuery<YoutubeExtractionCandidateRow>(selectResults);
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then: createAwaitableQuery(updateResult).then,
  };

  return {
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
    update: vi.fn((values: unknown) => {
      void values;
      return updateQuery;
    }),
  };
}

function createYoutubeTranscriptCacheTable({
  rows = [],
  insertResult = { data: null, error: null },
  updateResult = { data: null, error: null },
}: {
  rows?: YoutubeTranscriptCacheRow[];
  insertResult?: QueryResult<null>;
  updateResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery({ data: rows, error: null });
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then: createAwaitableQuery(updateResult).then,
  };

  return {
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
    update: vi.fn((values: unknown) => {
      void values;
      return updateQuery;
    }),
  };
}

function createYoutubeTranscriptFetchEventsTable({
  rows = [],
  selectResult,
  insertResult = { data: null, error: null },
}: {
  rows?: YoutubeTranscriptFetchEventRow[];
  selectResult?: QueryResult<YoutubeTranscriptFetchEventRow[]>;
  insertResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery(selectResult ?? { data: rows, error: null });

  return {
    __selectQuery: selectQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
  };
}

function createYoutubeLlmExtractionCacheTable({
  rows = [],
  insertResult = { data: null, error: null },
  updateResult = { data: null, error: null },
}: {
  rows?: YoutubeLlmExtractionCacheRow[];
  insertResult?: QueryResult<null>;
  updateResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery({ data: rows, error: null });
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then: createAwaitableQuery(updateResult).then,
  };

  return {
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
    update: vi.fn((values: unknown) => {
      void values;
      return updateQuery;
    }),
  };
}

function createYoutubeLlmExtractionEventsTable({
  rows = [],
  selectResult,
  insertResult = { data: null, error: null },
}: {
  rows?: YoutubeLlmExtractionEventRow[];
  selectResult?: QueryResult<YoutubeLlmExtractionEventRow[]>;
  insertResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery(selectResult ?? { data: rows, error: null });

  return {
    __selectQuery: selectQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
  };
}

function createYoutubeVisualExtractionCacheTable({
  rows = [],
  insertResult = { data: null, error: null },
  updateResult = { data: null, error: null },
}: {
  rows?: YoutubeVisualExtractionCacheRow[];
  insertResult?: QueryResult<null>;
  updateResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery({ data: rows, error: null });
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    then: createAwaitableQuery(updateResult).then,
  };

  return {
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
    insert: vi.fn((values: unknown) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
    select: vi.fn(() => selectQuery),
    update: vi.fn((values: unknown) => {
      void values;
      return updateQuery;
    }),
  };
}

function createYoutubeVisualExtractionEventsTable({
  rows = [],
  selectResult,
  insertResult = { data: null, error: null },
}: {
  rows?: YoutubeVisualExtractionEventRow[];
  selectResult?: QueryResult<YoutubeVisualExtractionEventRow[]>;
  insertResult?: QueryResult<null>;
} = {}) {
  const selectQuery = createArrayQuery(selectResult ?? { data: rows, error: null });

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
  video_title?: string | null;
  channel_title?: string | null;
  thumbnail_url?: string | null;
  provider_version: string | null;
  source_providers?: string[];
  classification_status?: "recipe" | "uncertain" | "non_recipe";
  classification_reasons?: string[];
  extraction_methods: string[];
  raw_source_text: string | null;
  extraction_meta_json: Record<string, unknown>;
  draft_json: Record<string, unknown>;
  status: "draft" | "consumed" | "expired";
  expires_at: string;
  session_kind?: "single" | "multi_parent" | "candidate_child";
  parent_extraction_session_id?: string | null;
  parent_candidate_id?: string | null;
}

interface YoutubeTranscriptCacheRow {
  id: string;
  youtube_video_id: string;
  language: string;
  source_provider: string;
  source_kind: string;
  transcript_text: string;
  segments_json: unknown;
  expires_at: string;
}

interface YoutubeTranscriptFetchEventRow {
  id: string;
  user_id: string | null;
  youtube_video_id: string;
  provider: string;
  cache_hit: boolean;
  status: string;
  reason: string | null;
  estimated_cost_microusd: number;
  created_at: string;
}

interface YoutubeLlmExtractionCacheRow {
  id: string;
  youtube_video_id: string;
  source_hash: string;
  schema_version: string;
  model: string;
  source_kinds: string[];
  result_json: unknown;
  expires_at: string;
}

interface YoutubeLlmExtractionEventRow {
  id: string;
  user_id: string | null;
  youtube_video_id: string;
  provider: string;
  model: string | null;
  cache_hit: boolean;
  status: string;
  reason: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_microusd: number;
  created_at: string;
}

interface YoutubeVisualExtractionCacheRow {
  id: string;
  youtube_video_id: string;
  provider: string;
  schema_version: string;
  visual_request_hash: string;
  result_json: unknown;
  expires_at: string;
}

interface YoutubeVisualExtractionEventRow {
  id: string;
  user_id: string | null;
  youtube_video_id: string;
  provider: string;
  model: string | null;
  cache_hit: boolean;
  event_type: string;
  status: string;
  reason: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_microusd: number;
  created_at: string;
}

interface YoutubeIngredientRegistrationRpcData {
  ingredient_id: string;
  standard_name: string;
  category: string;
  category_code?: string | null;
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
const waterIngredientId = "550e8400-e29b-41d4-a716-446655440016";
const riceIngredientId = "550e8400-e29b-41d4-a716-446655440017";
const eggIngredientId = "550e8400-e29b-41d4-a716-446655440018";
const carrotIngredientId = "550e8400-e29b-41d4-a716-446655440019";
const onionIngredientId = "550e8400-e29b-41d4-a716-446655440020";
const garlicChiveIngredientId = "550e8400-e29b-41d4-a716-446655440021";
const shrimpIngredientId = "550e8400-e29b-41d4-a716-446655440022";
const starchIngredientId = "550e8400-e29b-41d4-a716-446655440023";
const pepperIngredientId = "550e8400-e29b-41d4-a716-446655440024";
const prepMethodId = "550e8400-e29b-41d4-a716-446655440218";
const mixMethodId = "550e8400-e29b-41d4-a716-446655440217";
const grillMethodId = "550e8400-e29b-41d4-a716-446655440215";
const newMethodId = "550e8400-e29b-41d4-a716-446655441101";
const extractionId = "550e8400-e29b-41d4-a716-446655441201";
const childExtractionId = "550e8400-e29b-41d4-a716-446655441202";
const draftIngredientId = "550e8400-e29b-41d4-a716-446655441301";
const saltDraftIngredientId = "550e8400-e29b-41d4-a716-446655441302";
const mustardIngredientId = "550e8400-e29b-41d4-a716-446655441401";
const recipeUrl = "https://www.youtube.com/watch?v=recipe12345";
const cookingTaxonomyUrl = "https://www.youtube.com/watch?v=taxonomy123";
const nonRecipeUrl = "https://youtu.be/nonrecipe123";
const uncertainUrl = "https://www.youtube.com/watch?v=uncertain123";
const incompleteUrl = "https://www.youtube.com/watch?v=incomplete123";
const transcriptFallbackUrl = "https://www.youtube.com/watch?v=transcript123";
const transcriptNoCaptionUrl = "https://www.youtube.com/watch?v=nocaption123";
const publicCaptionUrl = "https://www.youtube.com/watch?v=captionpublic123";
const authorCommentFetchUrl = "https://www.youtube.com/watch?v=authorfetch123";
const ambiguousMatchUrl = "https://www.youtube.com/watch?v=ambiguousmatch123";
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
const cookingTaxonomyDescription = [
  "새 조리법 테스트 레시피",
  "",
  "재료",
  "새우 100g",
  "마늘 2쪽",
  "두부 1모",
  "달걀 2개",
  "고등어 1마리",
  "감자 1개",
  "면 1인분",
  "채소 100g",
  "반죽 1개",
  "부침가루 50g",
  "",
  "만드는 법",
  "1. 냉동 새우는 찬물에 해동해주세요.",
  "2. 마늘은 곱게 다져주세요.",
  "3. 두부는 한입 크기로 썰어주세요.",
  "4. 달걀물을 팬에 얇게 부쳐주세요.",
  "5. 고등어는 에어프라이어에 180도로 구워주세요.",
  "6. 감자는 전자레인지에 3분 돌려주세요.",
  "7. 남은 소스는 약불에서 졸여주세요.",
  "8. 면은 끓는 물에 삶아요.",
  "9. 채소는 찜기에 쪄요.",
  "10. 반죽은 오븐에 구워주세요.",
  "11. 부침가루는 물에 섞어주세요.",
].join("\n");
const ORIGINAL_YOUTUBE_IMPORT_FLAG = process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT;
const ORIGINAL_PUBLIC_YOUTUBE_IMPORT_FLAG = process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT;

function buildCookingTaxonomyMethodLookupRows() {
  return [
    ...CANONICAL_COOKING_METHODS.map((method) => ({
      id: `method-${method.code}`,
      code: method.code,
      label: method.label,
      color_key: method.color_key,
      is_system: method.is_system,
    })),
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
  ];
}

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
  const candidatesTable = createYoutubeExtractionCandidatesTable();
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    if (table === "youtube_extraction_sessions") return sessionsTable;
    if (table === "youtube_extraction_candidates") return candidatesTable;
    if (table === "ingredients") return ingredientsTable;
    if (table === "cooking_methods") return cookingMethodsTable;
    throw new Error(`unexpected table: ${table}`);
  });
  const dbClient = { from, rpc };

  return {
    cookingMethodsTable,
    dbClient,
    candidatesTable,
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
        draft_ingredient_id: draftIngredientId,
        ingredient_id: kimchiIngredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        component_label: "찌개 재료",
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
        component_label: "찌개 재료",
        scalable: false,
        sort_order: 2,
        quantity_confirmation_status: "not_required",
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "김치를 한입 크기로 썬다.",
        component_label: "찌개 재료",
        cooking_method_id: prepMethodId,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: null,
        duration_text: null,
      },
    ],
  };
}

function buildRegisterDraftJson({
  kimchiOverrides = {},
  saltOverrides = {},
}: {
  kimchiOverrides?: Record<string, unknown>;
  saltOverrides?: Record<string, unknown>;
} = {}) {
  return {
    extraction_id: extractionId,
    ingredients: [
      {
        draft_ingredient_id: draftIngredientId,
        ingredient_id: kimchiIngredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        sort_order: 1,
        scalable: true,
        confidence: 0.95,
        resolution_status: "resolved",
        raw_text: "김치 200g",
        quantity_source: "text_explicit",
        quantity_confidence: 0.95,
        quantity_raw_text: "김치 200g",
        quantity_evidence_refs: [{
          source_method: "description",
          source_provider: "description_parser",
          line_index: 2,
          snippet: "김치 200g",
        }],
        quantity_review_required: false,
        quantity_user_confirmed: false,
        ...kimchiOverrides,
      },
      {
        draft_ingredient_id: saltDraftIngredientId,
        ingredient_id: saltIngredientId,
        standard_name: "소금",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        display_text: "소금 약간",
        sort_order: 2,
        scalable: false,
        confidence: 0.8,
        resolution_status: "resolved",
        raw_text: "소금 약간",
        quantity_source: "text_explicit",
        quantity_confidence: 0.8,
        quantity_raw_text: "소금 약간",
        quantity_evidence_refs: [{
          source_method: "description",
          source_provider: "description_parser",
          line_index: 3,
          snippet: "소금 약간",
        }],
        quantity_review_required: false,
        quantity_user_confirmed: false,
        ...saltOverrides,
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
    video_title: "백종원 김치찌개",
    channel_title: "백종원의 요리비책",
    thumbnail_url: "https://img.youtube.com/vi/recipe12345/hqdefault.jpg",
    provider_version: "youtube-videos-list-description-v1",
    source_providers: ["youtube_videos_list", "description_parser"],
    classification_status: "recipe",
    classification_reasons: [],
    extraction_methods: ["description"],
    raw_source_text: "김치찌개 레시피\n재료\n김치 200g",
    extraction_meta_json: {
      provider_version: "youtube-videos-list-description-v1",
      classification_status: "recipe",
    },
    draft_json: buildRegisterDraftJson(),
    status: "draft",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    session_kind: "single",
    parent_extraction_session_id: null,
    parent_candidate_id: null,
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

function buildYoutubeRecipeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidate_id: "candidate-1",
    title: "김치볶음밥",
    start_ms: 10_000,
    end_ms: 40_000,
    confidence: 0.88,
    ingredients: [
      {
        draft_ingredient_id: draftIngredientId,
        ingredient_id: kimchiIngredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        sort_order: 1,
        scalable: true,
        confidence: 0.95,
        resolution_status: "resolved",
        raw_text: "김치 200g",
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "김치를 볶아요.",
        cooking_method: {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_new: false,
        },
        duration_text: null,
        is_incomplete: false,
        missing_fields: [],
        raw_text: "김치를 볶아요.",
      },
    ],
    draft_warnings: [],
    blocking_issues: [],
    evidence_refs: [
      {
        source: "caption",
        line_index: 0,
        start_ms: 10_000,
        end_ms: 14_000,
        text: "김치볶음밥",
      },
    ],
    ...overrides,
  };
}

function buildExtractionCandidateRow(
  overrides: Partial<YoutubeExtractionCandidateRow> = {},
): YoutubeExtractionCandidateRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655441501",
    extraction_session_id: extractionId,
    candidate_id: "candidate-1",
    status: "draft",
    child_extraction_session_id: null,
    recipe_id: null,
    title: "김치볶음밥",
    start_ms: 10_000,
    end_ms: 40_000,
    confidence: 0.88,
    draft_ingredient_ids_json: [draftIngredientId],
    source_meta_json: {},
    promoted_at: null,
    registered_at: null,
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

async function importCandidateDraftRoute() {
  return import("@/app/api/v1/recipes/youtube/candidate-drafts/route");
}

function createTranscriptFallbackExtractDbClient({
  ingredientLookupRows = [
    { id: kimchiIngredientId, standard_name: "김치" },
    { id: saltIngredientId, standard_name: "소금" },
  ],
  cookingMethodLookupRows = [],
  transcriptCacheRows = [],
  transcriptFetchEventRows = [],
  transcriptFetchEventSelectResult,
  llmCacheRows = [],
  llmEventRows = [],
  llmEventSelectResult,
  visualCacheRows = [],
  visualEventRows = [],
  visualEventSelectResult,
}: {
  ingredientLookupRows?: Array<{ id: string; standard_name: string }>;
  cookingMethodLookupRows?: NonNullable<Parameters<typeof createCookingMethodsTable>[0]["lookupRows"]>;
  transcriptCacheRows?: YoutubeTranscriptCacheRow[];
  transcriptFetchEventRows?: YoutubeTranscriptFetchEventRow[];
  transcriptFetchEventSelectResult?: QueryResult<YoutubeTranscriptFetchEventRow[]>;
  llmCacheRows?: YoutubeLlmExtractionCacheRow[];
  llmEventRows?: YoutubeLlmExtractionEventRow[];
  llmEventSelectResult?: QueryResult<YoutubeLlmExtractionEventRow[]>;
  visualCacheRows?: YoutubeVisualExtractionCacheRow[];
  visualEventRows?: YoutubeVisualExtractionEventRow[];
  visualEventSelectResult?: QueryResult<YoutubeVisualExtractionEventRow[]>;
} = {}) {
  const ingredientsTable = createLookupTable({
    data: ingredientLookupRows,
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
    lookupRows: cookingMethodLookupRows,
  });
  const sessionsTable = createYoutubeSessionsTable({});
  const candidatesTable = createYoutubeExtractionCandidatesTable({
    selectResults: [],
  });
  const transcriptCacheTable = createYoutubeTranscriptCacheTable({
    rows: transcriptCacheRows,
  });
  const transcriptFetchEventsTable = createYoutubeTranscriptFetchEventsTable({
    rows: transcriptFetchEventRows,
    selectResult: transcriptFetchEventSelectResult,
  });
  const llmExtractionCacheTable = createYoutubeLlmExtractionCacheTable({
    rows: llmCacheRows,
  });
  const llmExtractionEventsTable = createYoutubeLlmExtractionEventsTable({
    rows: llmEventRows,
    selectResult: llmEventSelectResult,
  });
  const visualExtractionCacheTable = createYoutubeVisualExtractionCacheTable({
    rows: visualCacheRows,
  });
  const visualExtractionEventsTable = createYoutubeVisualExtractionEventsTable({
    rows: visualEventRows,
    selectResult: visualEventSelectResult,
  });
  const dbClient = {
    from: vi.fn((table: string) => {
      if (table === "ingredients") return ingredientsTable;
      if (table === "ingredient_synonyms") return ingredientSynonymsTable;
      if (table === "cooking_methods") return cookingMethodsTable;
      if (table === "youtube_extraction_sessions") return sessionsTable;
      if (table === "youtube_extraction_candidates") return candidatesTable;
      if (table === "youtube_transcript_cache") return transcriptCacheTable;
      if (table === "youtube_transcript_fetch_events") return transcriptFetchEventsTable;
      if (table === "youtube_llm_extraction_cache") return llmExtractionCacheTable;
      if (table === "youtube_llm_extraction_events") return llmExtractionEventsTable;
      if (table === "youtube_visual_extraction_cache") return visualExtractionCacheTable;
      if (table === "youtube_visual_extraction_events") return visualExtractionEventsTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return {
    candidatesTable,
    dbClient,
    llmExtractionCacheTable,
    llmExtractionEventsTable,
    sessionsTable,
    transcriptCacheTable,
    transcriptFetchEventsTable,
    visualExtractionCacheTable,
    visualExtractionEventsTable,
  };
}

async function withYoutubeTranscriptProvider<T>(
  provider: YoutubeTranscriptProvider,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreTranscriptProvider = youtubeImport.setYoutubeTranscriptProviderForTest(provider);

  try {
    return await callback();
  } finally {
    restoreTranscriptProvider();
  }
}

async function withYoutubeAuthorCommentProvider<T>(
  provider: YoutubeAuthorCommentProvider,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreAuthorCommentProvider = youtubeImport.setYoutubeAuthorCommentProviderForTest(provider);

  try {
    return await callback();
  } finally {
    restoreAuthorCommentProvider();
  }
}

async function withYoutubeVideoProvider<T>(
  provider: YoutubeVideoProvider,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreVideoProvider = youtubeImport.setYoutubeVideoProviderForTest(provider);

  try {
    return await callback();
  } finally {
    restoreVideoProvider();
  }
}

async function withYoutubeRecipeLlmExtractor<T>(
  provider: YoutubeRecipeLlmExtractor,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreLlmExtractor = youtubeImport.setYoutubeRecipeLlmExtractorForTest(provider);

  try {
    return await callback();
  } finally {
    restoreLlmExtractor();
  }
}

async function withYoutubeVisualQuantityExtractor<T>(
  provider: YoutubeVisualQuantityExtractor,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreVisualQuantityExtractor = youtubeImport.setYoutubeVisualQuantityExtractorForTest(provider);

  try {
    return await callback();
  } finally {
    restoreVisualQuantityExtractor();
  }
}

async function withYoutubeVisualRecipeExtractor<T>(
  provider: YoutubeVisualRecipeExtractor,
  callback: () => Promise<T>,
) {
  const youtubeImport = await import("@/lib/server/youtube-import");
  const restoreVisualRecipeExtractor = youtubeImport.setYoutubeVisualRecipeExtractorForTest(provider);

  try {
    return await callback();
  } finally {
    restoreVisualRecipeExtractor();
  }
}

async function postYoutubeExtract(youtubeUrl: string) {
  const { POST } = await importExtractRoute();
  const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  }));

  return {
    body: await response.json(),
    response,
  };
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
      {
        importRoute: importCandidateDraftRoute,
        path: "candidate-drafts",
        body: { extraction_id: extractionId, candidate_id: "candidate-1" },
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
    const sectionLabelSchema = readFileSync(
      "supabase/migrations/20260528073500_28_youtube_section_label_persistence.sql",
      "utf8",
    );
    const multiRecipeSchema = readFileSync(
      "supabase/migrations/20260530090000_30_youtube_multi_recipe_candidates.sql",
      "utf8",
    );
    const transcriptCacheSchema = readFileSync(
      "supabase/migrations/20260530120000_youtube_transcript_cache_and_events.sql",
      "utf8",
    );
    const llmExtractionSchema = readFileSync(
      "supabase/migrations/20260601090000_youtube_llm_extraction_cache_and_events.sql",
      "utf8",
    );
    const visualExtractionSchema = readFileSync(
      "supabase/migrations/20260602103000_32_youtube_visual_extraction_cache_and_events.sql",
      "utf8",
    );

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
    expect(sectionLabelSchema).toContain("add column if not exists component_label text");
    expect(sectionLabelSchema).toContain("v_item ->> 'component_label'");
    expect(multiRecipeSchema).toContain("add column if not exists session_kind");
    expect(multiRecipeSchema).toContain("youtube_extraction_sessions_candidate_child_uidx");
    expect(multiRecipeSchema).toContain("create table if not exists public.youtube_extraction_candidates");
    expect(multiRecipeSchema).toContain("youtube_extraction_candidates_select_own");
    expect(multiRecipeSchema).toContain("CANDIDATE_PROMOTION_REQUIRED");
    expect(transcriptCacheSchema).toContain("create table if not exists public.youtube_transcript_cache");
    expect(transcriptCacheSchema).toContain("youtube_video_id, language, source_provider");
    expect(transcriptCacheSchema).toContain("create table if not exists public.youtube_transcript_fetch_events");
    expect(transcriptCacheSchema).toContain("estimated_cost_microusd");
    expect(transcriptCacheSchema).not.toContain("api_key");
    expect(transcriptCacheSchema).not.toContain("cookie_header");
    expect(llmExtractionSchema).toContain("create table if not exists public.youtube_llm_extraction_cache");
    expect(llmExtractionSchema).toContain("youtube_video_id, source_hash, schema_version, model");
    expect(llmExtractionSchema).toContain("create table if not exists public.youtube_llm_extraction_events");
    expect(llmExtractionSchema).toContain("input_tokens");
    expect(llmExtractionSchema).toContain("output_tokens");
    expect(llmExtractionSchema).not.toContain("api_key");
    expect(llmExtractionSchema).not.toContain("cookie_header");
    expect(visualExtractionSchema).toContain("create table if not exists public.youtube_visual_extraction_cache");
    expect(visualExtractionSchema).toContain("youtube_video_id, provider, schema_version, visual_request_hash");
    expect(visualExtractionSchema).toContain("create table if not exists public.youtube_visual_extraction_events");
    expect(visualExtractionSchema).toContain("event_type");
    expect(visualExtractionSchema).toContain("alter table public.youtube_visual_extraction_cache enable row level security");
    expect(visualExtractionSchema).toContain("alter table public.youtube_visual_extraction_events enable row level security");
    expect(visualExtractionSchema).not.toContain("api_key");
    expect(visualExtractionSchema).not.toContain("cookie_header");
    expect(visualExtractionSchema).not.toContain("raw_frame");
    expect(visualExtractionSchema).not.toContain("raw_provider_response");
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

  it("does not keep Recipio result fixture shortcuts in the extraction path", () => {
    const extractionSource = [
      "lib/server/youtube-import.ts",
      "lib/server/youtube-multi-recipe-extractor.ts",
      "lib/server/youtube-caption-normalizer.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(existsSync("lib/server/recipio-youtube-parity-fixtures.ts")).toBe(false);
    expect(extractionSource).not.toContain("recipio-youtube-parity-fixtures");
    expect(extractionSource).not.toContain("recipio_live_parity_fixture");
    expect(extractionSource).not.toContain("getRecipioYoutubeParityFixture");
    expect(extractionSource).not.toContain('startsWith("needsreview")');
    expect(extractionSource).not.toContain("saltNeedsReview");
    expect(extractionSource).not.toContain("forceNeedsReview");
    expect(extractionSource).not.toMatch(
      /mQUg_liCC34|KBPJt2mkOh4|OyXZEi9kMGU|g9uOBA3j02M|OEassmynRro|alkaimTlnPg|O9ScSqgm64c|a9jVn17Yxu8|YGcpbm73wTc|wKcW7x_ZxeY|DQAN8Si_3Z4|suwUaEEpopU|l5iUteLjrVg|nzV3i7fhD7w|Egpjve8caK0|40UQZlbYw0g|J5Rmux3ttaY/u,
    );
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
        message: "유효한 유튜브 URL을 입력해 주세요.",
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

  it("POST /api/v1/recipes/youtube/validate falls back to YouTube Data API when oEmbed preview fails", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "Data API fallback title",
              channelTitle: "Data API channel",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg" },
              },
              description: "fallback description",
              tags: ["레시피"],
              categoryId: "26",
            },
            contentDetails: { duration: "PT3M", caption: "false" },
          },
        ],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importValidateRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: "https://www.youtube.com/watch?v=fallback123" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        video_info: {
          video_id: "fallback123",
          title: "Data API fallback title",
          channel: "Data API channel",
        },
      },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://www.youtube.com/oembed?"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://www.googleapis.com/youtube/v3/videos?"));
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

  it("POST /api/v1/recipes/youtube/extract does not bypass YouTube provider for known live sample IDs", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "일반 설명란 기반 김치찌개",
              channelTitle: "집밥 채널",
              description: [
                "김치찌개 레시피",
                "재료",
                "김치 200g",
                "소금 약간",
                "만드는 법",
                "김치를 한입 크기로 썬다.",
              ].join("\n"),
              tags: ["레시피", "요리"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/OyXZEi9kMGU/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT1M49S",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { body, response } = await postYoutubeExtract("https://youtu.be/OyXZEi9kMGU");

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("일반 설명란 기반 김치찌개");
    expect(body.data.ingredients.map((ingredient: { standard_name: string }) =>
      ingredient.standard_name,
    )).toEqual(["김치", "소금"]);
    expect(body.data.steps.map((step: { instruction: string }) => step.instruction)).toEqual([
      "김치를 한입 크기로 썬다.",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://www.googleapis.com/youtube/v3/videos?"));
    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      youtube_url: "https://www.youtube.com/watch?v=OyXZEi9kMGU",
      youtube_video_id: "OyXZEi9kMGU",
      source_providers: ["youtube_videos_list", "description_parser"],
    }));
    expect(insertedSession.extraction_meta_json).not.toHaveProperty("recipio_parity_kind");
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
        ...buildCookingTaxonomyMethodLookupRows(),
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
          code: "slice",
          label: "썰기",
        },
      },
      {
        step_number: 2,
        instruction: "그리고 소금에 버무려 10분간 절여준다",
        cooking_method: {
          code: "pickle",
          label: "절이기",
        },
      },
    ]);
    expect(body.data.steps.map((step: { cooking_method: { code: string } }) =>
      step.cooking_method.code,
    )).toEqual(["slice", "pickle", "slice", "toss", "grill"]);
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
        { id: "ing-rice", standard_name: "밥" },
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
          {
            standard_name: "밥",
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
      "밥",
    ]);
    expect(ingredientSynonymsTable.__query.in).toHaveBeenCalledWith("synonym", [
      "달걀",
      "양파",
      "대파",
      "진간장",
      "후추",
      "밥",
    ]);
  });

  it("POST /api/v1/recipes/youtube/extract maps step text to taxonomy v2 cooking methods", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        items: [
          {
            snippet: {
              title: "새 조리법 테스트 레시피",
              channelTitle: "집밥 채널",
              description: cookingTaxonomyDescription,
              tags: ["레시피", "조리법"],
              categoryId: "26",
              thumbnails: {
                high: { url: "https://i.ytimg.com/vi/taxonomy123/hqdefault.jpg" },
              },
            },
            contentDetails: {
              duration: "PT2M",
              caption: "false",
            },
          },
        ],
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ingredientsTable = createLookupTable({
      data: [
        { id: "ing-shrimp", standard_name: "새우" },
        { id: "ing-garlic", standard_name: "마늘" },
        { id: "ing-tofu", standard_name: "두부" },
        { id: "ing-egg", standard_name: "달걀" },
        { id: "ing-mackerel", standard_name: "고등어" },
        { id: "ing-potato", standard_name: "감자" },
        { id: "ing-noodle", standard_name: "면" },
        { id: "ing-noodle-display", standard_name: "면 1인분" },
        { id: "ing-vegetable", standard_name: "채소" },
        { id: "ing-vegetable-display", standard_name: "채소 100g" },
        { id: "ing-batter", standard_name: "반죽" },
        { id: "ing-batter-display", standard_name: "반죽 1개" },
        { id: "ing-pancake-mix", standard_name: "부침가루" },
        { id: "ing-sauce", standard_name: "소스" },
        { id: "ing-leftover-sauce", standard_name: "남은 소스" },
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
      lookupRows: buildCookingTaxonomyMethodLookupRows(),
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
      body: JSON.stringify({ youtube_url: cookingTaxonomyUrl }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "새 조리법 테스트 레시피",
        blocking_issues: [],
      },
      error: null,
    });
    expect(body.data.steps.map((step: { cooking_method: { code: string } }) =>
      step.cooking_method.code,
    )).toEqual([
      "thaw",
      "mince",
      "slice",
      "pan_fry",
      "air_fryer",
      "microwave",
      "reduce",
      "parboil",
      "steam",
      "oven_bake",
      "mix",
    ]);
    expect(body.data.steps.map((step: { cooking_method: { label: string } }) =>
      step.cooking_method.label,
    )).toEqual([
      "해동",
      "다지기",
      "썰기",
      "부치기",
      "에어프라이어",
      "전자레인지",
      "졸이기",
      "삶기",
      "찌기",
      "오븐굽기",
      "섞기",
    ]);
    expect(body.data.new_cooking_methods).toEqual([]);
    expect(cookingMethodsTable.insert).not.toHaveBeenCalled();
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
        tags: ["유튜브레시피", "디저트"],
        blocking_issues: [],
        draft_warnings: expect.arrayContaining([
          "원본 만들기 번호가 1, 2, 9, 10처럼 비연속이라 중간 항목 누락 가능성이 있어요.",
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
      "설탕",
      "레몬즙",
    ]);
    expect(body.data.ingredients.find((ingredient: { standard_name: string }) => ingredient.standard_name === "바닐라 페이스트"))
      .toMatchObject({
        amount: 1,
        unit: "t",
        component_label: "타르트 반죽",
        display_text: "바닐라 페이스트 1t",
        resolution_status: "resolved",
      });
    expect(body.data.ingredients.find((ingredient: { standard_name: string }) => ingredient.standard_name === "노른자"))
      .toMatchObject({
        amount: 1,
        unit: "개",
        component_label: "타르트 반죽",
        resolution_status: "resolved",
      });
    expect(body.data.ingredients.filter((ingredient: { standard_name: string }) => ingredient.standard_name === "설탕"))
      .toEqual([
        expect.objectContaining({
          amount: 35,
          unit: "g",
          component_label: "타르트 반죽",
          display_text: "설탕 35g",
        }),
        expect.objectContaining({
          amount: 30,
          unit: "g",
          component_label: "치즈 필링",
          display_text: "설탕 30g",
        }),
      ]);
    expect(body.data.steps.map((step: { instruction: string }) => step.instruction)).toEqual([
      "버터를 부드럽게 풀고 설탕을 섞어요.",
      "노른자와 바닐라 페이스트를 넣고 섞어요.",
      "크림치즈에 설탕을 넣고 풀어요.",
      "식힌 타르트지에 필링을 채워요.",
    ]);
    expect(body.data.steps.map((step: { component_label: string | null }) => step.component_label)).toEqual([
      "타르트 반죽",
      "타르트 반죽",
      "치즈 필링",
      "치즈 필링",
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
        draft_warnings: ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해 주세요."],
        blocking_issues: [],
      },
      error: null,
    });
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      classification_status: "uncertain",
      extraction_meta_json: expect.objectContaining({
        draft_warnings: ["영상이 레시피인지 확실하지 않아요. 추출 결과를 꼼꼼히 확인해 주세요."],
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

  it("POST /api/v1/recipes/youtube/extract uses transcript fallback only when a provider returns parseable steps", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "만드는 법",
          "1. 김치를 한입 크기로 썰어주세요.",
          "2. 냄비에 넣고 끓여주세요.",
        ].join("\n"),
        language: "ko",
        trackKind: "manual" as const,
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract(transcriptFallbackUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        blocking_issues: [],
        steps: [
          {
            step_number: 1,
            instruction: "김치를 한입 크기로 썰어주세요.",
            is_incomplete: false,
            missing_fields: [],
          },
          {
            step_number: 2,
            instruction: "냄비에 넣고 끓여주세요.",
            is_incomplete: false,
            missing_fields: [],
          },
        ],
      },
      error: null,
    });
    expect(transcriptProvider.fetchTranscript).toHaveBeenCalledWith({
      videoId: "transcript123",
      youtubeUrl: transcriptFallbackUrl,
      title: "김치찌개 자막 보충 레시피",
      channel: "집밥 채널",
      captionCapability: "available",
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description", "caption"]);
    expect(insertedSession.raw_source_text).toContain("김치 200g");
    expect(insertedSession.raw_source_text).toContain("김치를 한입 크기로 썰어주세요.");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "available",
      transcript_provider: {
        attempted: true,
        capability: "available",
        provider: "fixture-transcript",
        status: "used",
        language: "ko",
        track_kind: "manual",
        step_count: 2,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract can read public timedtext captions when fixture mode is explicitly off in tests", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("HOMECOOK_YOUTUBE_FIXTURE_PROVIDER", "0");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const watchHtml = [
      "<html><script>",
      "var ytInitialPlayerResponse = {\"captions\":{\"playerCaptionsTracklistRenderer\":{\"captionTracks\":[",
      "{\"baseUrl\":\"https://www.youtube.com/api/timedtext?v=captionpublic123&lang=ko\",\"languageCode\":\"ko\",\"name\":{\"simpleText\":\"한국어\"}}",
      "]}}};",
      "</script></html>",
    ].join("");
    const timedTextPayload = {
      events: [
        { segs: [{ utf8: "재료\n" }] },
        { segs: [{ utf8: "김치 200g\n" }] },
        { segs: [{ utf8: "소금 약간\n" }] },
        { segs: [{ utf8: "만드는 법\n" }] },
        { segs: [{ utf8: "1. 김치를 한입 크기로 썰어주세요.\n" }] },
        { segs: [{ utf8: "2. 냄비에 넣고 끓여주세요.\n" }] },
      ],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;

      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [
            {
              snippet: {
                title: "공개 자막 김치찌개",
                channelTitle: "집밥 채널",
                channelId: "caption-owner",
                description: "레시피는 영상 자막에 정리되어 있어요.",
                tags: ["레시피", "김치찌개"],
                categoryId: "26",
                thumbnails: {
                  high: { url: "https://i.ytimg.com/vi/captionpublic123/hqdefault.jpg" },
                },
              },
              contentDetails: {
                duration: "PT8M",
                caption: "false",
              },
            },
          ],
        }));
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url.includes("watch?v=captionpublic123")) {
        return new Response(watchHtml);
      }

      if (url.includes("/api/timedtext")) {
        return new Response(JSON.stringify(timedTextPayload));
      }

      throw new Error(`unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dbClient, sessionsTable, transcriptCacheTable, transcriptFetchEventsTable } =
      createTranscriptFallbackExtractDbClient({
        cookingMethodLookupRows: [
          {
            id: prepMethodId,
            code: "prep",
            label: "손질",
            color_key: "gray",
            is_system: true,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440216",
            code: "boil",
            label: "끓이기",
            color_key: "blue",
            is_system: true,
          },
        ],
      });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(publicCaptionUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["caption"],
        blocking_issues: [],
        ingredients: [
          { standard_name: "김치", amount: 200, unit: "g", resolution_status: "resolved" },
          { standard_name: "소금", amount: null, unit: null, resolution_status: "resolved" },
        ],
        steps: [
          { instruction: "김치를 한입 크기로 썰어주세요.", is_incomplete: false },
          { instruction: "냄비에 넣고 끓여주세요.", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("watch?v=captionpublic123"),
      expect.objectContaining({
        headers: expect.objectContaining({ "accept-language": "ko,en;q=0.8" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/timedtext"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "accept-language": "ko,en;q=0.8",
          referer: publicCaptionUrl,
          "user-agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("fmt=json3"),
      expect.anything(),
    );
    expect(transcriptCacheTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      youtube_video_id: "captionpublic123",
      language: "ko",
      source_provider: "youtube_public_timedtext",
      source_kind: "caption",
      transcript_text: expect.stringContaining("김치를 한입 크기로 썰어주세요."),
      expires_at: expect.any(String),
    }));
    expect(transcriptFetchEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "youtube_public_timedtext",
      cache_hit: false,
      status: "success",
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      source_providers: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["caption"]);
    expect(insertedSession.source_providers).toEqual([
      "youtube_videos_list",
      "description_parser",
      "public_caption_timedtext",
      "caption_parser",
    ]);
    expect(insertedSession.raw_source_text).toContain("--- caption transcript ---");
    expect(insertedSession.raw_source_text).toContain("김치 200g");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "unavailable",
      transcript_provider: {
        attempted: true,
        capability: "unavailable",
        provider: "youtube_public_timedtext",
        status: "used",
        language: "ko",
        track_kind: "manual",
        used_ingredient_count: 2,
        step_count: 2,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract can build a draft from auto-generated conversational captions", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("HOMECOOK_YOUTUBE_FIXTURE_PROVIDER", "0");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const watchHtml = [
      "<html><script>",
      "var ytInitialPlayerResponse = {\"captions\":{\"playerCaptionsTracklistRenderer\":{\"captionTracks\":[",
      [
        "{\"baseUrl\":\"https://www.youtube.com/api/timedtext?v=asrcaption123&lang=ko&kind=asr\",",
        "\"languageCode\":\"ko\",",
        "\"kind\":\"asr\",",
        "\"name\":{\"simpleText\":\"한국어(자동 생성)\"}}",
      ].join(""),
      "]}}};",
      "</script></html>",
    ].join("");
    const timedTextPayload = {
      events: [
        {
          tStartMs: 812000,
          segs: [{ utf8: "오늘은 김치 200g하고 소금 약간으로 김치찌개를 만들게요" }],
        },
        {
          tStartMs: 818000,
          segs: [{ utf8: "먼저 김치를 한입 크기로 썰어주세요" }],
        },
        {
          tStartMs: 824000,
          segs: [{ utf8: "냄비에 물 500ml를 넣고 끓입니다" }],
        },
        {
          tStartMs: 831000,
          segs: [{ utf8: "김치와 소금을 넣고 10분간 끓여주세요" }],
        },
      ],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;

      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [
            {
              snippet: {
                title: "자동 자막 김치찌개",
                channelTitle: "집밥 채널",
                channelId: "caption-owner",
                description: "오늘 레시피는 영상 자막으로 확인해주세요.",
                tags: ["레시피", "김치찌개"],
                categoryId: "26",
                thumbnails: {
                  high: { url: "https://i.ytimg.com/vi/asrcaption123/hqdefault.jpg" },
                },
              },
              contentDetails: {
                duration: "PT15M",
                caption: "true",
              },
            },
          ],
        }));
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url.includes("watch?v=asrcaption123")) {
        return new Response(watchHtml);
      }

      if (url.includes("/api/timedtext")) {
        return new Response(JSON.stringify(timedTextPayload));
      }

      throw new Error(`unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract("https://www.youtube.com/watch?v=asrcaption123");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["caption"],
        blocking_issues: [],
        ingredients: [
          { standard_name: "김치", amount: 200, unit: "g", resolution_status: "resolved" },
          { standard_name: "소금", amount: null, unit: null, resolution_status: "resolved" },
          { standard_name: "물", amount: 500, unit: "ml", resolution_status: "resolved" },
        ],
        steps: [
          { instruction: "먼저 김치를 한입 크기로 썰어주세요", is_incomplete: false },
          { instruction: "냄비에 물 500ml를 넣고 끓입니다", is_incomplete: false },
          { instruction: "김치와 소금을 넣고 10분간 끓여주세요", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/timedtext"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "accept-language": "ko,en;q=0.8",
          referer: "https://www.youtube.com/watch?v=asrcaption123",
          "user-agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["caption"]);
    expect(insertedSession.raw_source_text).toContain("--- caption transcript ---");
    expect(insertedSession.raw_source_text).toContain("오늘은 김치 200g하고 소금 약간으로 김치찌개를 만들게요");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "available",
      transcript_provider: {
        attempted: true,
        capability: "available",
        provider: "youtube_public_timedtext",
        status: "used",
        language: "ko",
        track_kind: "auto",
        used_ingredient_count: 3,
        step_count: 3,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract returns multi-recipe candidates from caption transcript", async () => {
    mockAuth();

    const transcriptLines = [
      "첫 번째 요리 김치볶음밥",
      "재료",
      "김치 200g",
      "밥 1공기",
      "만드는 법",
      "1. 김치를 볶아요.",
      "2. 밥을 넣고 볶아요.",
      "두 번째 요리 계란국",
      "재료",
      "달걀 2개",
      "물 500ml",
      "만드는 법",
      "1. 물을 끓여요.",
      "2. 달걀을 풀어 넣어요.",
    ];
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: transcriptLines.join("\n"),
        transcriptSegments: transcriptLines.map((text, lineIndex) => ({
          source: "caption" as const,
          lineIndex,
          text,
          startMs: 60_000 + lineIndex * 5_000,
          durationMs: 4_000,
          language: "ko",
          trackKind: "auto",
        })),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const { dbClient, sessionsTable, candidatesTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: riceIngredientId, standard_name: "밥" },
        { id: eggIngredientId, standard_name: "달걀" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: mixMethodId,
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract("https://www.youtube.com/watch?v=transcriptmulti1"),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "김치찌개 자막 보충 레시피",
        extraction_methods: ["caption"],
        blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
        ingredients: [],
        steps: [],
        multi_recipe_status: "multiple",
        caption_source: "server_timedtext",
        recipe_candidates: [
          {
            candidate_id: "candidate-1",
            title: "김치볶음밥",
            ingredients: [
              { standard_name: "김치", resolution_status: "resolved" },
              { standard_name: "밥", resolution_status: "resolved" },
            ],
            steps: [
              { instruction: "김치를 볶아요.", is_incomplete: false },
              { instruction: "밥을 넣고 볶아요.", is_incomplete: false },
            ],
          },
          {
            candidate_id: "candidate-2",
            title: "계란국",
            ingredients: [
              { standard_name: "달걀", resolution_status: "resolved" },
              { standard_name: "물", resolution_status: "resolved" },
            ],
            steps: [
              { instruction: "물을 끓여요.", is_incomplete: false },
              { instruction: "달걀을 풀어 넣어요.", is_incomplete: false },
            ],
          },
        ],
        source_segments_summary: [
          {
            source: "caption",
            language: "ko",
            track_kind: "auto",
            segment_count: transcriptLines.length,
          },
        ],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      session_kind: string;
      source_providers: string[];
      draft_json: Record<string, unknown>;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.session_kind).toBe("multi_parent");
    expect(insertedSession.source_providers).toEqual([
      "youtube_videos_list",
      "public_caption_timedtext",
      "caption_parser",
      "multi_recipe_candidate_parser",
    ]);
    expect(insertedSession.draft_json).toMatchObject({
      multi_recipe_status: "multiple",
      primary_candidate_id: "candidate-1",
    });
    expect(insertedSession.extraction_meta_json).toMatchObject({
      description_parser_selection_outcome: "multi_recipe_candidates",
      candidate_count: 2,
    });
    expect(candidatesTable.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        extraction_session_id: body.data.extraction_id,
        candidate_id: "candidate-1",
        status: "draft",
        title: "김치볶음밥",
      }),
      expect.objectContaining({
        extraction_session_id: body.data.extraction_id,
        candidate_id: "candidate-2",
        status: "draft",
        title: "계란국",
      }),
    ]);
  });

  it("POST /api/v1/recipes/youtube/extract falls back to visual OCR when caption multi-recipe candidates are noisy", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const noisyTranscriptLines = [
      "첫 번째 요리 다시마 고추다대기",
      "재료",
      "기 빨리",
      "이거는 뭐 타게",
      "만드는 법",
      "1. 이거 뭐 투수로 나온 거 좀 넣구요",
      "2. 잠시 마문 좀 넣고요",
      "두 번째 요리 다대기",
      "재료",
      "모든 좋은 성분들이 나빠져",
      "역의 집에 있어가지고 녹",
      "만드는 법",
      "1. 모든 좋은 성분들이 나빠져 넣어",
      "2. 적당량 넣어줍니다 저는요 살 올리고당",
    ];
    const videoProvider: YoutubeVideoProvider = {
      name: "fixture-video",
      fetchVideo: vi.fn(async (videoId) => ({
        video: {
          videoId,
          title: "다시마 고추다대기",
          channel: "주부나라",
          channelId: `channel-${videoId}`,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          description: "",
          tags: ["recipe", "다시마", "고추다대기"],
          categoryId: "26",
          duration: "PT8M",
          captionFlag: "true",
        },
      })),
    };
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: noisyTranscriptLines.join("\n"),
        transcriptSegments: noisyTranscriptLines.map((text, lineIndex) => ({
          source: "caption" as const,
          lineIndex,
          text,
          startMs: lineIndex * 5_000,
          durationMs: 4_000,
          language: "ko",
          trackKind: "auto",
        })),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "다시마 고추다대기",
              confidence: 0.7,
              ingredients: [
                {
                  name: "다시마",
                  amount: null,
                  unit: null,
                  raw_text: "다시마가 일단 주인공이니까 다시마 같이 많아야 된다고 해요",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "다시마를 불려 준비해요.",
                  raw_text: "다시마를 물에 불려요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: ["자막 오인식이 많아 화면 확인이 필요해요."],
            },
          ],
        },
      })),
    };
    const visualRecipeExtractor: YoutubeVisualRecipeExtractor = {
      name: "visual_recipe_extractor",
      fetchVisualRecipe: vi.fn(async (
        context: Parameters<YoutubeVisualRecipeExtractor["fetchVisualRecipe"]>[0],
      ) => {
        expect(context.sourceBlocks.some((block) => block.source === "caption")).toBe(true);

        return {
          status: "available" as const,
          providerName: "gemini",
          model: "gemini-3.1-flash-lite",
          inputTokens: 180,
          outputTokens: 90,
          resultJson: {
            visual_source_lines: [
              { line_index: 0, text: "화면 자막: 다시마, 멸치, 마늘, 청양고추", start_ms: 30_000, end_ms: 35_000 },
              { line_index: 1, text: "화면 자막: 간장, 고춧가루, 올리고당, 식용유", start_ms: 350_000, end_ms: 360_000 },
              { line_index: 2, text: "화면 자막: 다시마를 불리고 잘게 다진다.", start_ms: 40_000, end_ms: 50_000 },
              { line_index: 3, text: "화면 자막: 멸치와 다시마를 볶다가 고추와 양념을 넣는다.", start_ms: 300_000, end_ms: 360_000 },
            ],
            recipes: [
              {
                title: "다시마 고추다대기",
                confidence: 0.88,
                ingredients: [
                  { name: "다시마", amount: null, unit: null, raw_text: "다시마", evidence_refs: [{ source: "visual", line_index: 0 }] },
                  { name: "멸치", amount: null, unit: null, raw_text: "멸치", evidence_refs: [{ source: "visual", line_index: 0 }] },
                  { name: "마늘", amount: null, unit: null, raw_text: "마늘", evidence_refs: [{ source: "visual", line_index: 0 }] },
                  { name: "청양고추", amount: null, unit: null, raw_text: "청양고추", evidence_refs: [{ source: "visual", line_index: 0 }] },
                  { name: "간장", amount: null, unit: null, raw_text: "간장", evidence_refs: [{ source: "visual", line_index: 1 }] },
                  { name: "고춧가루", amount: null, unit: null, raw_text: "고춧가루", evidence_refs: [{ source: "visual", line_index: 1 }] },
                  { name: "올리고당", amount: null, unit: null, raw_text: "올리고당", evidence_refs: [{ source: "visual", line_index: 1 }] },
                  { name: "식용유", amount: null, unit: null, raw_text: "식용유", evidence_refs: [{ source: "visual", line_index: 1 }] },
                ],
                steps: [
                  { instruction: "다시마를 불리고 잘게 다져요.", raw_text: "다시마를 불리고 잘게 다진다.", evidence_refs: [{ source: "visual", line_index: 2 }] },
                  { instruction: "멸치와 다시마를 볶다가 고추와 양념을 넣어 끓여요.", raw_text: "멸치와 다시마를 볶다가 고추와 양념을 넣는다.", evidence_refs: [{ source: "visual", line_index: 3 }] },
                ],
                warnings: [],
              },
            ],
          },
        };
      }),
    };
    const { dbClient, sessionsTable, candidatesTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440401", standard_name: "다시마" },
        { id: "550e8400-e29b-41d4-a716-446655440402", standard_name: "멸치" },
        { id: "550e8400-e29b-41d4-a716-446655440403", standard_name: "마늘" },
        { id: "550e8400-e29b-41d4-a716-446655440404", standard_name: "청양고추" },
        { id: "550e8400-e29b-41d4-a716-446655440405", standard_name: "간장" },
        { id: "550e8400-e29b-41d4-a716-446655440406", standard_name: "고춧가루" },
        { id: "550e8400-e29b-41d4-a716-446655440407", standard_name: "올리고당" },
        { id: "550e8400-e29b-41d4-a716-446655440408", standard_name: "식용유" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440219",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeVideoProvider(videoProvider, () =>
        withYoutubeRecipeLlmExtractor(llmExtractor, () =>
          withYoutubeVisualRecipeExtractor(visualRecipeExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(llmExtractor.fetchStructuredRecipe).toHaveBeenCalledTimes(1);
    expect(visualRecipeExtractor.fetchVisualRecipe).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      data: {
        title: "다시마 고추다대기",
        blocking_issues: [],
        ingredients: [
          expect.objectContaining({ standard_name: "다시마", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "멸치", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "마늘", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "청양고추", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "간장", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "고춧가루", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "올리고당", resolution_status: "resolved" }),
          expect.objectContaining({ standard_name: "식용유", resolution_status: "resolved" }),
        ],
        steps: [
          { instruction: "다시마를 불리고 잘게 다져요." },
          { instruction: "멸치와 다시마를 볶다가 고추와 양념을 넣어 끓여요." },
        ],
      },
      error: null,
    });
    expect(body.data.multi_recipe_status).toBeUndefined();
    expect(body.data.recipe_candidates).toBeUndefined();
    expect(candidatesTable.insert).not.toHaveBeenCalled();

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      session_kind: string;
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.session_kind).toBe("single");
    expect(insertedSession.source_providers).toContain("visual_recipe_extractor");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      description_parser_selection_outcome: "no_structured_recipe",
      visual_recipe_extractor: {
        attempted: true,
        status: "used",
        trigger_reason: "sparse_text_recipe",
        recipe_count: 1,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract returns multi-recipe candidates from conversational caption transcript", async () => {
    mockAuth();

    const transcriptLines = [
      "주방을 정리하고 남편도시락과 아침을 준비해요.",
      "쌀은 잠시 불려놓아요.",
      "당근, 양파, 부추.",
      "다진 새우, 전분, 소금, 후추, 채소, 물 조금.",
      "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
      "냉동 채소는 씻은 후 오일에 볶아요.",
      "굴소스 1T, 어간장 1T.",
      "소금, 후추.",
      "한번 씻은 김치를 썰어서 준비해요.",
      "어간장, 참기름, 통깨.",
      "아침에 먹기 좋은 순두부찌개 만들어요.",
      "꽃게액젓, 참치액만 넣어도 맛있어요.",
      "계란 넣고 바로 불을 끄면 부드러운 계란을 먹을 수 있어요.",
      "쪽파 넣고 부족한 간은 소금을 넣어요.",
      "속편한 배추말이전골 만들어요.",
      "배추는 3분만 쪄서 준비해요.",
      "목살, 부추, 당근.",
    ];
    const transcriptStartsMs = [
      45_000,
      68_000,
      108_000,
      129_000,
      156_000,
      238_000,
      250_000,
      272_000,
      348_000,
      368_000,
      485_000,
      499_000,
      509_000,
      518_000,
      880_000,
      890_000,
      926_000,
    ];
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: transcriptLines.join("\n"),
        transcriptSegments: transcriptLines.map((text, lineIndex) => ({
          source: "caption" as const,
          lineIndex,
          text,
          startMs: transcriptStartsMs[lineIndex],
          durationMs: 4_000,
          language: "ko",
          trackKind: "auto",
        })),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const { dbClient } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: carrotIngredientId, standard_name: "당근" },
        { id: onionIngredientId, standard_name: "양파" },
        { id: garlicChiveIngredientId, standard_name: "부추" },
        { id: shrimpIngredientId, standard_name: "새우" },
        { id: starchIngredientId, standard_name: "전분가루" },
        { id: saltIngredientId, standard_name: "소금" },
        { id: pepperIngredientId, standard_name: "후추" },
        { id: waterIngredientId, standard_name: "물" },
        { id: eggIngredientId, standard_name: "계란" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: mixMethodId,
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
        {
          id: grillMethodId,
          code: "grill",
          label: "굽기",
          color_key: "red",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440220",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440221",
          code: "steam",
          label: "찌기",
          color_key: "green",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440222",
          code: "mix",
          label: "섞기",
          color_key: "yellow",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract("https://www.youtube.com/watch?v=transcriptconvo1"),
    );

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      extraction_methods: ["caption"],
      multi_recipe_status: "multiple",
      blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
    });

    const candidates = body.data.recipe_candidates as Array<{
      title: string;
      ingredients: Array<{ display_text: string }>;
      steps: Array<{ instruction: string }>;
    }>;
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(candidates.map((candidate) => candidate.title)).toEqual(expect.arrayContaining([
      "미니 파프리카",
      "냉동 채소",
      "김치",
      "순두부찌개",
      "배추말이전골",
    ]));
    const miniPaprika = candidates.find((candidate) => candidate.title === "미니 파프리카");
    expect(miniPaprika?.ingredients.map((ingredient) => ingredient.display_text)).toEqual(
      expect.arrayContaining(["당근 약간", "양파 약간", "부추 약간", "새우 약간"]),
    );
    expect(miniPaprika?.steps.map((step) => step.instruction)).toContain(
      "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요",
    );
    const hotPot = candidates.find((candidate) => candidate.title === "배추말이전골");
    expect(hotPot?.ingredients.map((ingredient) => ingredient.display_text)).toEqual(
      expect.arrayContaining(["목살 약간", "부추 약간", "당근 약간"]),
    );
  });

  it("POST /api/v1/recipes/youtube/candidate-drafts promotes one multi-recipe candidate into a child draft", async () => {
    mockAuth();

    const parentCandidate = buildYoutubeRecipeCandidate();
    const parentSession = buildYoutubeSession({
      session_kind: "multi_parent",
      extraction_methods: ["caption"],
      raw_source_text: "첫 번째 요리 김치볶음밥",
      draft_json: {
        extraction_id: extractionId,
        title: "집밥 모음",
        base_servings: 1,
        extraction_methods: ["caption"],
        draft_warnings: ["영상 안에서 여러 요리 후보를 찾았어요. 저장할 요리를 먼저 선택해 주세요."],
        blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
        ingredients: [],
        steps: [],
        new_cooking_methods: [],
        multi_recipe_status: "multiple",
        primary_candidate_id: "candidate-1",
        caption_source: "server_timedtext",
        source_segments_summary: [
          {
            source: "caption",
            language: "ko",
            track_kind: "auto",
            segment_count: 4,
          },
        ],
        recipe_candidates: [parentCandidate],
      },
    });
    const sessionsTable = createYoutubeSessionsTable({
      selectResult: { data: parentSession, error: null },
    });
    const candidatesTable = createYoutubeExtractionCandidatesTable({
      selectResults: [{ data: buildExtractionCandidateRow(), error: null }],
    });
    const from = vi.fn((table: string) => {
      if (table === "youtube_extraction_sessions") return sessionsTable;
      if (table === "youtube_extraction_candidates") return candidatesTable;
      throw new Error(`unexpected table: ${table}`);
    });
    createServiceRoleClient.mockReturnValue({ from });

    const { POST } = await importCandidateDraftRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/candidate-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extraction_id: extractionId, candidate_id: "candidate-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: {
        parent_extraction_id: extractionId,
        candidate_id: "candidate-1",
        draft: {
          title: "김치볶음밥",
          extraction_methods: ["caption"],
          blocking_issues: [],
          ingredients: [
            { standard_name: "김치", ingredient_id: kimchiIngredientId },
          ],
          steps: [
            { instruction: "김치를 볶아요." },
          ],
          multi_recipe_status: "single",
          primary_candidate_id: "candidate-1",
          caption_source: "server_timedtext",
        },
      },
      error: null,
    });
    expect(body.data.draft.extraction_id).toEqual(expect.any(String));
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: body.data.draft.extraction_id,
      session_kind: "candidate_child",
      parent_extraction_session_id: extractionId,
      parent_candidate_id: "candidate-1",
      extraction_meta_json: expect.objectContaining({
        parent_extraction_session_id: extractionId,
        parent_candidate_id: "candidate-1",
        selected_candidate_start_ms: 10_000,
        selected_candidate_end_ms: 40_000,
        selected_candidate_evidence_refs: parentCandidate.evidence_refs,
        source_segments_summary: expect.arrayContaining([
          expect.objectContaining({
            source: "caption",
            segment_count: 4,
          }),
        ]),
      }),
      draft_json: expect.objectContaining({
        extraction_id: body.data.draft.extraction_id,
        title: "김치볶음밥",
        multi_recipe_status: "single",
      }),
    }));
    expect(candidatesTable.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "promoted",
      child_extraction_session_id: body.data.draft.extraction_id,
      promoted_at: expect.any(String),
    }));
    expect(candidatesTable.__updateQuery.eq).toHaveBeenCalledWith("extraction_session_id", extractionId);
    expect(candidatesTable.__updateQuery.eq).toHaveBeenCalledWith("candidate_id", "candidate-1");
  });

  it("POST /api/v1/recipes/youtube/candidate-drafts returns an existing child draft idempotently", async () => {
    mockAuth();

    const childDraft = {
      extraction_id: childExtractionId,
      title: "김치볶음밥",
      base_servings: 1,
      extraction_methods: ["caption"],
      draft_warnings: [],
      blocking_issues: [],
      ingredients: [],
      steps: [],
      new_cooking_methods: [],
      multi_recipe_status: "single",
      primary_candidate_id: "candidate-1",
    };
    const parentSession = buildYoutubeSession({
      session_kind: "multi_parent",
      draft_json: {
        extraction_id: extractionId,
        title: "집밥 모음",
        base_servings: 1,
        extraction_methods: ["caption"],
        draft_warnings: ["영상 안에서 여러 요리 후보를 찾았어요. 저장할 요리를 먼저 선택해 주세요."],
        blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
        ingredients: [],
        steps: [],
        new_cooking_methods: [],
        multi_recipe_status: "multiple",
        primary_candidate_id: "candidate-1",
        recipe_candidates: [buildYoutubeRecipeCandidate()],
      },
    });
    const childSession = buildYoutubeSession({
      id: childExtractionId,
      session_kind: "candidate_child",
      parent_extraction_session_id: extractionId,
      parent_candidate_id: "candidate-1",
      draft_json: childDraft,
      expires_at: parentSession.expires_at,
    });
    const sessionsTable = createYoutubeSessionsTable({
      selectResults: [
        { data: parentSession, error: null },
        { data: childSession, error: null },
      ],
    });
    const candidatesTable = createYoutubeExtractionCandidatesTable({
      selectResults: [
        {
          data: buildExtractionCandidateRow({
            status: "promoted",
            child_extraction_session_id: childExtractionId,
          }),
          error: null,
        },
      ],
    });
    const from = vi.fn((table: string) => {
      if (table === "youtube_extraction_sessions") return sessionsTable;
      if (table === "youtube_extraction_candidates") return candidatesTable;
      throw new Error(`unexpected table: ${table}`);
    });
    createServiceRoleClient.mockReturnValue({ from });

    const { POST } = await importCandidateDraftRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/candidate-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extraction_id: extractionId, candidate_id: "candidate-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        parent_extraction_id: extractionId,
        candidate_id: "candidate-1",
        draft: {
          extraction_id: childExtractionId,
          title: "김치볶음밥",
          multi_recipe_status: "single",
        },
      },
      error: null,
    });
    expect(sessionsTable.insert).not.toHaveBeenCalled();
    expect(candidatesTable.update).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/candidate-drafts rejects expired parent sessions", async () => {
    mockAuth();

    const sessionsTable = createYoutubeSessionsTable({
      selectResult: {
        data: buildYoutubeSession({
          session_kind: "multi_parent",
          expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        }),
        error: null,
      },
    });
    const candidatesTable = createYoutubeExtractionCandidatesTable({
      selectResults: [{ data: buildExtractionCandidateRow(), error: null }],
    });
    const from = vi.fn((table: string) => {
      if (table === "youtube_extraction_sessions") return sessionsTable;
      if (table === "youtube_extraction_candidates") return candidatesTable;
      throw new Error(`unexpected table: ${table}`);
    });
    createServiceRoleClient.mockReturnValue({ from });

    const { POST } = await importCandidateDraftRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/candidate-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extraction_id: extractionId, candidate_id: "candidate-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "EXTRACTION_EXPIRED", fields: [] },
    });
    expect(candidatesTable.select).not.toHaveBeenCalled();
    expect(sessionsTable.insert).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/extract returns blockers instead of invented data when public text has no recipe", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [
            {
              snippet: {
                title: "구조 없는 레시피 영상",
                channelTitle: "집밥 채널",
                channelId: "empty-owner",
                description: "레시피는 영상에서 확인해주세요. 자세한 제품 정보는 아래 링크를 참고해주세요.",
                tags: ["레시피", "요리"],
                categoryId: "26",
                thumbnails: {
                  high: { url: "https://i.ytimg.com/vi/emptytext123/hqdefault.jpg" },
                },
              },
              contentDetails: {
                duration: "PT8M",
                caption: "false",
              },
            },
          ],
        }));
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url.includes("watch?v=emptytext123")) {
        return new Response("<html><script>var ytInitialPlayerResponse = {\"captions\":{}};</script></html>");
      }

      throw new Error(`unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract("https://www.youtube.com/watch?v=emptytext123");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["ingredients", "steps"],
        ingredients: [],
        steps: [],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
      raw_source_text: string;
    };
    expect(insertedSession.raw_source_text).not.toContain("--- caption transcript ---");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        status: "no_author_comments",
      },
      transcript_provider: {
        attempted: true,
        provider: "external_transcript_api",
        status: "disabled",
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract fetches one author comment page and uses only author recipe text", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [
            {
              snippet: {
                title: "김치찌개 댓글 레시피",
                channelTitle: "집밥 채널",
                channelId: "owner-channel",
                description: "레시피는 작성자 댓글에 남겼어요.",
                tags: ["레시피", "김치찌개"],
                categoryId: "26",
                thumbnails: {
                  high: { url: "https://i.ytimg.com/vi/authorfetch123/hqdefault.jpg" },
                },
              },
              contentDetails: {
                duration: "PT8M",
                caption: "false",
              },
            },
          ],
        }));
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({
          items: [
            {
              snippet: {
                topLevelComment: {
                  snippet: {
                    textOriginal: [
                      "만드는 법",
                      "1. 약한 작성자 댓글은 김치를 썰어주세요.",
                    ].join("\n"),
                    authorChannelId: { value: "owner-channel" },
                  },
                },
              },
            },
            {
              snippet: {
                topLevelComment: {
                  snippet: {
                    textOriginal: [
                      "재료",
                      "김치 200g",
                      "소금 약간",
                      "만드는 법",
                      "1. 김치를 한입 크기로 썰어주세요.",
                      "2. 냄비에 넣고 끓여주세요.",
                    ].join("\n"),
                    authorChannelId: { value: "owner-channel" },
                  },
                },
              },
            },
            {
              snippet: {
                topLevelComment: {
                  snippet: {
                    textOriginal: "재료\n김치 500g\n만드는 법\n1. 일반 댓글 레시피입니다.",
                    authorChannelId: { value: "viewer-channel" },
                  },
                },
                replies: {
                  comments: [
                    {
                      snippet: {
                        textOriginal: "재료\n소고기 1kg\n만드는 법\n1. 작성자 reply 레시피는 무시됩니다.",
                        authorChannelId: { value: "owner-channel" },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }));
      }

      throw new Error(`unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(authorCommentFetchUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["comment"],
        blocking_issues: [],
        ingredients: [
          { standard_name: "김치", resolution_status: "resolved" },
          { standard_name: "소금", resolution_status: "resolved" },
        ],
        steps: [
          {
            instruction: "김치를 한입 크기로 썰어주세요.",
            is_incomplete: false,
            missing_fields: [],
          },
          {
            instruction: "냄비에 넣고 끓여주세요.",
            is_incomplete: false,
            missing_fields: [],
          },
        ],
      },
      error: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/commentThreads?"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("part=snippet"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("videoId=authorfetch123"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("textFormat=plainText"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("order=relevance"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("maxResults=100"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("key=test-key"));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("pageToken="));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["comment"]);
    expect(insertedSession.source_providers).toEqual([
      "youtube_videos_list",
      "description_parser",
      "youtube_comment_threads",
      "comment_filter",
      "comment_parser",
    ]);
    expect(insertedSession.raw_source_text).toContain("--- author comment ---");
    expect(insertedSession.raw_source_text).toContain("김치를 한입 크기로 썰어주세요.");
    expect(insertedSession.raw_source_text).not.toContain("약한 작성자 댓글");
    expect(insertedSession.raw_source_text).not.toContain("일반 댓글 레시피입니다.");
    expect(insertedSession.raw_source_text).not.toContain("작성자 reply 레시피");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        provider: "youtube_comment_threads",
        status: "used",
        used: true,
        fetched_comment_count: 3,
        author_comment_count: 2,
        recipe_signal_comment_count: 2,
        used_ingredient_count: 2,
        used_step_count: 2,
        request: {
          order: "relevance",
          max_results: 100,
          page_count: 1,
          quota_units_estimate: 1,
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract skips author comments when description is already ready", async () => {
    mockAuth();

    const provider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: "재료\n김치 500g\n만드는 법\n1. 댓글 레시피입니다.",
            authorChannelId: "channel-recipe12345",
          },
        ],
      })),
    };
    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await withYoutubeAuthorCommentProvider(provider, () =>
      postYoutubeExtract(recipeUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: [],
      },
      error: null,
    });
    expect(provider.fetchAuthorComments).not.toHaveBeenCalled();

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description"]);
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: false,
        status: "not_needed",
        used: false,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract fills missing steps from author comments before transcript fallback", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "소금 약간",
              "만드는 법",
              "1. 김치를 한입 크기로 썰어주세요.",
              "2. 냄비에 넣고 끓여주세요.",
            ].join("\n"),
            authorChannelId: "channel-transcript123",
          },
        ],
      })),
    };
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        transcriptText: "만드는 법\n1. 자막 fallback을 쓰면 안 됩니다.",
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      withYoutubeTranscriptProvider(transcriptProvider, () =>
        postYoutubeExtract(transcriptFallbackUrl),
      ),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "comment"],
        blocking_issues: [],
        ingredients: [
          { standard_name: "김치", amount: 200, unit: "g" },
          { standard_name: "소금", amount: null, unit: null },
        ],
        steps: [
          { instruction: "김치를 한입 크기로 썰어주세요.", is_incomplete: false },
          { instruction: "냄비에 넣고 끓여주세요.", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(authorProvider.fetchAuthorComments).toHaveBeenCalledWith({
      videoId: "transcript123",
      youtubeUrl: transcriptFallbackUrl,
      title: "김치찌개 자막 보충 레시피",
      channel: "집밥 채널",
      channelId: "channel-transcript123",
    });
    expect(transcriptProvider.fetchTranscript).not.toHaveBeenCalled();

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description", "comment"]);
    expect(insertedSession.raw_source_text).toContain("--- author comment ---");
    expect(insertedSession.raw_source_text).not.toContain("caption transcript");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        status: "used",
        used: true,
        used_ingredient_count: 0,
        used_step_count: 2,
      },
      transcript_provider: {
        attempted: false,
        status: "not_needed",
      },
      partial_extraction: false,
    });
  });

  it("POST /api/v1/recipes/youtube/extract suppresses non-cooking author comment step notes without hardcoding sample text", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "소금 약간",
              "물 2컵",
              "만드는 법",
              "(1) 김치를 한입 크기로 썰어주세요.",
              "(2) 냄비에 물을 넣고 끓여주세요.",
              "3. 엑스트라버진 올리브오일은 오프라인 구매 추천",
              "4. 더 많은 제품 태그는 프로필 링크에서 확인하세요 ^^",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "comment"],
        blocking_issues: [],
        steps: [
          { instruction: "김치를 한입 크기로 썰어주세요.", is_incomplete: false },
          { instruction: "냄비에 물을 넣고 끓여주세요.", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(JSON.stringify(body.data.steps)).not.toContain("오프라인");
    expect(JSON.stringify(body.data.steps)).not.toContain("프로필 링크");
    expect(JSON.stringify(body.data.steps)).not.toContain("(1)");

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        parser_quality: {
          step_quality_flags: expect.arrayContaining([
            "non_cooking_product_note",
            "social_cta",
          ]),
          suppressed_step_count: 2,
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps casual but valid cooking steps when Gemini is unavailable", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "false");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440217",
          code: "mix",
          label: "섞기",
          color_key: "green",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "물 1컵",
              "만드는 법",
              "1. 그냥 약불에서 천천히 끓여주세요.",
              "2. 이거를 잘 섞어주세요.",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        steps: [
          { instruction: "그냥 약불에서 천천히 끓여주세요.", is_incomplete: false },
          { instruction: "이거를 잘 섞어주세요.", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(body.data.blocking_issues).not.toContain("steps");

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        parser_quality: {
          reasons: expect.not.arrayContaining(["conversational_step_fragments"]),
          step_quality_flags: expect.not.arrayContaining(["conversational_filler"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps valid cooking steps with laughter suffixes when Gemini is unavailable", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "false");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "물 2컵",
              "만드는 법",
              "1. 김치를 썰고 ㅎㅎ",
              "2. 냄비에 물을 넣으면 돼요 ㅋㅋ",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        steps: [
          { instruction: "김치를 썰고 ㅎㅎ", is_incomplete: false },
          { instruction: "냄비에 물을 넣으면 돼요 ㅋㅋ", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(body.data.blocking_issues).not.toContain("steps");

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        attempted: true,
        status: "disabled",
        reason: "gemini_disabled",
        parser_quality: {
          reasons: expect.arrayContaining(["conversational_step_fragments"]),
          step_quality_flags: expect.arrayContaining(["conversational_filler"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps valid cooking steps with family or product words when Gemini is unavailable", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "false");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440217",
          code: "stir_fry",
          label: "볶기",
          color_key: "red",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "물 2컵",
              "만드는 법",
              "1. 받은 제품으로 김치를 볶아요.",
              "2. 아이도 먹기 좋게 물을 넣고 끓여요.",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        steps: [
          { instruction: "받은 제품으로 김치를 볶아요.", is_incomplete: false },
          { instruction: "아이도 먹기 좋게 물을 넣고 끓여요.", is_incomplete: false },
        ],
      },
      error: null,
    });
    expect(body.data.blocking_issues).not.toContain("steps");

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        attempted: true,
        status: "disabled",
        parser_quality: {
          reasons: expect.arrayContaining(["conversational_step_fragments"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps short garnish steps instead of treating them as fragments", async () => {
    mockAuth();

    const { dbClient } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "소금 약간",
              "만드는 법",
              "1. 김치를 한입 크기로 썰어주세요.",
              "2. 통깨 솔솔",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body.data.steps.map((step: { instruction: string }) => step.instruction)).toEqual([
      "김치를 한입 크기로 썰어주세요.",
      "통깨 솔솔",
    ]);
    expect(body.data.blocking_issues).toEqual([]);
  });

  it("POST /api/v1/recipes/youtube/extract triggers Gemini for non-empty but low-quality comment steps", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: kimchiIngredientId, standard_name: "김치" },
        { id: saltIngredientId, standard_name: "소금" },
        { id: waterIngredientId, standard_name: "물" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440216",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: [
              "재료",
              "김치 500g",
              "소금 약간",
              "물 2컵",
              "만드는 법",
              "1. 김치를 썰고 ㅎㅎ",
              "2. 냄비에 넣으면 돼요 ㅋㅋ",
              "3. 제품 태그는 프로필 링크 확인",
            ].join("\n"),
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        inputTokens: 120,
        outputTokens: 70,
        resultJson: {
          recipes: [
            {
              title: "김치찌개",
              confidence: 0.86,
              ingredients: [
                {
                  name: "김치",
                  amount: "500",
                  unit: "g",
                  raw_text: "김치 500g",
                  evidence_refs: [{ source: "comment", line_index: 1 }],
                },
                {
                  name: "소금",
                  amount: null,
                  unit: null,
                  raw_text: "소금 약간",
                  evidence_refs: [{ source: "comment", line_index: 2 }],
                },
                {
                  name: "물",
                  amount: "2",
                  unit: "컵",
                  raw_text: "물 2컵",
                  evidence_refs: [{ source: "comment", line_index: 3 }],
                },
              ],
              steps: [
                {
                  instruction: "김치를 한입 크기로 썰어요.",
                  raw_text: "김치를 썰고 ㅎㅎ",
                  evidence_refs: [{ source: "comment", line_index: 5 }],
                },
                {
                  instruction: "냄비에 물과 김치를 넣고 끓여요.",
                  raw_text: "냄비에 넣으면 돼요 ㅋㅋ",
                  evidence_refs: [{ source: "comment", line_index: 6 }],
                },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () => postYoutubeExtract(incompleteUrl)),
    );

    expect(response.status).toBe(200);
    expect(llmExtractor.fetchStructuredRecipe).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "comment"],
        steps: [
          { instruction: "김치를 한입 크기로 썰어요." },
          { instruction: "냄비에 물과 김치를 넣고 끓여요." },
        ],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
      source_providers: string[];
    };
    expect(insertedSession.source_providers).toContain("gemini_structured_extractor");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        status: "used",
        parser_quality: {
          low_quality: true,
          reasons: expect.arrayContaining(["conversational_step_fragments"]),
          step_quality_flags: expect.arrayContaining(["conversational_filler"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps partial drafts when author comments are promotional", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: "구독과 좋아요 부탁드려요. 제품 정보는 인스타 링크를 확인해주세요.",
            authorChannelId: "channel-incomplete123",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        status: "no_recipe_signal",
        used: false,
        author_comment_count: 1,
        recipe_signal_comment_count: 0,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract ignores non-author comments even when they contain steps", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-comments",
        comments: [
          {
            text: "만드는 법\n1. 김치를 한입 크기로 썰어주세요.",
            authorChannelId: "viewer-channel",
          },
        ],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.raw_source_text).not.toContain("--- author comment ---");
    expect(insertedSession.raw_source_text).not.toContain("김치를 한입 크기로 썰어주세요.");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        status: "no_author_comments",
        used: false,
        fetched_comment_count: 1,
        author_comment_count: 0,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract degrades to description-only when comments are disabled", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => ({
        status: "comments_disabled" as const,
        providerName: "fixture-comments",
        reason: "comments_disabled",
        comments: [],
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        provider: "fixture-comments",
        status: "comments_disabled",
        reason: "comments_disabled",
        used: false,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract degrades to description-only when author comments fail", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const authorProvider: YoutubeAuthorCommentProvider = {
      name: "fixture-comments",
      fetchAuthorComments: vi.fn(async () => {
        throw new Error("temporary comments outage");
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeAuthorCommentProvider(authorProvider, () =>
      postYoutubeExtract(incompleteUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description"]);
    expect(insertedSession.raw_source_text).not.toContain("--- author comment ---");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      author_comment_provider: {
        attempted: true,
        provider: "fixture-comments",
        status: "error",
        reason: "temporary comments outage",
        used: false,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract uses cached transcript before network transcript providers", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const cachedTranscript = [
      "만드는 법",
      "1. 김치를 잘게 썰어주세요.",
      "2. 냄비에 넣고 한 번 끓여주세요.",
    ].join("\n");
    const { dbClient, sessionsTable, transcriptCacheTable, transcriptFetchEventsTable } =
      createTranscriptFallbackExtractDbClient({
        cookingMethodLookupRows: [
          {
            id: prepMethodId,
            code: "prep",
            label: "손질",
            color_key: "gray",
            is_system: true,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440216",
            code: "boil",
            label: "끓이기",
            color_key: "blue",
            is_system: true,
          },
        ],
        transcriptCacheRows: [{
          id: "550e8400-e29b-41d4-a716-446655442001",
          youtube_video_id: "transcript123",
          language: "ko",
          source_provider: "youtube_public_timedtext",
          source_kind: "caption",
          transcript_text: cachedTranscript,
          segments_json: [],
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        }],
      });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [{
            snippet: {
              title: "김치찌개 자막 보충 레시피",
              channelTitle: "집밥 채널",
              channelId: "channel-transcript123",
              description: "김치찌개 레시피\n재료\n김치 200g\n소금 약간",
              tags: ["recipe", "김치찌개", "레시피"],
              categoryId: "26",
            },
            contentDetails: {
              duration: "PT8M",
              caption: "true",
            },
          }],
        }), { status: 200 });
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        steps: [
          { instruction: "김치를 잘게 썰어주세요." },
          { instruction: "냄비에 넣고 한 번 끓여주세요." },
        ],
      },
      error: null,
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("timedtext"), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("api.apify.com"), expect.anything());
    expect(transcriptCacheTable.update).toHaveBeenCalledWith(expect.objectContaining({
      last_used_at: expect.any(String),
    }));
    expect(transcriptCacheTable.insert).not.toHaveBeenCalled();
    expect(transcriptFetchEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "transcript_cache",
      cache_hit: true,
      status: "success",
      reason: null,
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toEqual([
      "youtube_videos_list",
      "description_parser",
      "transcript_cache",
      "public_caption_timedtext",
      "caption_parser",
    ]);
    expect(insertedSession.extraction_meta_json).toMatchObject({
      transcript_provider: {
        provider: "youtube_public_timedtext",
        status: "used",
        cache_hit: true,
        source_provider: "youtube_public_timedtext",
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract retries timedtext once with cookie before paid fallback", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_COOKIE_HEADER", "VISITOR_INFO1_LIVE=secret-cookie");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_PROVIDER", "apify");
    vi.stubEnv("APIFY_TOKEN", "secret-apify-token");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID", "user~youtube-transcript");

    const { dbClient, transcriptCacheTable, transcriptFetchEventsTable } =
      createTranscriptFallbackExtractDbClient();
    const timedTextBaseUrl = "https://www.youtube.com/api/timedtext?v=transcript123&lang=ko";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const hasCookie = headers.get("cookie")?.includes("secret-cookie") ?? false;

      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [{
            snippet: {
              title: "김치찌개 자막 보충 레시피",
              channelTitle: "집밥 채널",
              channelId: "channel-transcript123",
              description: "김치찌개 레시피\n재료\n김치 200g\n소금 약간",
              tags: ["recipe", "김치찌개", "레시피"],
              categoryId: "26",
            },
            contentDetails: {
              duration: "PT8M",
              caption: "true",
            },
          }],
        }), { status: 200 });
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("/watch?")) {
        return new Response(`ytInitialPlayerResponse = ${JSON.stringify({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{
                baseUrl: timedTextBaseUrl,
                languageCode: "ko",
                kind: "asr",
              }],
            },
          },
        })};`, { status: 200 });
      }

      if (url.startsWith(timedTextBaseUrl) && !hasCookie) {
        return new Response("rate limited", { status: 429 });
      }

      if (url.startsWith(timedTextBaseUrl) && hasCookie) {
        return new Response(JSON.stringify({
          events: [
            { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "만드는 법\n" }] },
            { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "1. 김치를 썰어주세요.\n" }] },
          ],
        }), { status: 200 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("api.apify.com"),
      expect.anything(),
    );
    expect(transcriptCacheTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      source_provider: "youtube_timedtext_cookie_retry",
      transcript_text: expect.stringContaining("김치를 썰어주세요."),
    }));
    expect(transcriptFetchEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "youtube_timedtext_cookie_retry",
      cache_hit: false,
      status: "success",
    }));
  });

  it("POST /api/v1/recipes/youtube/extract uses Apify only after free transcript sources fail within limits", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_PROVIDER", "apify");
    vi.stubEnv("APIFY_TOKEN", "secret-apify-token");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID", "tubelens~youtube-video-scraper");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_DAILY_LIMIT", "50");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_USER_DAILY_LIMIT", "5");

    const { dbClient, sessionsTable, transcriptCacheTable, transcriptFetchEventsTable } =
      createTranscriptFallbackExtractDbClient();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;

      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [{
            snippet: {
              title: "김치찌개 자막 보충 레시피",
              channelTitle: "집밥 채널",
              channelId: "channel-transcript123",
              description: "김치찌개 레시피\n재료\n김치 200g\n소금 약간",
              tags: ["recipe", "김치찌개", "레시피"],
              categoryId: "26",
            },
            contentDetails: {
              duration: "PT8M",
              caption: "true",
            },
          }],
        }), { status: 200 });
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("/watch?")) {
        return new Response("ytInitialPlayerResponse = {};", { status: 200 });
      }

      if (url.includes("api.apify.com")) {
        return new Response(JSON.stringify([{
          transcript: {
            language: "Korean",
            languageCode: "ko",
            text: "만드는 법 1. 김치를 썰어주세요.",
            segments: [
              { text: "만드는 법", startMs: 0, durationMs: 1000 },
              { text: "1. 김치를 썰어주세요.", startMs: 1000, durationMs: 1000 },
            ],
          },
        }]), { status: 201 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        extraction_methods: ["description", "caption"],
        steps: [{ instruction: "김치를 썰어주세요." }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.apify.com/v2/acts/tubelens~youtube-video-scraper/run-sync-get-dataset-items"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(transcriptFallbackUrl),
      }),
    );
    const apifyCall = fetchMock.mock.calls.find(([url]) => String(url).includes("api.apify.com"));
    const apifyBody = JSON.parse(String((apifyCall?.[1] as RequestInit | undefined)?.body ?? "{}")) as {
      includeChannel?: boolean;
      includeComments?: boolean;
      includeTranscript?: boolean;
      maxCommentsPerVideo?: number;
      transcriptLanguage?: string;
    };
    expect(apifyBody).toMatchObject({
      includeChannel: false,
      includeComments: false,
      includeTranscript: true,
      maxCommentsPerVideo: 0,
      transcriptLanguage: "ko",
    });
    expect(transcriptCacheTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      language: "ko",
      source_provider: "external_transcript_api",
      transcript_text: expect.stringContaining("김치를 썰어주세요."),
    }));
    expect(transcriptFetchEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "external_transcript_api",
      cache_hit: false,
      status: "success",
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    const eventPayloads = transcriptFetchEventsTable.insert.mock.calls.map((call) => call[0]);
    expect(insertedSession.raw_source_text).not.toContain("secret-apify-token");
    expect(JSON.stringify(insertedSession.extraction_meta_json)).not.toContain("secret-apify-token");
    expect(JSON.stringify(eventPayloads)).not.toContain("secret-apify-token");
  });

  it("POST /api/v1/recipes/youtube/extract can use Apify in local dev before transcript event tables are migrated", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_PROVIDER", "apify");
    vi.stubEnv("APIFY_TOKEN", "secret-apify-token");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID", "tubelens~youtube-video-scraper");

    const { dbClient } = createTranscriptFallbackExtractDbClient({
      transcriptFetchEventSelectResult: {
        data: [],
        error: {
          code: "PGRST205",
          message: "Could not find the table 'public.youtube_transcript_fetch_events' in the schema cache",
        },
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [{
            snippet: {
              title: "김치찌개 자막 보충 레시피",
              channelTitle: "집밥 채널",
              channelId: "channel-transcript123",
              description: "김치찌개 레시피\n재료\n김치 200g\n소금 약간",
              tags: ["recipe", "김치찌개", "레시피"],
              categoryId: "26",
            },
            contentDetails: {
              duration: "PT8M",
              caption: "true",
            },
          }],
        }), { status: 200 });
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("/watch?")) {
        return new Response("ytInitialPlayerResponse = {};", { status: 200 });
      }

      if (url.includes("api.apify.com")) {
        return new Response(JSON.stringify([{
          transcript: {
            language: "Korean",
            languageCode: "ko",
            text: "만드는 법 1. 김치를 썰어주세요.",
            segments: [
              { text: "만드는 법", startMs: 0, durationMs: 1000 },
              { text: "1. 김치를 썰어주세요.", startMs: 1000, durationMs: 1000 },
            ],
          },
        }]), { status: 201 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        extraction_methods: ["description", "caption"],
        steps: [{ instruction: "김치를 썰어주세요." }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.apify.com"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("POST /api/v1/recipes/youtube/extract does not call paid transcript API when daily limits are exceeded", async () => {
    mockAuth();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_PROVIDER", "apify");
    vi.stubEnv("APIFY_TOKEN", "secret-apify-token");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID", "user~youtube-transcript");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_DAILY_LIMIT", "1");
    vi.stubEnv("YOUTUBE_TRANSCRIPT_PAID_USER_DAILY_LIMIT", "1");

    const { dbClient, transcriptFetchEventsTable } =
      createTranscriptFallbackExtractDbClient({
        transcriptFetchEventRows: [{
          id: "550e8400-e29b-41d4-a716-446655442101",
          user_id: userId,
          youtube_video_id: "other-video",
          provider: "external_transcript_api",
          cache_hit: false,
          status: "success",
          reason: null,
          estimated_cost_microusd: 0,
          created_at: new Date().toISOString(),
        }],
      });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/videos?")) {
        return new Response(JSON.stringify({
          items: [{
            snippet: {
              title: "김치찌개 자막 보충 레시피",
              channelTitle: "집밥 채널",
              channelId: "channel-transcript123",
              description: "김치찌개 레시피\n재료\n김치 200g\n소금 약간",
              tags: ["recipe", "김치찌개", "레시피"],
              categoryId: "26",
            },
            contentDetails: {
              duration: "PT8M",
              caption: "true",
            },
          }],
        }), { status: 200 });
      }

      if (url.includes("/commentThreads?")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("/watch?")) {
        return new Response("ytInitialPlayerResponse = {};", { status: 200 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("api.apify.com"),
      expect.anything(),
    );
    expect(transcriptFetchEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "external_transcript_api",
      cache_hit: false,
      status: "skipped",
      reason: "transcript_paid_limit_exceeded",
    }));
  });

  it("POST /api/v1/recipes/youtube/extract keeps description-only partial drafts when transcript provider is disabled", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();

    createServiceRoleClient.mockReturnValue(dbClient);

    const { response, body } = await postYoutubeExtract(transcriptFallbackUrl);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
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

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description"]);
    expect(insertedSession.raw_source_text).not.toContain("김치를 한입 크기로 썰어주세요.");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "available",
      transcript_provider: {
        attempted: true,
        capability: "available",
        provider: "noop",
        status: "disabled",
        reason: "no_provider_configured",
        step_count: 0,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract does not mark captions when provider text has no parseable steps", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "오늘은 김치찌개를 먹어봤어요.\n자세한 재료는 설명란을 봐주세요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract(transcriptFallbackUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description"]);
    expect(insertedSession.raw_source_text).not.toContain("오늘은 김치찌개를 먹어봤어요.");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "available",
      transcript_provider: {
        attempted: true,
        capability: "available",
        provider: "fixture-transcript",
        status: "no_steps",
        reason: "no_parseable_recipe",
        language: "ko",
        track_kind: "auto",
        step_count: 0,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract uses Gemini structured fallback after transcript parsing is still insufficient", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable, llmExtractionCacheTable, llmExtractionEventsTable } =
      createTranscriptFallbackExtractDbClient({
        ingredientLookupRows: [
          { id: "550e8400-e29b-41d4-a716-446655440050", standard_name: "미니 파프리카" },
          { id: "550e8400-e29b-41d4-a716-446655440051", standard_name: "굴소스" },
        ],
        cookingMethodLookupRows: [
          {
            id: prepMethodId,
            code: "prep",
            label: "손질",
            color_key: "gray",
            is_system: true,
          },
        ],
      });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
          "굴소스 1T와 어간장 1T로 채소볶음 맛을 내요.",
        ].join("\n"),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async (context) => {
        const sourceBlocks = context.sourceBlocks as Array<{ source: string; text: string }>;
        expect(sourceBlocks.some((block) =>
          block.source === "caption" && block.text.includes("속을 꽉 채워요"),
        )).toBe(true);

        return {
          status: "available" as const,
          providerName: "gemini",
          model: "gemini-3.1-flash-lite",
          fallbackModel: "gemini-2.5-flash-lite",
          inputTokens: 120,
          outputTokens: 90,
          resultJson: {
            recipes: [
              {
                title: "미니 파프리카 새우전",
                confidence: 0.86,
                ingredients: [
                  {
                    name: "미니 파프리카",
                    amount: null,
                    unit: null,
                    raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                    evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                  },
                ],
                steps: [
                  {
                    instruction: "미니 파프리카에 속을 꽉 채워요.",
                    raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                    evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                  },
                ],
                warnings: [],
              },
              {
                title: "채소볶음",
                confidence: 0.82,
                ingredients: [
                  {
                    name: "굴소스",
                    amount: "1",
                    unit: "T",
                    raw_text: "굴소스 1T와 어간장 1T로 채소볶음 맛을 내요.",
                    evidence_refs: [{ source: "caption", line_index: 1, start_ms: null, end_ms: null }],
                  },
                ],
                steps: [
                  {
                    instruction: "굴소스와 어간장으로 채소볶음 맛을 내요.",
                    raw_text: "굴소스 1T와 어간장 1T로 채소볶음 맛을 내요.",
                    evidence_refs: [{ source: "caption", line_index: 1, start_ms: null, end_ms: null }],
                  },
                ],
                warnings: [],
              },
            ],
            excluded_mentions: ["도시락"],
          },
        };
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        multi_recipe_status: "multiple",
        blocking_issues: ["MULTI_CANDIDATE_REVIEW_REQUIRED"],
        ingredients: [],
        steps: [],
        recipe_candidates: [
          {
            title: "미니 파프리카 새우전",
            steps: [{ instruction: "미니 파프리카에 속을 꽉 채워요." }],
          },
          {
            title: "채소볶음",
            ingredients: [{ standard_name: "굴소스", amount: 1, unit: "T" }],
          },
        ],
      },
      error: null,
    });
    expect(llmExtractor.fetchStructuredRecipe).toHaveBeenCalledTimes(1);
    expect(llmExtractionCacheTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      youtube_video_id: "transcript123",
      model: "gemini-3.1-flash-lite",
      source_kinds: ["description", "caption"],
      result_json: expect.objectContaining({ recipes: expect.any(Array) }),
    }));
    expect(llmExtractionEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      cache_hit: false,
      status: "success",
      input_tokens: 120,
      output_tokens: 90,
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("gemini_structured_extractor");
    expect(insertedSession.raw_source_text).toContain("--- caption transcript ---");
    expect(insertedSession.raw_source_text).toContain("속을 꽉 채워요");
    expect(insertedSession.raw_source_text).not.toContain("test-gemini-key");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        status: "used",
        cache_hit: false,
        recipe_count: 2,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract does not call Gemini for a complete structured description", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => {
        throw new Error("Gemini should not be called for complete structured descriptions");
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeRecipeLlmExtractor(llmExtractor, () =>
      postYoutubeExtract(recipeUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        ingredients: [{ standard_name: "김치" }, { standard_name: "소금" }],
        steps: [{ instruction: "김치를 한입 크기로 썬다." }],
      },
      error: null,
    });
    expect(llmExtractor.fetchStructuredRecipe).not.toHaveBeenCalled();

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        status: "not_needed",
        parser_quality: {
          low_quality: false,
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract calls Gemini when caption parsing yields conversational fragments", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440060", standard_name: "마늘" },
        { id: "550e8400-e29b-41d4-a716-446655440061", standard_name: "굴소스" },
        { id: "550e8400-e29b-41d4-a716-446655440062", standard_name: "참기름" },
      ],
      cookingMethodLookupRows: [
        {
          id: mixMethodId,
          code: "mix",
          label: "섞기",
          color_key: "green",
          is_system: true,
        },
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "만드는 법",
          "1. 뭐야? 그 굴 뭐야? 소스 조금 넣.",
          "2. 그래 가지고 마늘 좀 많이 넣고 수추",
          "3. 조금 넣고 아 양념에 물도 좀 섞어",
          "4. 그래야지 그거 좀 골고리 좀 섞이거든",
          "5. 이제 양파하고 대파하고 좀 썰어 놓고",
          "6. 이건 언제 넣어야 돼 한면 이거 뭐",
          "7. 올려서 참기름 둘러 먹으면 되고 남은",
        ].join("\n"),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        inputTokens: 150,
        outputTokens: 100,
        resultJson: {
          recipes: [
            {
              title: "마늘 굴소스 볶음",
              confidence: 0.78,
              ingredients: [
                {
                  name: "마늘",
                  amount: null,
                  unit: null,
                  raw_text: "그래 가지고 마늘 좀 많이 넣고 수추",
                  evidence_refs: [{ source: "caption", line_index: 2, start_ms: null, end_ms: null }],
                },
                {
                  name: "굴소스",
                  amount: null,
                  unit: null,
                  raw_text: "뭐야? 그 굴 뭐야? 소스 조금 넣.",
                  evidence_refs: [{ source: "caption", line_index: 1, start_ms: null, end_ms: null }],
                },
                {
                  name: "참기름",
                  amount: null,
                  unit: null,
                  raw_text: "올려서 참기름 둘러 먹으면 되고 남은",
                  evidence_refs: [{ source: "caption", line_index: 7, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "마늘과 굴소스를 넣고 양념에 물을 조금 섞어요.",
                  raw_text: "조금 넣고 아 양념에 물도 좀 섞어",
                  evidence_refs: [{ source: "caption", line_index: 3, start_ms: null, end_ms: null }],
                },
                {
                  instruction: "양파와 대파를 썰어 준비해요.",
                  raw_text: "이제 양파하고 대파하고 좀 썰어 놓고",
                  evidence_refs: [{ source: "caption", line_index: 5, start_ms: null, end_ms: null }],
                },
                {
                  instruction: "완성된 요리에 참기름을 둘러 마무리해요.",
                  raw_text: "올려서 참기름 둘러 먹으면 되고 남은",
                  evidence_refs: [{ source: "caption", line_index: 7, start_ms: null, end_ms: null }],
                },
              ],
              warnings: ["자동 자막 대화 파편을 제외했어요."],
            },
          ],
        },
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
    );

    expect(response.status).toBe(200);
    expect(llmExtractor.fetchStructuredRecipe).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        ingredients: [
          { standard_name: "마늘" },
          { standard_name: "굴소스" },
          { standard_name: "참기름" },
        ],
        steps: [
          { instruction: "마늘과 굴소스를 넣고 양념에 물을 조금 섞어요." },
          { instruction: "양파와 대파를 썰어 준비해요." },
          { instruction: "완성된 요리에 참기름을 둘러 마무리해요." },
        ],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("gemini_structured_extractor");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        status: "used",
        parser_quality: {
          low_quality: true,
          reasons: expect.arrayContaining(["conversational_step_fragments"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps formal LLM stir-fry and simmer steps", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440070", standard_name: "두부" },
        { id: "550e8400-e29b-41d4-a716-446655440071", standard_name: "간장" },
      ],
      cookingMethodLookupRows: [
        {
          id: grillMethodId,
          code: "grill",
          label: "굽기",
          color_key: "brown",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440219",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440220",
          code: "boil",
          label: "끓이기",
          color_key: "blue",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "1. 뭐야? 그 굴 뭐야? 소스 조금 넣.",
          "2. 이건 언제 넣어야 돼 한면 이거 뭐",
          "3. 두부를 뒤집고 기름을 추가하여 한쪽에서 볶습니다.",
          "4. 양념장을 두부 위에 뿌리고 졸입니다.",
        ].join("\n"),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "두부조림",
              confidence: 0.84,
              ingredients: [
                {
                  name: "두부",
                  amount: null,
                  unit: null,
                  raw_text: "두부를 뒤집고 기름을 추가하여 한쪽에서 볶습니다.",
                  evidence_refs: [{ source: "caption", line_index: 2, start_ms: null, end_ms: null }],
                },
                {
                  name: "간장",
                  amount: null,
                  unit: null,
                  raw_text: "양념장을 두부 위에 뿌리고 졸입니다.",
                  evidence_refs: [{ source: "caption", line_index: 3, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "두부를 뒤집고 기름을 추가하여 한쪽에서 볶습니다.",
                  raw_text: "두부를 뒤집고 기름을 추가하여 한쪽에서 볶습니다.",
                  evidence_refs: [{ source: "caption", line_index: 2, start_ms: null, end_ms: null }],
                },
                {
                  instruction: "양념장을 두부 위에 뿌리고 졸입니다.",
                  raw_text: "양념장을 두부 위에 뿌리고 졸입니다.",
                  evidence_refs: [{ source: "caption", line_index: 3, start_ms: null, end_ms: null }],
                },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        steps: [
          {
            instruction: "두부를 뒤집고 기름을 추가하여 한쪽에서 볶습니다.",
            cooking_method: { code: "stir_fry" },
          },
          {
            instruction: "양념장을 두부 위에 뿌리고 졸입니다.",
            cooking_method: { code: "boil" },
          },
        ],
      },
      error: null,
    });
  });

  it("POST /api/v1/recipes/youtube/extract enriches missing quantities with visual provider without changing extraction methods", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const {
      dbClient,
      sessionsTable,
      visualExtractionCacheTable,
      visualExtractionEventsTable,
    } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440052", standard_name: "미니 파프리카" },
        { id: "550e8400-e29b-41d4-a716-446655440053", standard_name: "부침가루" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "미니 파프리카 새우전",
              confidence: 0.9,
              ingredients: [
                {
                  name: "미니 파프리카",
                  amount: null,
                  unit: null,
                  raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "미니 파프리카에 속을 꽉 채워요.",
                  raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };
    const visualExtractor: YoutubeVisualQuantityExtractor = {
      name: "visual_quantity_extractor",
      fetchVisualQuantities: vi.fn(async (context) => {
        expect(context.youtubeUrl).toBe(transcriptFallbackUrl);
        expect(context.ingredients).toEqual([
          expect.objectContaining({
            standard_name: "미니 파프리카",
            amount: null,
            quantity_source: "unknown",
          }),
        ]);

        return {
          status: "available" as const,
          providerName: "gemini",
          model: "gemini-3.1-flash-lite",
          inputTokens: 64,
          outputTokens: 32,
          resultJson: {
            ingredient_quantities: [
              {
                draft_ingredient_id: context.ingredients[0]?.draft_ingredient_id,
                standard_name: "미니 파프리카",
                amount: 4,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "미니 파프리카 4개",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.84,
                quantity_raw_text: "미니 파프리카 4개",
                quantity_evidence_refs: [
                  {
                    source_method: "visual_explicit",
                    source_provider: "video_frame",
                    start_ms: 12_000,
                    end_ms: 13_000,
                    frame_ts_ms: 12_500,
                    snippet: "화면 자막: 미니 파프리카 4개",
                    locator_hash: "visual-locator-1",
                  },
                ],
              },
              {
                draft_ingredient_id: null,
                standard_name: "부침가루",
                amount: 2,
                unit: null,
                ingredient_type: "seasoning",
                display_text: "부침가루 2",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.78,
                quantity_raw_text: "부침가루 2",
                quantity_evidence_refs: [
                  {
                    source_method: "visual_explicit",
                    source_provider: "video_frame",
                    start_ms: 10_000,
                    end_ms: 11_000,
                    frame_ts_ms: 10_500,
                    snippet: "화면 자막: 부침가루 2",
                  },
                ],
              },
            ],
          },
        };
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () =>
        withYoutubeVisualQuantityExtractor(visualExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
      ),
    );

    expect(response.status).toBe(200);
    expect(visualExtractor.fetchVisualQuantities).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        ingredients: [
          {
            standard_name: "미니 파프리카",
            amount: 4,
            unit: "개",
            ingredient_type: "QUANT",
            quantity_source: "visual_explicit",
            quantity_confidence: 0.84,
            quantity_raw_text: "미니 파프리카 4개",
            quantity_review_required: true,
            quantity_user_confirmed: false,
          },
          {
            standard_name: "부침가루",
            amount: 2,
            unit: "스푼",
            ingredient_type: "QUANT",
            quantity_source: "visual_explicit",
            quantity_confidence: 0.78,
            quantity_raw_text: "부침가루 2",
            quantity_review_required: true,
            quantity_user_confirmed: false,
          },
        ],
      },
      error: null,
    });
    expect(body.data.ingredients[0].quantity_evidence_refs).toEqual([
      expect.objectContaining({
        source_method: "visual",
        source_provider: "video_frame",
        snippet: "화면 자막: 미니 파프리카 4개",
      }),
    ]);
    expect(body.data.ingredients[1].quantity_evidence_refs).toEqual([
      expect.objectContaining({
        source_method: "visual",
        source_provider: "video_frame",
        snippet: "화면 자막: 부침가루 2",
      }),
    ]);
    expect(visualExtractionCacheTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      youtube_video_id: "transcript123",
      provider: "gemini",
      schema_version: expect.any(String),
      result_json: expect.objectContaining({ ingredient_quantities: expect.any(Array) }),
    }));
    expect(visualExtractionEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      event_type: "success",
      status: "success",
      cache_hit: false,
      input_tokens: 64,
      output_tokens: 32,
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
      draft_json: { ingredients: Array<Record<string, unknown>> };
    };
    expect(insertedSession.extraction_methods).toEqual(["description", "caption"]);
    expect(insertedSession.source_providers).toContain("visual_quantity_extractor");
    expect(insertedSession.draft_json.ingredients[0]).toMatchObject({
      quantity_source: "visual_explicit",
      quantity_review_required: true,
    });
    expect(insertedSession.extraction_meta_json).toMatchObject({
      visual_quantity_extractor: {
        attempted: true,
        provider: "gemini",
        status: "used",
        cache_hit: false,
        enriched_count: 2,
        review_required_count: 2,
      },
      quantity_enrichment_summary: {
        provider: "gemini",
        cache_hit: false,
        trigger_reason: "quantity_gap",
        enriched_count: 2,
        review_required_count: 2,
        status: "used",
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract uses visual OCR recipe fallback when captions alone stay partial", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440052", standard_name: "미니 파프리카" },
        { id: shrimpIngredientId, standard_name: "새우살" },
        { id: "550e8400-e29b-41d4-a716-446655440053", standard_name: "부침가루" },
        { id: eggIngredientId, standard_name: "계란" },
        { id: garlicChiveIngredientId, standard_name: "쪽파" },
        { id: "550e8400-e29b-41d4-a716-446655440072", standard_name: "다진 마늘" },
        { id: "550e8400-e29b-41d4-a716-446655440073", standard_name: "굴소스" },
        { id: "550e8400-e29b-41d4-a716-446655440074", standard_name: "간장" },
        { id: "550e8400-e29b-41d4-a716-446655440075", standard_name: "알룰로스" },
        { id: "550e8400-e29b-41d4-a716-446655440076", standard_name: "참기름" },
        { id: "550e8400-e29b-41d4-a716-446655440077", standard_name: "통깨" },
        { id: "550e8400-e29b-41d4-a716-446655440078", standard_name: "식용유" },
        { id: pepperIngredientId, standard_name: "후추" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: mixMethodId,
          code: "mix",
          label: "섞기",
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
        {
          id: "550e8400-e29b-41d4-a716-446655440219",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "미니 파프리카 화면에 나와요.",
          "재료는 화면 글자를 보면 돼요.",
          "완성하면 도시락에 담아요.",
        ].join("\n"),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "미니 파프리카 새우전",
              confidence: 0.76,
              ingredients: [
                {
                  name: "미니 파프리카",
                  amount: null,
                  unit: null,
                  raw_text: "미니 파프리카에 속을 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
                {
                  name: "새우살",
                  amount: null,
                  unit: null,
                  raw_text: "미니 파프리카에 속을 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "미니 파프리카에 새우살 속을 채워요.",
                  raw_text: "미니 파프리카에 속을 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: ["자막만으로는 재료 수량이 부족해요."],
            },
          ],
        },
      })),
    };
    const visualRecipeExtractor: YoutubeVisualRecipeExtractor = {
      name: "visual_recipe_extractor",
      fetchVisualRecipe: vi.fn(async (
        context: Parameters<YoutubeVisualRecipeExtractor["fetchVisualRecipe"]>[0],
      ) => {
        expect(context.youtubeUrl).toBe(transcriptFallbackUrl);
        expect(context.sourceBlocks.some((block) => block.source === "caption")).toBe(true);

        return {
          status: "available" as const,
          providerName: "gemini",
          model: "gemini-3.1-flash-lite",
          inputTokens: 256,
          outputTokens: 128,
          resultJson: {
            visual_source_lines: [
              { line_index: 0, text: "화면 자막: 미니 파프리카 4개", start_ms: 1_000, end_ms: 2_000 },
              { line_index: 1, text: "화면 자막: 새우살 200g", start_ms: 2_000, end_ms: 3_000 },
              { line_index: 2, text: "화면 자막: 부침가루 2큰술, 계란 1개", start_ms: 3_000, end_ms: 4_000 },
              { line_index: 3, text: "화면 자막: 쪽파 2줄, 다진 마늘 1작은술, 굴소스 1큰술", start_ms: 4_000, end_ms: 5_000 },
              { line_index: 4, text: "화면 자막: 간장 1큰술, 알룰로스 1큰술, 참기름 1큰술", start_ms: 5_000, end_ms: 6_000 },
              { line_index: 5, text: "화면 자막: 통깨 1큰술, 식용유 2큰술, 후추 약간", start_ms: 6_000, end_ms: 7_000 },
              { line_index: 6, text: "화면 자막: 파프리카를 반으로 자르고 씨를 제거한다.", start_ms: 8_000, end_ms: 9_000 },
              { line_index: 7, text: "화면 자막: 새우살을 다진 뒤 쪽파, 마늘, 굴소스, 후추와 섞는다.", start_ms: 9_000, end_ms: 10_000 },
              { line_index: 8, text: "화면 자막: 파프리카 안쪽에 부침가루를 묻힌다.", start_ms: 10_000, end_ms: 11_000 },
              { line_index: 9, text: "화면 자막: 새우 반죽을 파프리카에 채운다.", start_ms: 11_000, end_ms: 12_000 },
              { line_index: 10, text: "화면 자막: 계란물을 묻혀 팬에 올린다.", start_ms: 12_000, end_ms: 13_000 },
              { line_index: 11, text: "화면 자막: 앞뒤로 노릇하게 부친다.", start_ms: 13_000, end_ms: 14_000 },
              { line_index: 12, text: "화면 자막: 간장, 알룰로스, 참기름, 통깨를 섞은 양념장을 곁들인다.", start_ms: 14_000, end_ms: 15_000 },
            ],
            recipes: [
              {
                title: "미니 파프리카 새우전",
                confidence: 0.91,
                ingredients: [
                  { name: "미니 파프리카", amount: "4", unit: "개", raw_text: "미니 파프리카 4개", evidence_refs: [{ source: "visual", line_index: 0 }] },
                  { name: "새우살", amount: "200", unit: "g", raw_text: "새우살 200g", evidence_refs: [{ source: "visual", line_index: 1 }] },
                  { name: "부침가루", amount: "2", unit: "큰술", raw_text: "부침가루 2큰술", evidence_refs: [{ source: "visual", line_index: 2 }] },
                  { name: "계란", amount: "1", unit: "개", raw_text: "계란 1개", evidence_refs: [{ source: "visual", line_index: 2 }] },
                  { name: "쪽파", amount: "2", unit: "줄", raw_text: "쪽파 2줄", evidence_refs: [{ source: "visual", line_index: 3 }] },
                  { name: "다진 마늘", amount: "1", unit: "작은술", raw_text: "다진 마늘 1작은술", evidence_refs: [{ source: "visual", line_index: 3 }] },
                  { name: "굴소스", amount: "1", unit: "큰술", raw_text: "굴소스 1큰술", evidence_refs: [{ source: "visual", line_index: 3 }] },
                  { name: "간장", amount: "1", unit: "큰술", raw_text: "간장 1큰술", evidence_refs: [{ source: "visual", line_index: 4 }] },
                  { name: "알룰로스", amount: "1", unit: "큰술", raw_text: "알룰로스 1큰술", evidence_refs: [{ source: "visual", line_index: 4 }] },
                  { name: "참기름", amount: "1", unit: "큰술", raw_text: "참기름 1큰술", evidence_refs: [{ source: "visual", line_index: 4 }] },
                  { name: "통깨", amount: "1", unit: "큰술", raw_text: "통깨 1큰술", evidence_refs: [{ source: "visual", line_index: 5 }] },
                  { name: "식용유", amount: "2", unit: "큰술", raw_text: "식용유 2큰술", evidence_refs: [{ source: "visual", line_index: 5 }] },
                  { name: "후추", amount: null, unit: null, raw_text: "후추 약간", evidence_refs: [{ source: "visual", line_index: 5 }] },
                ],
                steps: [
                  { instruction: "미니 파프리카를 반으로 자르고 씨를 제거해요.", raw_text: "파프리카를 반으로 자르고 씨를 제거한다.", evidence_refs: [{ source: "visual", line_index: 6 }] },
                  { instruction: "새우살을 다진 뒤 쪽파, 다진 마늘, 굴소스, 후추와 섞어요.", raw_text: "새우살을 다진 뒤 쪽파, 마늘, 굴소스, 후추와 섞는다.", evidence_refs: [{ source: "visual", line_index: 7 }] },
                  { instruction: "파프리카 안쪽에 부침가루를 묻혀요.", raw_text: "파프리카 안쪽에 부침가루를 묻힌다.", evidence_refs: [{ source: "visual", line_index: 8 }] },
                  { instruction: "새우 반죽을 파프리카에 채워요.", raw_text: "새우 반죽을 파프리카에 채운다.", evidence_refs: [{ source: "visual", line_index: 9 }] },
                  { instruction: "계란물을 묻혀 팬에 올려요.", raw_text: "계란물을 묻혀 팬에 올린다.", evidence_refs: [{ source: "visual", line_index: 10 }] },
                  { instruction: "앞뒤로 노릇하게 부쳐요.", raw_text: "앞뒤로 노릇하게 부친다.", evidence_refs: [{ source: "visual", line_index: 11 }] },
                  { instruction: "간장, 알룰로스, 참기름, 통깨를 섞은 양념장을 곁들여요.", raw_text: "간장, 알룰로스, 참기름, 통깨를 섞은 양념장을 곁들인다.", evidence_refs: [{ source: "visual", line_index: 12 }] },
                ],
                warnings: [],
              },
            ],
          },
        };
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () =>
        withYoutubeVisualRecipeExtractor(visualRecipeExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
      ),
    );

    expect(response.status).toBe(200);
    expect(llmExtractor.fetchStructuredRecipe).toHaveBeenCalledTimes(1);
    expect(visualRecipeExtractor.fetchVisualRecipe).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        ingredients: expect.arrayContaining([
          expect.objectContaining({
            standard_name: "미니 파프리카",
            amount: 4,
            unit: "개",
            quantity_source: "visual_explicit",
            quantity_review_required: true,
          }),
          expect.objectContaining({ standard_name: "새우살", amount: 200, unit: "g" }),
          expect.objectContaining({ standard_name: "부침가루", amount: 2, unit: "큰술" }),
        ]),
        steps: [
          { instruction: "미니 파프리카를 반으로 자르고 씨를 제거해요." },
          { instruction: "새우살을 다진 뒤 쪽파, 다진 마늘, 굴소스, 후추와 섞어요." },
          { instruction: "파프리카 안쪽에 부침가루를 묻혀요." },
          { instruction: "새우 반죽을 파프리카에 채워요." },
          { instruction: "계란물을 묻혀 팬에 올려요." },
          { instruction: "앞뒤로 노릇하게 부쳐요." },
          { instruction: "간장, 알룰로스, 참기름, 통깨를 섞은 양념장을 곁들여요." },
        ],
      },
      error: null,
    });
    expect(body.data.ingredients).toHaveLength(13);
    expect(body.data.ingredients[0].quantity_evidence_refs).toEqual([
      expect.objectContaining({
        source_method: "visual",
        source_provider: "visual_recipe_extractor",
        snippet: "미니 파프리카 4개",
      }),
    ]);

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      source_providers: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description", "caption"]);
    expect(insertedSession.source_providers).toContain("visual_recipe_extractor");
    expect(insertedSession.raw_source_text).toContain("--- visual recipe evidence ---");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      visual_recipe_extractor: {
        attempted: true,
        contract_aligned: true,
        provider: "gemini",
        status: "used",
        recipe_count: 1,
        visual_source_line_count: 13,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract enriches amountless visual OCR ingredients with visual quantity extraction", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_CONTRACT_ALIGNED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440301", standard_name: "애호박" },
        { id: "550e8400-e29b-41d4-a716-446655440302", standard_name: "가지" },
        { id: "550e8400-e29b-41d4-a716-446655440303", standard_name: "토마토" },
        { id: onionIngredientId, standard_name: "양파" },
        { id: "550e8400-e29b-41d4-a716-446655440304", standard_name: "토마토 소스" },
        { id: "550e8400-e29b-41d4-a716-446655440307", standard_name: "후추" },
        { id: "550e8400-e29b-41d4-a716-446655440310", standard_name: "소금" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440219",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "팬에 채소를 올리고 약불로 익혀요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "노오븐 라따뚜이",
              confidence: 0.72,
              ingredients: [
                {
                  name: "애호박",
                  amount: null,
                  unit: null,
                  raw_text: "팬에 채소를 올려요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "팬에 채소를 올려요.",
                  raw_text: "팬에 채소를 올려요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: ["자막만으로는 재료 수량이 부족해요."],
            },
          ],
        },
      })),
    };
    const visualRecipeExtractor: YoutubeVisualRecipeExtractor = {
      name: "visual_recipe_extractor",
      fetchVisualRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        inputTokens: 200,
        outputTokens: 100,
        resultJson: {
          visual_source_lines: [
            { line_index: 0, text: "화면 자막: 애호박", start_ms: 1_000, end_ms: 2_000 },
            { line_index: 1, text: "화면 자막: 가지", start_ms: 2_000, end_ms: 3_000 },
            { line_index: 2, text: "화면 자막: 토마토", start_ms: 3_000, end_ms: 4_000 },
            { line_index: 3, text: "화면 자막: 양파", start_ms: 4_000, end_ms: 5_000 },
            { line_index: 4, text: "화면 자막: 토마토 소스", start_ms: 5_000, end_ms: 6_000 },
            { line_index: 5, text: "화면 자막: 후추", start_ms: 6_000, end_ms: 7_000 },
            { line_index: 6, text: "화면 자막: 소금", start_ms: 7_000, end_ms: 8_000 },
            { line_index: 7, text: "화면 자막: 채소를 얇게 썬다.", start_ms: 8_000, end_ms: 9_000 },
            { line_index: 8, text: "화면 자막: 팬에 양파를 볶는다.", start_ms: 9_000, end_ms: 10_000 },
            { line_index: 9, text: "화면 자막: 토마토 소스를 넣고 간한다.", start_ms: 10_000, end_ms: 11_000 },
            { line_index: 10, text: "화면 자막: 채소를 나란히 올린다.", start_ms: 11_000, end_ms: 12_000 },
            { line_index: 11, text: "화면 자막: 약불에서 익힌다.", start_ms: 12_000, end_ms: 13_000 },
          ],
          recipes: [
            {
              title: "노오븐 라따뚜이",
              confidence: 0.9,
              ingredients: [
                { name: "애호박", amount: null, unit: null, raw_text: "애호박", evidence_refs: [{ source: "visual", line_index: 0 }] },
                { name: "가지", amount: null, unit: null, raw_text: "가지", evidence_refs: [{ source: "visual", line_index: 1 }] },
                { name: "토마토", amount: null, unit: null, raw_text: "토마토", evidence_refs: [{ source: "visual", line_index: 2 }] },
                { name: "양파", amount: null, unit: null, raw_text: "양파", evidence_refs: [{ source: "visual", line_index: 3 }] },
                { name: "토마토 소스", amount: null, unit: null, raw_text: "토마토 소스", evidence_refs: [{ source: "visual", line_index: 4 }] },
                { name: "후추", amount: null, unit: null, raw_text: "후추", evidence_refs: [{ source: "visual", line_index: 5 }] },
                { name: "소금", amount: null, unit: null, raw_text: "소금", evidence_refs: [{ source: "visual", line_index: 6 }] },
              ],
              steps: [
                { instruction: "채소를 얇게 썰어요.", raw_text: "채소를 얇게 썬다.", evidence_refs: [{ source: "visual", line_index: 7 }] },
                { instruction: "팬에 양파를 볶아요.", raw_text: "팬에 양파를 볶는다.", evidence_refs: [{ source: "visual", line_index: 8 }] },
                { instruction: "토마토 소스를 넣고 간해요.", raw_text: "토마토 소스를 넣고 간한다.", evidence_refs: [{ source: "visual", line_index: 9 }] },
                { instruction: "채소를 나란히 올려요.", raw_text: "채소를 나란히 올린다.", evidence_refs: [{ source: "visual", line_index: 10 }] },
                { instruction: "약불에서 익혀요.", raw_text: "약불에서 익힌다.", evidence_refs: [{ source: "visual", line_index: 11 }] },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };
    const visualQuantityExtractor: YoutubeVisualQuantityExtractor = {
      name: "visual_quantity_extractor",
      fetchVisualQuantities: vi.fn(async (context) => {
        expect(context.ingredients).toEqual([
          expect.objectContaining({ standard_name: "애호박", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "가지", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "토마토", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "양파", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "토마토 소스", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "후추", amount: null, quantity_source: "unknown" }),
          expect.objectContaining({ standard_name: "소금", amount: null, quantity_source: "unknown" }),
        ]);

        return {
          status: "available" as const,
          providerName: "gemini",
          model: "gemini-3.1-flash-lite",
          inputTokens: 80,
          outputTokens: 40,
          resultJson: {
            ingredient_quantities: [
              {
                draft_ingredient_id: context.ingredients[0]?.draft_ingredient_id,
                standard_name: "애호박",
                amount: 1,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "애호박 1개",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.86,
                quantity_raw_text: "애호박 1개",
                quantity_evidence_refs: [{ source_method: "visual", snippet: "애호박 1개" }],
              },
              {
                draft_ingredient_id: context.ingredients[1]?.draft_ingredient_id,
                standard_name: "가지",
                amount: 1,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "가지 1개",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.86,
                quantity_raw_text: "가지 1개",
                quantity_evidence_refs: [{ source_method: "visual", snippet: "가지 1개" }],
              },
              {
                draft_ingredient_id: context.ingredients[2]?.draft_ingredient_id,
                standard_name: "토마토",
                amount: 2,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "토마토 2개",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.86,
                quantity_raw_text: "토마토 2개",
                quantity_evidence_refs: [{ source_method: "visual", snippet: "토마토 2개" }],
              },
              {
                draft_ingredient_id: context.ingredients[3]?.draft_ingredient_id,
                standard_name: "양파",
                amount: null,
                unit: null,
                ingredient_type: "TO_TASTE",
                display_text: "양파",
                quantity_source: "visual_explicit",
                quantity_confidence: 0.75,
                quantity_raw_text: "양파",
                quantity_evidence_refs: [{ source_method: "visual", snippet: "양파" }],
              },
            ],
          },
        };
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () =>
        withYoutubeVisualRecipeExtractor(visualRecipeExtractor, () =>
          withYoutubeVisualQuantityExtractor(visualQuantityExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(visualRecipeExtractor.fetchVisualRecipe).toHaveBeenCalledTimes(1);
    expect(visualQuantityExtractor.fetchVisualQuantities).toHaveBeenCalledTimes(1);
    expect(body.data.ingredients).toEqual([
      expect.objectContaining({
        standard_name: "애호박",
        amount: 1,
        unit: "개",
        quantity_source: "visual_explicit",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "가지",
        amount: 1,
        unit: "개",
        quantity_source: "visual_explicit",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "토마토",
        amount: 2,
        unit: "개",
        quantity_source: "visual_explicit",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "양파",
        amount: 0.5,
        unit: "개",
        quantity_source: "recipe_inferred",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "토마토 소스",
        amount: 200,
        unit: "g",
        quantity_source: "recipe_inferred",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "후추",
        amount: 0.25,
        unit: "작은술",
        quantity_source: "recipe_inferred",
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "소금",
        amount: 0.25,
        unit: "작은술",
        quantity_source: "recipe_inferred",
        quantity_review_required: true,
      }),
    ]);

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("visual_recipe_extractor");
    expect(insertedSession.source_providers).toContain("visual_quantity_extractor");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      visual_quantity_extractor: {
        attempted: true,
        status: "used",
        trigger_reason: "quantity_gap",
        enriched_count: 7,
        review_required_count: 7,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract asks Gemini for review-only inferred quantities when explicit visual text is missing", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_MODEL", "gemini-3.1-flash-lite");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_CONTRACT_ALIGNED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      ingredientLookupRows: [
        { id: "550e8400-e29b-41d4-a716-446655440301", standard_name: "애호박" },
        { id: "550e8400-e29b-41d4-a716-446655440302", standard_name: "가지" },
        { id: "550e8400-e29b-41d4-a716-446655440303", standard_name: "토마토" },
        { id: onionIngredientId, standard_name: "양파" },
        { id: "550e8400-e29b-41d4-a716-446655440304", standard_name: "토마토 소스" },
      ],
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440219",
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
      ],
    });
    const videoProvider: YoutubeVideoProvider = {
      name: "fixture-video",
      fetchVideo: vi.fn(async (videoId) => ({
        video: {
          videoId,
          title: "노오븐 라따뚜이",
          channel: "맛있는이유",
          channelId: `channel-${videoId}`,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          description: "",
          tags: ["recipe", "라따뚜이", "레시피"],
          categoryId: "26",
          duration: "PT1M",
          captionFlag: "true",
        },
      })),
    };
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "팬에 채소를 올리고 약불로 익혀요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "노오븐 라따뚜이",
              confidence: 0.72,
              ingredients: [
                {
                  name: "애호박",
                  amount: null,
                  unit: null,
                  raw_text: "팬에 채소를 올려요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "팬에 채소를 올려요.",
                  raw_text: "팬에 채소를 올려요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: ["자막만으로는 재료 수량이 부족해요."],
            },
          ],
        },
      })),
    };
    const visualRecipeExtractor: YoutubeVisualRecipeExtractor = {
      name: "visual_recipe_extractor",
      fetchVisualRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        inputTokens: 200,
        outputTokens: 100,
        resultJson: {
          visual_source_lines: [
            { line_index: 0, text: "화면 자막: 애호박", start_ms: 1_000, end_ms: 2_000 },
            { line_index: 1, text: "화면 자막: 가지", start_ms: 2_000, end_ms: 3_000 },
            { line_index: 2, text: "화면 자막: 토마토", start_ms: 3_000, end_ms: 4_000 },
            { line_index: 3, text: "화면 자막: 양파", start_ms: 4_000, end_ms: 5_000 },
            { line_index: 4, text: "화면 자막: 토마토 소스", start_ms: 5_000, end_ms: 6_000 },
            { line_index: 5, text: "화면 자막: 채소를 얇게 썬다.", start_ms: 6_000, end_ms: 7_000 },
            { line_index: 6, text: "화면 자막: 팬에 양파를 볶는다.", start_ms: 7_000, end_ms: 8_000 },
            { line_index: 7, text: "화면 자막: 토마토 소스를 넣는다.", start_ms: 8_000, end_ms: 9_000 },
            { line_index: 8, text: "화면 자막: 채소를 나란히 올린다.", start_ms: 9_000, end_ms: 10_000 },
            { line_index: 9, text: "화면 자막: 약불에서 익힌다.", start_ms: 10_000, end_ms: 11_000 },
          ],
          recipes: [
            {
              title: "노오븐 라따뚜이",
              confidence: 0.9,
              ingredients: [
                { name: "애호박", amount: null, unit: null, raw_text: "애호박", evidence_refs: [{ source: "visual", line_index: 0 }] },
                { name: "가지", amount: null, unit: null, raw_text: "가지", evidence_refs: [{ source: "visual", line_index: 1 }] },
                { name: "토마토", amount: null, unit: null, raw_text: "토마토", evidence_refs: [{ source: "visual", line_index: 2 }] },
                { name: "양파", amount: null, unit: null, raw_text: "양파", evidence_refs: [{ source: "visual", line_index: 3 }] },
                { name: "토마토 소스", amount: null, unit: null, raw_text: "토마토 소스", evidence_refs: [{ source: "visual", line_index: 4 }] },
              ],
              steps: [
                { instruction: "채소를 얇게 썰어요.", raw_text: "채소를 얇게 썬다.", evidence_refs: [{ source: "visual", line_index: 5 }] },
                { instruction: "팬에 양파를 볶아요.", raw_text: "팬에 양파를 볶는다.", evidence_refs: [{ source: "visual", line_index: 6 }] },
                { instruction: "토마토 소스를 넣어요.", raw_text: "토마토 소스를 넣는다.", evidence_refs: [{ source: "visual", line_index: 7 }] },
                { instruction: "채소를 나란히 올려요.", raw_text: "채소를 나란히 올린다.", evidence_refs: [{ source: "visual", line_index: 8 }] },
                { instruction: "약불에서 익혀요.", raw_text: "약불에서 익힌다.", evidence_refs: [{ source: "visual", line_index: 9 }] },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };
    let visualQuantityPrompt = "";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      };
      visualQuantityPrompt = body.contents?.[0]?.parts?.find((part) => typeof part.text === "string")?.text ?? "";

      const makeInferred = (
        standard_name: string,
        amount: number,
        unit: string,
        frame_ts_ms: number,
        snippet: string,
        ingredient_type: "QUANT" | "TO_TASTE" = "QUANT",
      ) => ({
        draft_ingredient_id: null,
        standard_name,
        amount,
        unit,
        ingredient_type,
        display_text: `${standard_name} ${amount}${unit}`,
        quantity_source: "recipe_inferred",
        quantity_confidence: 0.48,
        quantity_raw_text: `${standard_name} 수량은 영상 흐름과 재료 역할 기준 추정`,
        quantity_evidence_refs: [
          {
            source_method: "visual",
            source_provider: "gemini_visual_quantity",
            frame_ts_ms,
            snippet,
          },
        ],
      });

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ingredient_quantities: [
                      makeInferred("애호박", 1, "개", 1_000, "화면에 애호박 한 개가 얇게 썰려 있음"),
                      makeInferred("가지", 1, "개", 2_000, "화면에 가지 한 개가 얇게 썰려 있음"),
                      makeInferred("토마토", 2, "개", 3_000, "화면에 토마토 두 개 분량의 둥근 슬라이스가 보임"),
                      makeInferred("양파", 0.5, "개", 4_000, "양파를 볶는 장면만 있어 라따뚜이 소스 베이스 기준으로 반 개 추정", "TO_TASTE"),
                      makeInferred("토마토 소스", 200, "g", 8_000, "토마토 소스를 팬 바닥에 펴는 장면 기준으로 얇은 베이스 분량 추정"),
                      makeInferred("오일", 1, "큰술", 6_000, "팬에 재료를 볶기 전 오일을 두르는 흐름 기준 추정"),
                      makeInferred("다진고기", 150, "g", 7_000, "양파와 함께 볶는 다진고기 베이스 분량 기준 추정"),
                      makeInferred("후추", 0.25, "작은술", 8_000, "간을 하는 장면 기준으로 소량 시즈닝 추정"),
                      makeInferred("치즈", 30, "g", 16_000, "마무리 토핑으로 흩뿌리는 장면 기준 추정"),
                      makeInferred("올리브 오일", 1, "큰술", 16_000, "완성 직전 마무리 오일을 두르는 흐름 기준 추정"),
                      makeInferred("소금", 0.25, "작은술", 8_000, "간을 하는 장면 기준으로 소량 시즈닝 추정"),
                    ],
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 42,
          candidatesTokenCount: 24,
        },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeVideoProvider(videoProvider, () =>
      withYoutubeTranscriptProvider(transcriptProvider, () =>
        withYoutubeRecipeLlmExtractor(llmExtractor, () =>
          withYoutubeVisualRecipeExtractor(visualRecipeExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(visualQuantityPrompt).toContain("Fill every remaining missing draft ingredient quantity with the best conservative estimate");
    expect(visualQuantityPrompt).toContain("Infer oil, sauce, cheese, meat, seasoning, and garnish quantities");
    expect(visualQuantityPrompt).toContain("recipe_inferred");
    expect(visualQuantityPrompt).toContain("confidence <= 0.65");
    expect(body.data.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        standard_name: "애호박",
        amount: 1,
        unit: "개",
        quantity_source: "recipe_inferred",
        quantity_confidence: 0.48,
        quantity_review_required: true,
      }),
      expect.objectContaining({
        standard_name: "가지",
        amount: 1,
        unit: "개",
        quantity_source: "recipe_inferred",
        quantity_review_required: true,
      }),
      expect.objectContaining({ standard_name: "토마토", amount: 2, unit: "개", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "양파", amount: 0.5, unit: "개", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "토마토 소스", amount: 200, unit: "g", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "오일", amount: 1, unit: "큰술", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "다진고기", amount: 150, unit: "g", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "후추", amount: 0.25, unit: "작은술", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "치즈", amount: 30, unit: "g", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "올리브 오일", amount: 1, unit: "큰술", quantity_source: "recipe_inferred" }),
      expect.objectContaining({ standard_name: "소금", amount: 0.25, unit: "작은술", quantity_source: "recipe_inferred" }),
    ]));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("visual_quantity_extractor");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      visual_quantity_extractor: {
        attempted: true,
        status: "used",
        enriched_count: 11,
        review_required_count: 11,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract reuses visual quantity cache before calling the provider", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable, visualExtractionCacheTable, visualExtractionEventsTable } =
      createTranscriptFallbackExtractDbClient({
        ingredientLookupRows: [
          { id: "550e8400-e29b-41d4-a716-446655440052", standard_name: "미니 파프리카" },
        ],
        cookingMethodLookupRows: [
          {
            id: prepMethodId,
            code: "prep",
            label: "손질",
            color_key: "gray",
            is_system: true,
          },
        ],
        visualCacheRows: [
          {
            id: "550e8400-e29b-41d4-a716-446655441801",
            youtube_video_id: "transcript123",
            provider: "gemini",
            schema_version: "2026-06-02-visual-quantity-v1",
            visual_request_hash: "cached-visual-hash",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            result_json: {
              ingredient_quantities: [
                {
                  standard_name: "미니 파프리카",
                  amount: 4,
                  unit: "개",
                  ingredient_type: "QUANT",
                  display_text: "미니 파프리카 4개",
                  quantity_source: "visual_explicit",
                  quantity_confidence: 0.84,
                  quantity_raw_text: "미니 파프리카 4개",
                  quantity_evidence_refs: [
                    {
                      source_method: "visual",
                      source_provider: "visual_quantity_extractor",
                      snippet: "미니 파프리카 4개",
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => ({
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: {
          recipes: [
            {
              title: "미니 파프리카 새우전",
              confidence: 0.9,
              ingredients: [
                {
                  name: "미니 파프리카",
                  amount: null,
                  unit: null,
                  raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              steps: [
                {
                  instruction: "미니 파프리카에 속을 꽉 채워요.",
                  raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                  evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                },
              ],
              warnings: [],
            },
          ],
        },
      })),
    };
    const visualExtractor: YoutubeVisualQuantityExtractor = {
      name: "visual_quantity_extractor",
      fetchVisualQuantities: vi.fn(async () => {
        throw new Error("visual provider should not be called on cache hit");
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () =>
        withYoutubeVisualQuantityExtractor(visualExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
      ),
    );

    expect(response.status).toBe(200);
    expect(body.data.ingredients[0]).toMatchObject({
      standard_name: "미니 파프리카",
      amount: 4,
      unit: "개",
      quantity_source: "visual_explicit",
    });
    expect(visualExtractor.fetchVisualQuantities).not.toHaveBeenCalled();
    expect(visualExtractionCacheTable.__updateQuery.eq).toHaveBeenCalledWith(
      "id",
      "550e8400-e29b-41d4-a716-446655441801",
    );
    expect(visualExtractionEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      event_type: "cache_hit",
      cache_hit: true,
      status: "success",
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("visual_quantity_extractor_cache");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      visual_quantity_extractor: {
        status: "cache_hit",
        cache_hit: true,
        enriched_count: 1,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract keeps review-needed draft when conversational caption is low quality and Gemini is disabled", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient({
      cookingMethodLookupRows: [
        {
          id: prepMethodId,
          code: "prep",
          label: "손질",
          color_key: "gray",
          is_system: true,
        },
        {
          id: mixMethodId,
          code: "mix",
          label: "섞기",
          color_key: "green",
          is_system: true,
        },
      ],
    });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: [
          "만드는 법",
          "1. 뭐야? 그 굴 뭐야? 소스 조금 넣.",
          "2. 그래 가지고 마늘 좀 많이 넣고 수추",
          "3. 이건 언제 넣어야 돼 한면 이거 뭐",
          "4. 올려서 참기름 둘러 먹으면 되고 남은",
        ].join("\n"),
        language: "ko",
        trackKind: "auto" as const,
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract(transcriptFallbackUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        blocking_issues: ["steps"],
        ingredients: [
          { standard_name: "김치", amount: 200, unit: "g" },
          { standard_name: "소금", amount: null, unit: null },
        ],
        steps: [],
      },
      error: null,
    });
    expect(JSON.stringify(body.data)).not.toContain("뭐야");
    expect(JSON.stringify(body.data)).not.toContain("마늘 좀 많이");

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      raw_source_text: string;
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).not.toContain("gemini_structured_extractor");
    expect(insertedSession.raw_source_text).toContain("--- caption transcript ---");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        attempted: true,
        status: "disabled",
        reason: "gemini_disabled",
        parser_quality: {
          low_quality: true,
          reasons: expect.arrayContaining(["conversational_step_fragments"]),
        },
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract reuses Gemini cache before calling the model", async () => {
    mockAuth();
    vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
    vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const { dbClient, sessionsTable, llmExtractionCacheTable, llmExtractionEventsTable } =
      createTranscriptFallbackExtractDbClient({
        ingredientLookupRows: [
          { id: "550e8400-e29b-41d4-a716-446655440052", standard_name: "미니 파프리카" },
        ],
        cookingMethodLookupRows: [
          {
            id: prepMethodId,
            code: "prep",
            label: "손질",
            color_key: "gray",
            is_system: true,
          },
        ],
        llmCacheRows: [
          {
            id: "550e8400-e29b-41d4-a716-446655441701",
            youtube_video_id: "transcript123",
            source_hash: "cached-source-hash",
            schema_version: "2026-06-01",
            model: "gemini-3.1-flash-lite",
            source_kinds: ["description", "caption"],
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            result_json: {
              recipes: [
                {
                  title: "미니 파프리카 새우전",
                  confidence: 0.9,
                  ingredients: [
                    {
                      name: "미니 파프리카",
                      amount: null,
                      unit: null,
                      raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                      evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                    },
                  ],
                  steps: [
                    {
                      instruction: "미니 파프리카에 속을 꽉 채워요.",
                      raw_text: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
                      evidence_refs: [{ source: "caption", line_index: 0, start_ms: null, end_ms: null }],
                    },
                  ],
                  warnings: [],
                },
              ],
            },
          },
        ],
      });
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        providerName: "fixture-transcript",
        transcriptText: "미니 파프리카에 부침가루를 묻히고 속을 꽉 채워요.",
        language: "ko",
        trackKind: "auto" as const,
      })),
    };
    const llmExtractor: YoutubeRecipeLlmExtractor = {
      name: "gemini_structured_extractor",
      fetchStructuredRecipe: vi.fn(async () => {
        throw new Error("Gemini should not be called on cache hit");
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      withYoutubeRecipeLlmExtractor(llmExtractor, () => postYoutubeExtract(transcriptFallbackUrl)),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        ingredients: [{ standard_name: "미니 파프리카" }],
        steps: [{ instruction: "미니 파프리카에 속을 꽉 채워요." }],
      },
      error: null,
    });
    expect(llmExtractor.fetchStructuredRecipe).not.toHaveBeenCalled();
    expect(llmExtractionCacheTable.__updateQuery.eq).toHaveBeenCalledWith(
      "id",
      "550e8400-e29b-41d4-a716-446655441701",
    );
    expect(llmExtractionEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      cache_hit: true,
      status: "success",
    }));

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      source_providers: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.source_providers).toContain("gemini_structured_extractor_cache");
    expect(insertedSession.extraction_meta_json).toMatchObject({
      llm_extractor: {
        status: "cache_hit",
        cache_hit: true,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract degrades to description-only when transcript provider fails", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => {
        throw new Error("temporary transcript outage");
      }),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract(transcriptFallbackUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description"],
        blocking_issues: ["steps[0].instruction"],
      },
      error: null,
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description"]);
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "available",
      transcript_provider: {
        attempted: true,
        capability: "available",
        provider: "fixture-transcript",
        status: "error",
        reason: "temporary transcript outage",
        step_count: 0,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract can use public transcript text even when caption flag is unavailable", async () => {
    mockAuth();

    const { dbClient, sessionsTable } = createTranscriptFallbackExtractDbClient();
    const transcriptProvider: YoutubeTranscriptProvider = {
      name: "fixture-transcript",
      fetchTranscript: vi.fn(async () => ({
        status: "available" as const,
        transcriptText: "만드는 법\n1. 김치를 썰어주세요.",
      })),
    };

    createServiceRoleClient.mockReturnValue(dbClient);
    const { response, body } = await withYoutubeTranscriptProvider(transcriptProvider, () =>
      postYoutubeExtract(transcriptNoCaptionUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        extraction_methods: ["description", "caption"],
        blocking_issues: [],
        steps: [
          {
            instruction: "김치를 썰어주세요.",
            is_incomplete: false,
            missing_fields: [],
          },
        ],
      },
      error: null,
    });
    expect(transcriptProvider.fetchTranscript).toHaveBeenCalledWith({
      videoId: "nocaption123",
      youtubeUrl: transcriptNoCaptionUrl,
      title: "김치찌개 자막 없는 레시피",
      channel: "집밥 채널",
      captionCapability: "unavailable",
    });

    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_methods: string[];
      extraction_meta_json: Record<string, unknown>;
    };
    expect(insertedSession.extraction_methods).toEqual(["description", "caption"]);
    expect(insertedSession.extraction_meta_json).toMatchObject({
      caption_capability: "unavailable",
      transcript_provider: {
        attempted: true,
        capability: "unavailable",
        provider: "fixture-transcript",
        status: "used",
        step_count: 1,
      },
    });
  });

  it("POST /api/v1/recipes/youtube/extract can return needs_review candidates before registration", async () => {
    mockAuth();

    const ingredientsTable = createLookupTable({
      data: [
        { id: kimchiIngredientId, standard_name: "김치" },
      ],
      error: null,
    });
    const ingredientSynonymsTable = createLookupTable({
      data: [
        {
          synonym: "소금",
          ingredients: { id: saltIngredientId, standard_name: "천일염" },
        },
        {
          synonym: "소금",
          ingredients: { id: waterIngredientId, standard_name: "꽃소금" },
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

    const videoProvider: YoutubeVideoProvider = {
      name: "fixture-video",
      fetchVideo: vi.fn(async (videoId) => ({
        video: {
          videoId,
          title: "백종원 김치찌개 후보 확인 필요",
          channel: "백종원의 요리비책",
          channelId: `channel-${videoId}`,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          description: [
            "김치찌개 레시피",
            "재료",
            "김치 200g",
            "소금 약간",
            "만들기",
            "김치를 한입 크기로 썬다.",
          ].join("\n"),
          tags: ["recipe", "김치찌개", "레시피"],
          categoryId: "26",
          duration: "PT15M30S",
          captionFlag: "false",
        },
      })),
    };

    const { response, body } = await withYoutubeVideoProvider(videoProvider, () =>
      postYoutubeExtract(ambiguousMatchUrl),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        thumbnail_url: "https://img.youtube.com/vi/ambiguousmatch123/hqdefault.jpg",
        tags: ["유튜브레시피", "한식", "국물요리", "발효한끼"],
        blocking_issues: ["ingredients[1].ingredient_id"],
        ingredients: [
          { standard_name: "김치", resolution_status: "resolved" },
          {
            standard_name: "소금",
            ingredient_id: "",
            confidence: 0.8,
            resolution_status: "needs_review",
            candidates: expect.arrayContaining([
              {
                ingredient_id: saltIngredientId,
                standard_name: "천일염",
                confidence: 0.8,
              },
              {
                ingredient_id: waterIngredientId,
                standard_name: "꽃소금",
                confidence: 0.8,
              },
            ]),
          },
        ],
      },
      error: null,
    });
    expect(videoProvider.fetchVideo).toHaveBeenCalledWith("ambiguousmatch123");
    expect(sessionsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      thumbnail_url: "https://img.youtube.com/vi/ambiguousmatch123/hqdefault.jpg",
      draft_json: expect.objectContaining({
        thumbnail_url: "https://img.youtube.com/vi/ambiguousmatch123/hqdefault.jpg",
        tags: ["유튜브레시피", "한식", "국물요리", "발효한끼"],
      }),
    }));
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
            session_kind: "multi_parent",
            draft_json: buildIngredientRegistrationDraftJson(),
          }),
          error: null,
        },
        status: 409,
        code: "CANDIDATE_PROMOTION_REQUIRED",
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
      p_category_code: null,
      p_default_unit: "g",
      p_synonym: "soy sauce",
    });
  });

  it("POST /api/v1/recipes/youtube/ingredient-registration accepts v2 category code additively", async () => {
    mockAuth();

    const { dbClient, rpc } = createIngredientRegistrationDbClient({
      rpcResult: {
        data: {
          ingredient_id: mustardIngredientId,
          standard_name: "연겨자",
          category: "양념",
          category_code: "paste_sauce",
          default_unit: null,
          synonym_status: "skipped_same_as_standard",
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
        category: "채소",
        category_code: "paste_sauce",
      })),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        ingredient: {
          ingredient_id: mustardIngredientId,
          standard_name: "연겨자",
          category: "양념",
          category_code: "paste_sauce",
          resolution_status: "resolved",
        },
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("register_youtube_ingredient", {
      p_standard_name: "연겨자",
      p_category: "양념",
      p_category_code: "paste_sauce",
      p_default_unit: null,
      p_synonym: "연겨자",
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

  it("POST /api/v1/recipes/youtube/register rejects client thumbnail overrides before database writes", async () => {
    mockAuth();

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildRegisterBody(),
        thumbnail_url: "https://example.com/override.webp",
        tags: ["클라이언트태그"],
      }),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "thumbnail_url", reason: "not_allowed" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register requires draft ingredient id and confirmation status before database writes", async () => {
    mockAuth();

    const body = structuredClone(buildRegisterBody()) as ReturnType<typeof buildRegisterBody> & {
      ingredients: Array<Record<string, unknown>>;
    };
    delete (body.ingredients[0] as Record<string, unknown>).draft_ingredient_id;
    body.ingredients[1].quantity_confirmation_status = "unknown_status";

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
          { field: "ingredients[0].draft_ingredient_id", reason: "required" },
          { field: "ingredients[1].quantity_confirmation_status", reason: "invalid_enum" },
        ],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register rejects review-required draft quantities sent as not_required", async () => {
    mockAuth();

    const body = {
      ...buildRegisterBody(),
      ingredients: buildRegisterBody().ingredients.map((ingredient, index) =>
        index === 0
          ? {
              ...ingredient,
              amount: 4,
              unit: "개",
              display_text: "김치 4개",
              quantity_confirmation_status: "not_required",
            }
          : ingredient,
      ),
    };
    const { dbClient, rpc } = createRegisterDbClient({
      sessionResult: {
        data: buildYoutubeSession({
          draft_json: buildRegisterDraftJson({
            kimchiOverrides: {
              amount: 4,
              unit: "개",
              display_text: "김치 4개",
              quantity_source: "visual_explicit",
              quantity_review_required: true,
            },
          }),
        }),
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

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
        fields: [{ field: "quantity_review_required", reason: "confirmation_required" }],
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register accepts confirmed visual suggestions only when body matches the draft", async () => {
    mockAuth();

    const body = {
      ...buildRegisterBody(),
      ingredients: buildRegisterBody().ingredients.map((ingredient, index) =>
        index === 0
          ? {
              ...ingredient,
              amount: 4,
              unit: "개",
              display_text: "김치 4개",
              quantity_confirmation_status: "confirmed_suggestion",
            }
          : ingredient,
      ),
    };
    const { dbClient, rpc } = createRegisterDbClient({
      sessionResult: {
        data: buildYoutubeSession({
          draft_json: buildRegisterDraftJson({
            kimchiOverrides: {
              amount: 4,
              unit: "개",
              display_text: "김치 4개",
              quantity_source: "visual_explicit",
              quantity_review_required: true,
            },
          }),
        }),
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(201);
    expect(responseBody).toMatchObject({
      success: true,
      data: { recipe_id: recipeId },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", expect.objectContaining({
      p_ingredients: body.ingredients,
    }));
  });

  it("POST /api/v1/recipes/youtube/register rejects confirmed suggestions when body differs from draft", async () => {
    mockAuth();

    const body = {
      ...buildRegisterBody(),
      ingredients: buildRegisterBody().ingredients.map((ingredient, index) =>
        index === 0
          ? {
              ...ingredient,
              amount: 5,
              unit: "개",
              display_text: "김치 5개",
              quantity_confirmation_status: "confirmed_suggestion",
            }
          : ingredient,
      ),
    };
    const { dbClient, rpc } = createRegisterDbClient({
      sessionResult: {
        data: buildYoutubeSession({
          draft_json: buildRegisterDraftJson({
            kimchiOverrides: {
              amount: 4,
              unit: "개",
              display_text: "김치 4개",
              quantity_source: "visual_explicit",
              quantity_review_required: true,
            },
          }),
        }),
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

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
        fields: [{ field: "quantity_review_required", reason: "suggestion_mismatch" }],
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST /api/v1/recipes/youtube/register accepts edited quantities and cleared to-taste confirmations", async () => {
    const cases = [
      {
        status: "edited_quantity",
        ingredient: {
          amount: 5,
          unit: "개",
          ingredient_type: "QUANT",
          display_text: "김치 5개",
          scalable: true,
          quantity_confirmation_status: "edited_quantity",
        },
      },
      {
        status: "cleared_to_taste",
        ingredient: {
          amount: null,
          unit: null,
          ingredient_type: "TO_TASTE",
          display_text: "김치 약간",
          scalable: false,
          quantity_confirmation_status: "cleared_to_taste",
        },
      },
    ];
    const { POST } = await importRegisterRoute();

    for (const currentCase of cases) {
      mockAuth();
      const body = {
        ...buildRegisterBody(),
        ingredients: buildRegisterBody().ingredients.map((ingredient, index) =>
          index === 0
            ? {
                ...ingredient,
                ...currentCase.ingredient,
              }
            : ingredient,
        ),
      };
      const { dbClient, rpc } = createRegisterDbClient({
        sessionResult: {
          data: buildYoutubeSession({
            draft_json: buildRegisterDraftJson({
              kimchiOverrides: {
                amount: 4,
                unit: "개",
                display_text: "김치 4개",
                quantity_source: "recipe_inferred",
                quantity_review_required: true,
              },
            }),
          }),
          error: null,
        },
      });
      createServiceRoleClient.mockReturnValue(dbClient);

      const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      const responseBody = await response.json();

      expect(response.status).toBe(201);
      expect(responseBody).toMatchObject({
        success: true,
        data: { recipe_id: recipeId },
        error: null,
      });
      expect(rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", expect.objectContaining({
        p_ingredients: body.ingredients,
      }));

      createRouteHandlerClient.mockReset();
      createServiceRoleClient.mockReset();
      ensurePublicUserRow.mockReset();
      ensureUserBootstrapState.mockReset();
      ensurePublicUserRow.mockResolvedValue({});
      ensureUserBootstrapState.mockResolvedValue(undefined);
    }
  });

  it("POST /api/v1/recipes/youtube/register allows repeated ingredient ids with distinct rows", async () => {
    mockAuth();

    const body = buildRegisterBody();
    body.ingredients[1] = {
      ...body.ingredients[1],
      ingredient_id: kimchiIngredientId,
      standard_name: "김치",
      amount: 50,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "김치 50g",
      scalable: true,
      sort_order: 2,
    };
    const { dbClient, rpc } = createRegisterDbClient({
      ingredientRows: [{ id: kimchiIngredientId }],
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(201);
    expect(responseBody).toMatchObject({
      success: true,
      data: { recipe_id: recipeId },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("register_youtube_recipe_from_session", expect.objectContaining({
      p_ingredients: body.ingredients,
    }));
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
        session: buildYoutubeSession({ session_kind: "multi_parent" }),
        body: buildRegisterBody(),
        status: 409,
        code: "CANDIDATE_PROMOTION_REQUIRED",
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
      p_tags: null,
      p_tag_source: "system_suggested",
      p_ingredients: buildRegisterBody().ingredients,
      p_steps: buildRegisterBody().steps,
    });
    expect(from).not.toHaveBeenCalledWith("recipe_book_items");
  });

  it("POST /api/v1/recipes/youtube/register marks the parent candidate after a child draft is registered", async () => {
    mockAuth();

    const { candidatesTable, dbClient, rpc } = createRegisterDbClient({
      sessionResult: {
        data: buildYoutubeSession({
          id: childExtractionId,
          session_kind: "candidate_child",
          parent_extraction_session_id: extractionId,
          parent_candidate_id: "candidate-1",
        }),
        error: null,
      },
      rpcResult: {
        data: { recipe_id: recipeId, title: "김치볶음밥" },
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRegisterRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/youtube/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildRegisterBody(),
        extraction_id: childExtractionId,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: { recipe_id: recipeId },
      error: null,
    });
    expect(rpc).toHaveBeenCalled();
    expect(candidatesTable.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "registered",
      recipe_id: recipeId,
      registered_at: expect.any(String),
    }));
    expect(candidatesTable.__updateQuery.eq).toHaveBeenCalledWith("extraction_session_id", extractionId);
    expect(candidatesTable.__updateQuery.eq).toHaveBeenCalledWith("candidate_id", "candidate-1");
  });
});
