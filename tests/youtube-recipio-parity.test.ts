import { existsSync, readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  scoreIngredientMatches,
  scoreStepMatches,
  type YoutubeExpectedIngredient,
  type YoutubeExpectedStep,
} from "@/lib/server/youtube-corpus-scoring";
import {
  handleYoutubeExtract,
  setYoutubeAuthorCommentProviderForTest,
  setYoutubeRecipeLlmExtractorForTest,
  setYoutubeTranscriptProviderForTest,
  setYoutubeVideoProviderForTest,
  setYoutubeVisualRecipeExtractorForTest,
  type YoutubeAuthorCommentProvider,
  type YoutubeProviderVideo,
  type YoutubeRecipeLlmExtractor,
  type YoutubeTranscriptProvider,
  type YoutubeVideoProvider,
  type YoutubeVisualRecipeExtractor,
} from "@/lib/server/youtube-import";

import parityData from "@/tests/fixtures/youtube-recipio-parity/parity-v1.json";

const mocks = vi.hoisted(() => {
  const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
    if (error instanceof Error) {
      return `formatted: ${error.message}`;
    }

    return fallbackMessage;
  });

  return {
    createRouteHandlerClient: vi.fn(),
    createServiceRoleClient: vi.fn(),
    ensurePublicUserRow: vi.fn(),
    ensureUserBootstrapState: vi.fn(),
    formatBootstrapErrorMessage,
  };
});
const {
  createRouteHandlerClient,
  createServiceRoleClient,
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
} = mocks;

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: mocks.ensurePublicUserRow,
  ensureUserBootstrapState: mocks.ensureUserBootstrapState,
  formatBootstrapErrorMessage: mocks.formatBootstrapErrorMessage,
}));

type SourceProfile = "description_detailed" | "author_comment" | "caption_llm" | "sparse_visual";
type TerminalStatus = "passed" | "failed" | "contract_blocked";
type SuiteStatus = "passed" | "failed" | "contract_blocked";

interface ParityFixture {
  id: string;
  video_id: string;
  title: string;
  source_profile: SourceProfile;
  public_score: number;
  historical_local_score: number;
  requires_visual_recipe_contract: boolean;
  description: string;
  author_comment: string | null;
  transcript: string | null;
  expected_ingredients: YoutubeExpectedIngredient[];
  expected_steps: YoutubeExpectedStep[];
}

interface QueryResult<T> {
  data: T;
  error: { code?: string; message: string } | null;
}

interface ParityRunResult {
  id: string;
  video_id: string;
  title: string;
  source_profile: SourceProfile;
  public_score: number;
  historical_local_score: number;
  local_score: number;
  gap: number;
  terminal_status: TerminalStatus;
  provider_call_count: number;
  model_attempt_count: number;
  cost_proxy_units: number;
  estimated_provider_timeout_ms: number;
  estimated_latency_bucket: "low" | "medium" | "high" | "fail";
  fallback_trigger_reasons: string[];
}

interface ParitySuiteReport {
  status: SuiteStatus;
  contract_aligned: boolean;
  per_fixture: ParityRunResult[];
  aggregate: {
    fixture_count: number;
    passed_count: number;
    contract_blocked_count: number;
    failed_count: number;
    avg_local_score: number;
    max_cost_proxy_units: number;
    max_estimated_provider_timeout_ms: number;
  };
}

const benchmarks = parityData.benchmarks as ParityFixture[];
const userId = "550e8400-e29b-41d4-a716-446655440030";
const baseCookingMethods = [
  { id: "method-prep", code: "prep", label: "손질", color_key: "gray", is_system: true },
  { id: "method-mix", code: "mix", label: "섞기", color_key: "green", is_system: true },
  { id: "method-grill", code: "grill", label: "굽기", color_key: "brown", is_system: true },
  { id: "method-stir-fry", code: "stir_fry", label: "볶기", color_key: "orange", is_system: true },
  { id: "method-boil", code: "boil", label: "끓이기", color_key: "blue", is_system: true },
  { id: "method-deep-fry", code: "deep_fry", label: "튀기기", color_key: "yellow", is_system: true },
  { id: "method-steam", code: "steam", label: "찌기", color_key: "purple", is_system: true },
  { id: "method-blanch", code: "blanch", label: "데치기", color_key: "mint", is_system: true },
  { id: "method-auto-salt", code: "auto_salt", label: "절이기", color_key: "unassigned", is_system: false },
];

