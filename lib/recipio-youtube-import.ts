import type {
  YoutubeRecipeExtractData,
  YoutubeRecipeRegisterBody,
} from "@/types/recipe";

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const STEP_BLOCKING_FIELDS = new Set(["instruction", "cooking_method"]);

export type RecipioYoutubeImportPhase =
  | "idle"
  | "checking"
  | "preview"
  | "extracting"
  | "registering"
  | "complete";

export interface RecipioYoutubeUrl {
  videoId: string;
  youtubeUrl: string;
}

export interface RecipioYoutubeProgressInput {
  phase: RecipioYoutubeImportPhase;
  elapsedMs: number;
}

export interface RecipioYoutubeProgress {
  percent: number;
  label: string;
  detail: string;
}

export interface RecipioRecommendedYoutubeVideo {
  videoId: string;
  title: string;
  channel: string;
  viewLabel: string;
}

export const RECIPIO_RECOMMENDED_YOUTUBE_VIDEOS: RecipioRecommendedYoutubeVideo[] = [
  {
    videoId: "OyXZEi9kMGU",
    title: "일본의 고급 스시 오마카세에서 사용하는 기술?",
    channel: "magic chef Kim",
    viewLabel: "조회수 137.8만회",
  },
  {
    videoId: "bdwkJly5g60",
    title: "가장 비싼 궁중요리 피자를 만들었습니다 @만원요리최씨남매",
    channel: "magic chef Kim",
    viewLabel: "조회수 72.1만회",
  },
  {
    videoId: "FNhCQKrey6Y",
    title: "이 레시피 만든 사람은 천재가 확실합니다!",
    channel: "정호영의 오늘도 요리 Kitchen Caden",
    viewLabel: "조회수 45.8만회",
  },
  {
    videoId: "lTCplQtiGw8",
    title: "새벽 5시 기상 | 10가지 집밥 만들기, 남편도시락과 배추말이 전골 야식 | Cook with me",
    channel: "꿀주부 Honeyjubu",
    viewLabel: "조회수 249.6만회",
  },
];

export function buildCanonicalRecipioYoutubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function normalizeRecipioYoutubeUrl(value: string): RecipioYoutubeUrl | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./u, "");
    let videoId: string | null = null;

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
      }
    } else if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      return null;
    }

    return {
      videoId,
      youtubeUrl: buildCanonicalRecipioYoutubeUrl(videoId),
    };
  } catch {
    return null;
  }
}

export function getRecipioYoutubeProgress({
  phase,
  elapsedMs,
}: RecipioYoutubeProgressInput): RecipioYoutubeProgress {
  if (phase === "complete") {
    return {
      percent: 100,
      label: "레시피 생성 완료",
      detail: "레시피 상세로 이동할 준비가 됐어요.",
    };
  }

  if (phase === "registering") {
    return {
      percent: 96,
      label: "레시피 저장 중",
      detail: "추출한 재료와 조리 단계를 저장하고 있어요.",
    };
  }

  if (phase === "extracting") {
    const percent = Math.min(95, 24 + Math.floor(elapsedMs / 1_250));
    const detail =
      elapsedMs > 30_000
        ? "영상 설명과 자막 후보를 조금 더 확인하고 있어요."
        : "영상 설명에서 재료와 만들기를 찾고 있어요.";

    return {
      percent,
      label: "레시피 분석 중",
      detail,
    };
  }

  if (phase === "preview") {
    return {
      percent: 18,
      label: "영상 확인 완료",
      detail: "이 영상으로 레시피를 만들 수 있는지 확인했어요.",
    };
  }

  if (phase === "checking") {
    return {
      percent: 11,
      label: "영상 확인 중",
      detail: "링크와 기존 레시피 여부를 확인하고 있어요.",
    };
  }

  return {
    percent: 0,
    label: "대기 중",
    detail: "유튜브 링크를 붙여넣어 주세요.",
  };
}

export function getRecipioAutoRegisterBlockers(data: YoutubeRecipeExtractData) {
  const blockers = new Set<string>();

  if (
    (data.multi_recipe_status && data.multi_recipe_status !== "single") ||
    (data.recipe_candidates?.length ?? 0) > 1
  ) {
    blockers.add("영상 안에 여러 요리 후보가 있어요.");
  }

  if (data.blocking_issues.length > 0) {
    blockers.add("자동 등록 전에 확인할 항목이 있어요.");
  }

  if (data.ingredients.length === 0) {
    blockers.add("추출된 재료가 없어요.");
  }

  if (
    data.ingredients.some(
      (ingredient) =>
        ingredient.resolution_status !== "resolved" ||
        !ingredient.ingredient_id ||
        !ingredient.standard_name,
    )
  ) {
    blockers.add("확정되지 않은 재료가 있어요.");
  }

  if (data.steps.length === 0) {
    blockers.add("추출된 조리 단계가 없어요.");
  }

  if (
    data.steps.some(
      (step) =>
        !step.instruction.trim() ||
        !step.cooking_method?.id ||
        (step.missing_fields ?? []).some((field) => STEP_BLOCKING_FIELDS.has(field)),
    )
  ) {
    blockers.add("필수 조리 단계가 비어 있어요.");
  }

  return [...blockers];
}

export function buildRecipioYoutubeRegisterBody(
  data: YoutubeRecipeExtractData,
  youtubeUrl: string,
): YoutubeRecipeRegisterBody {
  return {
    extraction_id: data.extraction_id,
    title: data.title.trim(),
    base_servings: data.base_servings > 0 ? data.base_servings : 1,
    youtube_url: youtubeUrl,
    ingredients: data.ingredients.map((ingredient, index) => ({
      ingredient_id: ingredient.ingredient_id ?? "",
      standard_name: ingredient.standard_name ?? "",
      amount: ingredient.amount,
      unit: ingredient.unit,
      ingredient_type: ingredient.ingredient_type,
      display_text: ingredient.display_text,
      component_label: ingredient.component_label ?? null,
      scalable: ingredient.scalable,
      sort_order: index + 1,
    })),
    steps: data.steps.map((step) => ({
      step_number: step.step_number,
      instruction: step.instruction,
      component_label: step.component_label ?? null,
      cooking_method_id: step.cooking_method?.id ?? "",
      ingredients_used: [],
      heat_level: null,
      duration_seconds: null,
      duration_text: step.duration_text,
    })),
  };
}