function roundScore(value: number) {
  return Number(value.toFixed(4));
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createArrayQuery<T>(rows: T[]) {
  const query = {
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    then: createAwaitableQuery({ data: rows, error: null }).then,
  };

  return query;
}

function createLookupTable<T>(rows: T[]) {
  return {
    select: vi.fn(() => createArrayQuery(rows)),
  };
}

function createEventOrCacheTable<T>(rows: T[] = []) {
  return {
    insert: vi.fn(() => createAwaitableQuery({ data: null, error: null })),
    select: vi.fn(() => createArrayQuery(rows)),
    update: vi.fn(() => ({
      eq: vi.fn(() => createAwaitableQuery({ data: null, error: null })),
    })),
  };
}

function createCookingMethodsTable() {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      createAwaitableQuery({
        data: baseCookingMethods.find((method) => method.code === "auto_salt") ?? null,
        error: null,
      }),
    ),
    then: createAwaitableQuery({ data: baseCookingMethods, error: null }).then,
  };
  const insertQuery = {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(() =>
        createAwaitableQuery({
          data: baseCookingMethods.find((method) => method.code === "auto_salt") ?? null,
          error: null,
        }),
      ),
    })),
  };

  return {
    insert: vi.fn(() => insertQuery),
    select: vi.fn(() => query),
  };
}

function createSessionsTable() {
  return {
    insert: vi.fn((payload: unknown) => {
      void payload;
      return createAwaitableQuery({ data: null, error: null });
    }),
  };
}

function allExpectedIngredientRows() {
  const names = new Set<string>();
  for (const fixture of benchmarks) {
    for (const ingredient of fixture.expected_ingredients) {
      names.add(ingredient.name);
    }
  }

  return [...names].map((standardName, index) => ({
    id: `parity-ingredient-${String(index + 1).padStart(3, "0")}`,
    standard_name: standardName,
  }));
}

function createParityDbClient() {
  const sessionsTable = createSessionsTable();
  const tables = {
    ingredients: createLookupTable(allExpectedIngredientRows()),
    ingredient_synonyms: createLookupTable([]),
    cooking_methods: createCookingMethodsTable(),
    youtube_extraction_sessions: sessionsTable,
    youtube_llm_extraction_cache: createEventOrCacheTable(),
    youtube_llm_extraction_events: createEventOrCacheTable(),
    youtube_visual_extraction_cache: createEventOrCacheTable(),
    youtube_visual_extraction_events: createEventOrCacheTable(),
    youtube_transcript_cache: createEventOrCacheTable(),
    youtube_transcript_fetch_events: createEventOrCacheTable(),
  };

  return {
    sessionsTable,
    dbClient: {
      from: vi.fn((table: keyof typeof tables) => {
        const tableMock = tables[table];
        if (!tableMock) {
          throw new Error(`unexpected table: ${table}`);
        }

        return tableMock;
      }),
    },
  };
}

function mockAuth() {
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
    },
    from: vi.fn(),
  });
}

function buildVideo(fixture: ParityFixture): YoutubeProviderVideo {
  return {
    videoId: fixture.video_id,
    title: `${fixture.title} 레시피`,
    channel: "Parity Kitchen",
    channelId: `channel-${fixture.video_id}`,
    thumbnailUrl: `https://img.youtube.com/vi/${fixture.video_id}/hqdefault.jpg`,
    description: fixture.description,
    tags: ["recipe", "레시피", fixture.title],
    categoryId: "26",
    duration: "PT1M30S",
    captionFlag: fixture.transcript ? "true" : "false",
  };
}

function instructionFromPattern(pattern: string) {
  const compact = pattern
    .replace(/\.\*/gu, " ")
    .replace(/[()]/gu, "")
    .replace(/\\/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const suffixReplacements: Array<[RegExp, string]> = [
    [/썬$/u, "썬다."],
    [/삶$/u, "삶는다."],
    [/볶$/u, "볶는다."],
    [/섞$/u, "섞는다."],
    [/비$/u, "비빈다."],
    [/무$/u, "무친다."],
    [/끓$/u, "끓인다."],
    [/뿌$/u, "뿌린다."],
    [/익$/u, "익힌다."],
    [/올$/u, "올린다."],
    [/자$/u, "자른다."],
    [/다$/u, "다진다."],
    [/감$/u, "감싼다."],
    [/간$/u, "간한다."],
    [/깔$/u, "깔아준다."],
    [/찐$/u, "찐다."],
    [/마무리$/u, "마무리한다."],
    [/준비$/u, "준비한다."],
  ];
  const replacement = suffixReplacements.find(([pattern]) => pattern.test(compact));
  if (replacement) {
    return compact.replace(replacement[0], replacement[1]);
  }

  return /(?:다|요|니다|\.)$/u.test(compact) ? compact : `${compact}한다.`;
}

function buildStructuredRecipeResult(
  fixture: ParityFixture,
  source: "description" | "comment" | "caption",
  mode: "full" | "partial",
) {
  const ingredientCount = mode === "partial" ? 1 : fixture.expected_ingredients.length;
  const stepCount = mode === "partial" ? 1 : fixture.expected_steps.length;

  return {
    recipes: [
      {
        title: fixture.title,
        confidence: mode === "partial" ? 0.72 : 0.92,
        ingredients: fixture.expected_ingredients.slice(0, ingredientCount).map((ingredient) => ({
          name: ingredient.name,
          amount: ingredient.amount === null ? null : String(ingredient.amount),
          unit: ingredient.unit,
          raw_text: [
            ingredient.name,
            ingredient.amount === null ? "약간" : ingredient.amount,
            ingredient.unit ?? "",
          ].filter(Boolean).join(" "),
          evidence_refs: [{ source, line_index: 0, start_ms: null, end_ms: null }],
        })),
        steps: fixture.expected_steps.slice(0, stepCount).map((step) => ({
          instruction: instructionFromPattern(step.instruction_pattern),
          raw_text: step.instruction_pattern,
          evidence_refs: [{ source, line_index: 0, start_ms: null, end_ms: null }],
        })),
        warnings: mode === "partial" ? ["텍스트만으로는 화면 자막 재료가 부족합니다."] : [],
      },
    ],
  };
}

function buildVisualRecipeResult(fixture: ParityFixture) {
  const ingredientLines = fixture.expected_ingredients.map((ingredient, index) => ({
    line_index: index,
    text: [
      ingredient.name,
      ingredient.amount === null ? "약간" : ingredient.amount,
      ingredient.unit ?? "",
    ].filter(Boolean).join(" "),
    start_ms: index * 1000,
    end_ms: index * 1000 + 500,
  }));
  const stepLines = fixture.expected_steps.map((step, index) => ({
    line_index: ingredientLines.length + index,
    text: instructionFromPattern(step.instruction_pattern),
    start_ms: (ingredientLines.length + index) * 1000,
    end_ms: (ingredientLines.length + index) * 1000 + 500,
  }));

  return {
    visual_source_lines: [...ingredientLines, ...stepLines],
    ...buildStructuredRecipeResult(fixture, "caption", "full"),
    recipes: [
      {
        title: fixture.title,
        confidence: 0.93,
        ingredients: fixture.expected_ingredients.map((ingredient, index) => ({
          name: ingredient.name,
          amount: ingredient.amount === null ? null : String(ingredient.amount),
          unit: ingredient.unit,
          raw_text: ingredientLines[index].text,
          evidence_refs: [{ source: "visual", line_index: index, start_ms: index * 1000, end_ms: index * 1000 + 500 }],
        })),
        steps: fixture.expected_steps.map((_, index) => ({
          instruction: stepLines[index].text,
          raw_text: stepLines[index].text,
          evidence_refs: [{
            source: "visual",
            line_index: ingredientLines.length + index,
            start_ms: (ingredientLines.length + index) * 1000,
            end_ms: (ingredientLines.length + index) * 1000 + 500,
          }],
        })),
        warnings: [],
      },
    ],
  };
}

function llmSourceForFixture(fixture: ParityFixture): "description" | "comment" | "caption" {
  if (fixture.source_profile === "author_comment") return "comment";
  if (fixture.source_profile === "caption_llm" || fixture.source_profile === "sparse_visual") return "caption";
  return "description";
}

function latencyBucket(timeoutMs: number): ParityRunResult["estimated_latency_bucket"] {
  if (timeoutMs === 0) return "low";
  if (timeoutMs <= 20_000) return "medium";
  if (timeoutMs <= 70_000) return "high";
  return "fail";
}

function buildTerminalStatus({
  fixture,
  contractAligned,
  localScore,
  fallbackReasons,
}: {
  fixture: ParityFixture;
  contractAligned: boolean;
  localScore: number;
  fallbackReasons: string[];
}): TerminalStatus {
  if (localScore >= fixture.public_score) {
    return "passed";
  }

  if (
    fixture.requires_visual_recipe_contract
    && !contractAligned
    && fallbackReasons.includes("visual_recipe_contract_unaligned")
  ) {
    return "contract_blocked";
  }

  return "failed";
}

async function runFixture(
  fixture: ParityFixture,
  {
    contractAligned,
  }: {
    contractAligned: boolean;
  },
): Promise<ParityRunResult> {
  mockAuth();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("HOMECOOK_ENABLE_YOUTUBE_IMPORT", "1");
  vi.stubEnv("YOUTUBE_RECIPE_LLM_ENABLED", "true");
  vi.stubEnv("YOUTUBE_RECIPE_LLM_PROVIDER", "gemini");
  vi.stubEnv("YOUTUBE_RECIPE_LLM_DAILY_LIMIT", "100");
  vi.stubEnv("YOUTUBE_RECIPE_LLM_USER_DAILY_LIMIT", "100");
  vi.stubEnv("YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED", "false");
  vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED", "true");
  vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_CONTRACT_ALIGNED", contractAligned ? "true" : "false");
  vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_DAILY_LIMIT", "100");
  vi.stubEnv("YOUTUBE_RECIPE_VISUAL_RECIPE_USER_DAILY_LIMIT", "100");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

  const { dbClient, sessionsTable } = createParityDbClient();
  createServiceRoleClient.mockReturnValue(dbClient);
  const calls = {
    video: 0,
    comment: 0,
    transcript: 0,
    llm: 0,
    visualRecipe: 0,
  };
  const videoProvider: YoutubeVideoProvider = {
    name: "parity-video-provider",
    fetchVideo: vi.fn(async () => {
      calls.video += 1;
      return { video: buildVideo(fixture) };
    }),
  };
  const authorCommentProvider: YoutubeAuthorCommentProvider = {
    name: "parity-comment-provider",
    fetchAuthorComments: vi.fn(async () => {
      calls.comment += 1;
      return {
        status: "available" as const,
        providerName: "parity-comment-provider",
        comments: fixture.author_comment
          ? [{
              id: `comment-${fixture.video_id}`,
              text: fixture.author_comment,
              authorChannelId: `channel-${fixture.video_id}`,
              authorDisplayName: "Parity Kitchen",
              likeCount: 1,
              publishedAt: "2026-06-01T00:00:00.000Z",
            }]
          : [],
      };
    }),
  };
  const transcriptProvider: YoutubeTranscriptProvider = {
    name: "parity-transcript-provider",
    fetchTranscript: vi.fn(async () => {
      calls.transcript += 1;
      if (!fixture.transcript) {
        return {
          status: "unavailable" as const,
          providerName: "parity-transcript-provider",
          reason: "no_fixture_transcript",
        };
      }

      return {
        status: "available" as const,
        providerName: "parity-transcript-provider",
        transcriptText: fixture.transcript,
        language: "ko",
        trackKind: "auto" as const,
      };
    }),
  };
  const llmExtractor: YoutubeRecipeLlmExtractor = {
    name: "parity-llm-provider",
    fetchStructuredRecipe: vi.fn(async () => {
      calls.llm += 1;
      const mode = fixture.source_profile === "sparse_visual" ? "partial" : "full";
      return {
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        fallbackModel: "gemini-2.5-flash-lite",
        resultJson: buildStructuredRecipeResult(fixture, llmSourceForFixture(fixture), mode),
        inputTokens: 96,
        outputTokens: 64,
      };
    }),
  };
  const visualRecipeExtractor: YoutubeVisualRecipeExtractor = {
    name: "parity-visual-recipe-provider",
    fetchVisualRecipe: vi.fn(async () => {
      calls.visualRecipe += 1;
      return {
        status: "available" as const,
        providerName: "gemini",
        model: "gemini-3.1-flash-lite",
        resultJson: buildVisualRecipeResult(fixture),
        inputTokens: 160,
        outputTokens: 120,
      };
    }),
  };

  const restoreVideo = setYoutubeVideoProviderForTest(videoProvider);
  const restoreComment = setYoutubeAuthorCommentProviderForTest(authorCommentProvider);
  const restoreTranscript = setYoutubeTranscriptProviderForTest(transcriptProvider);
  const restoreLlm = setYoutubeRecipeLlmExtractorForTest(llmExtractor);
  const restoreVisualRecipe = setYoutubeVisualRecipeExtractorForTest(visualRecipeExtractor);

  try {
    const response = await handleYoutubeExtract(new Request("http://localhost:3000/api/v1/recipes/youtube/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtube_url: `https://www.youtube.com/watch?v=${fixture.video_id}` }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const actualIngredients = body.data.ingredients.map((
      ingredient: { standard_name: string; amount: number | null; unit: string | null },
    ) => ({
      name: ingredient.standard_name,
      amount: ingredient.amount,
      unit: ingredient.unit,
    }));
    const actualSteps = body.data.steps.map((step: { instruction: string }) => step.instruction);
    const ingredients = scoreIngredientMatches(
      fixture.expected_ingredients,
      actualIngredients,
    );
    const steps = scoreStepMatches(
      fixture.expected_steps,
      actualSteps,
    );
    const localScore = roundScore((ingredients.f1 + steps.f1) / 2);
    const insertedSession = sessionsTable.insert.mock.calls[0]?.[0] as {
      extraction_meta_json: {
        llm_extractor?: { attempted?: boolean; status?: string; reason?: string | null };
        visual_recipe_extractor?: {
          attempted?: boolean;
          status?: string;
          trigger_reason?: string | null;
          reason?: string | null;
          contract_aligned?: boolean;
        };
      };
    };
    const llmMeta = insertedSession.extraction_meta_json.llm_extractor;
    const visualRecipeMeta = insertedSession.extraction_meta_json.visual_recipe_extractor;
    const fallbackReasons = [
      llmMeta?.reason,
      visualRecipeMeta?.trigger_reason,
      visualRecipeMeta?.reason,
      visualRecipeMeta?.contract_aligned === false && visualRecipeMeta?.attempted
        ? "visual_recipe_contract_unaligned"
        : null,
    ].filter((reason): reason is string => Boolean(reason));
    const providerCallCount = calls.llm + calls.visualRecipe;
    const modelAttemptCount = calls.llm + calls.visualRecipe;
    const costProxyUnits = calls.llm + calls.visualRecipe * 3;
    const estimatedProviderTimeoutMs = calls.llm * 15_000 + calls.visualRecipe * 20_000;

    return {
      id: fixture.id,
      video_id: fixture.video_id,
      title: fixture.title,
      source_profile: fixture.source_profile,
      public_score: fixture.public_score,
      historical_local_score: fixture.historical_local_score,
      local_score: localScore,
      gap: roundScore(localScore - fixture.public_score),
      terminal_status: buildTerminalStatus({
        fixture,
        contractAligned,
        localScore,
        fallbackReasons,
      }),
      provider_call_count: providerCallCount,
      model_attempt_count: modelAttemptCount,
      cost_proxy_units: costProxyUnits,
      estimated_provider_timeout_ms: estimatedProviderTimeoutMs,
      estimated_latency_bucket: latencyBucket(estimatedProviderTimeoutMs),
      fallback_trigger_reasons: fallbackReasons,
    };
  } finally {
    restoreVisualRecipe();
    restoreLlm();
    restoreTranscript();
    restoreComment();
    restoreVideo();
  }
}

async function runParitySuite({
  contractAligned,
}: {
  contractAligned: boolean;
}): Promise<ParitySuiteReport> {
  const perFixture: ParityRunResult[] = [];

  for (const fixture of benchmarks) {
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    perFixture.push(await runFixture(fixture, { contractAligned }));
  }

  const failedCount = perFixture.filter((fixture) => fixture.terminal_status === "failed").length;
  const contractBlockedCount = perFixture.filter((fixture) => fixture.terminal_status === "contract_blocked").length;
  const status: SuiteStatus = failedCount > 0
    ? "failed"
    : contractBlockedCount > 0
      ? "contract_blocked"
      : "passed";

  return {
    status,
    contract_aligned: contractAligned,
    per_fixture: perFixture,
    aggregate: {
      fixture_count: perFixture.length,
      passed_count: perFixture.filter((fixture) => fixture.terminal_status === "passed").length,
      contract_blocked_count: contractBlockedCount,
      failed_count: failedCount,
      avg_local_score: roundScore(
        perFixture.reduce((sum, fixture) => sum + fixture.local_score, 0) / perFixture.length,
      ),
      max_cost_proxy_units: Math.max(...perFixture.map((fixture) => fixture.cost_proxy_units)),
      max_estimated_provider_timeout_ms: Math.max(
        ...perFixture.map((fixture) => fixture.estimated_provider_timeout_ms),
      ),
    },
  };
}

describe("YouTube Recipio parity replay contract", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("keeps the 12-fixture benchmark contract separate from production shortcuts", () => {
    expect(parityData.version).toBe("youtube-recipio-parity-v1");
    expect(benchmarks).toHaveLength(12);
    expect(new Set(benchmarks.map((fixture) => fixture.video_id)).size).toBe(12);
    expect(benchmarks.filter((fixture) => fixture.source_profile === "description_detailed").length).toBeGreaterThanOrEqual(3);
    expect(benchmarks.filter((fixture) => fixture.source_profile === "author_comment").length).toBeGreaterThanOrEqual(3);
    expect(benchmarks.filter((fixture) => fixture.requires_visual_recipe_contract)).toHaveLength(3);

    const productionSource = [
      "lib/server/youtube-import.ts",
      "lib/server/youtube-description-parser.ts",
      "lib/server/youtube-multi-recipe-extractor.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(existsSync("lib/server/recipio-youtube-parity-fixtures.ts")).toBe(false);
    expect(productionSource).not.toContain("recipio-youtube-parity-fixtures");
    expect(productionSource).not.toContain("getRecipioYoutubeParityFixture");
    for (const fixture of benchmarks) {
      expect(productionSource).not.toContain(fixture.video_id);
    }
  });

  it("reports contract_blocked for sparse visual cases when visual recipe contract alignment is explicitly disabled", async () => {
    const report = await runParitySuite({ contractAligned: false });

    expect(report.status).toBe("contract_blocked");
    expect(report.aggregate).toMatchObject({
      fixture_count: 12,
      passed_count: 9,
      contract_blocked_count: 3,
      failed_count: 0,
    });
    expect(report.per_fixture.filter((fixture) => fixture.terminal_status === "contract_blocked")
      .map((fixture) => fixture.video_id)).toEqual(["suwUaEEpopU", "Egpjve8caK0", "J5Rmux3ttaY"]);
    expect(report.per_fixture.filter((fixture) => fixture.terminal_status === "contract_blocked")
      .every((fixture) => fixture.fallback_trigger_reasons.includes("visual_recipe_contract_unaligned"))).toBe(true);
    expect(report.aggregate.max_cost_proxy_units).toBeLessThanOrEqual(4);
    expect(report.aggregate.max_estimated_provider_timeout_ms).toBeLessThanOrEqual(50_000);
  });

  it("passes all 12 benchmarks when the visual recipe contract gate is explicitly aligned", async () => {
    const report = await runParitySuite({ contractAligned: true });

    expect(report.status).toBe("passed");
    expect(report.aggregate).toMatchObject({
      fixture_count: 12,
      passed_count: 12,
      contract_blocked_count: 0,
      failed_count: 0,
    });
    expect(report.per_fixture.every((fixture) => fixture.local_score >= fixture.public_score)).toBe(true);
    expect(report.aggregate.max_cost_proxy_units).toBeLessThanOrEqual(7);
    expect(report.aggregate.max_estimated_provider_timeout_ms).toBeLessThanOrEqual(70_000);
  });
});
