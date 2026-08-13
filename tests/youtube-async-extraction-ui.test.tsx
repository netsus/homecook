// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import * as asyncApi from "@/lib/api/youtube-extraction-jobs";
import * as syncApi from "@/lib/api/youtube-import";

const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({ fetchCookingMethods: vi.fn() }));
vi.mock("@/lib/api/meal", () => ({ createMealSafe: vi.fn() }));
vi.mock("@/lib/api/youtube-extraction-jobs", () => ({
  enqueueYoutubeExtraction: vi.fn(),
  fetchYoutubeExtractionJob: vi.fn(),
  fetchYoutubeExtractionSession: vi.fn(),
}));
vi.mock("@/lib/api/youtube-import", () => ({
  validateYoutubeUrl: vi.fn(),
  extractYoutubeRecipe: vi.fn(),
  createYoutubeCandidateDraft: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
  registerYoutubeIngredient: vi.fn(),
  registerYoutubeIngredientsBulk: vi.fn(),
}));

const youtubeUrl = "https://www.youtube.com/watch?v=abcdefghijk";

function renderImport(props: { initialExtractionId?: string; initialYoutubeUrl?: string } = {}) {
  return render(
    <YoutubeImportScreen
      columnId=""
      initialExtractionId={props.initialExtractionId}
      initialYoutubeUrl={props.initialYoutubeUrl ?? ""}
      planDate=""
      presentation="screen"
      slotName=""
    />,
  );
}

describe("YT_IMPORT async extraction", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: { methods: [] },
      error: null,
    });
    vi.mocked(syncApi.validateYoutubeUrl).mockResolvedValue({
      success: true,
      data: {
        is_valid_url: true,
        is_recipe_video: true,
        classification_status: "recipe",
        classification_reasons: [],
        video_info: {
          video_id: "abcdefghijk",
          title: "감자 수프",
          channel: "테스트 주방",
          duration: "PT5M",
          thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        },
      },
      error: null,
    });
    vi.mocked(asyncApi.enqueueYoutubeExtraction).mockReset();
    vi.mocked(asyncApi.fetchYoutubeExtractionJob).mockReset();
    vi.mocked(asyncApi.fetchYoutubeExtractionJob).mockResolvedValue({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        submitted_at: "2026-08-14T01:00:00.000Z",
        started_at: null,
        completed_at: null,
        result: null,
        error: null,
        can_retry: false,
      },
      error: null,
    });
    vi.mocked(asyncApi.fetchYoutubeExtractionSession).mockReset();
    vi.mocked(syncApi.extractYoutubeRecipe).mockReset();
    routerReplace.mockReset();
  });

  afterEach(() => cleanup());

  it("enqueues in the background and lets the user leave immediately", async () => {
    vi.mocked(asyncApi.enqueueYoutubeExtraction).mockResolvedValue({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-14T01:00:00.000Z",
      },
      error: null,
    });

    renderImport({ initialYoutubeUrl: youtubeUrl });

    expect(await screen.findByText("추출을 시작했어요. 완료되면 알려드릴게요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "나가기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "작업 보기" })).toBeTruthy();
    expect(asyncApi.enqueueYoutubeExtraction).toHaveBeenCalledWith({ youtube_url: youtubeUrl });
    expect(syncApi.extractYoutubeRecipe).not.toHaveBeenCalled();
  });

  it("keeps leaving as the accepted-state primary action and job viewing secondary", async () => {
    vi.mocked(asyncApi.enqueueYoutubeExtraction).mockResolvedValue({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-14T01:00:00.000Z",
      },
      error: null,
    });

    renderImport({ initialYoutubeUrl: youtubeUrl });

    const leave = await screen.findByRole("button", { name: "나가기" });
    const jobs = screen.getByRole("button", { name: "작업 보기" });
    expect(leave.className).toContain("bg-[var(--wave1-mint-contrast)]");
    expect(leave.style.color).toBe("var(--foreground)");
    expect(jobs.className).toContain("bg-[var(--wave1-surface-fill)]");
    expect(jobs.className).not.toContain("bg-[var(--wave1-mint-contrast)]");
  });

  it.each([
    ["POLICY_CHANGED", "추출 설정이 바뀌었어요. 다시 시도해 주세요."],
    ["NETWORK_ERROR", "인터넷 연결을 확인한 뒤 다시 시도해 주세요."],
  ])("preserves the URL on %s", async (code, message) => {
    vi.mocked(asyncApi.enqueueYoutubeExtraction).mockResolvedValue({
      success: false,
      data: null,
      error: { code, message, fields: [] },
    });

    renderImport({ initialYoutubeUrl: youtubeUrl });

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect((screen.getByLabelText("유튜브 URL") as HTMLInputElement).value).toBe(youtubeUrl);
  });

  it("supports consumed-session re-entry without exposing an expired draft", async () => {
    vi.mocked(asyncApi.fetchYoutubeExtractionSession).mockResolvedValue({
      success: true,
      data: {
        status: "consumed",
        draft: null,
        recipe_id: "recipe-registered",
        recipe_path: "/recipes/recipe-registered",
      },
      error: null,
    });

    renderImport({ initialExtractionId: "extraction-consumed" });

    expect(await screen.findByText("이미 등록한 레시피예요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "레시피 보기" }).getAttribute("href"))
      .toBe("/recipes/recipe-registered");
  });

  it("moves a deduplicated completed job directly to its exact review path", async () => {
    vi.mocked(asyncApi.enqueueYoutubeExtraction).mockResolvedValue({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "succeeded",
        deduplicated: true,
        submitted_at: "2026-08-14T01:00:00.000Z",
      },
      error: null,
    });
    vi.mocked(asyncApi.fetchYoutubeExtractionJob).mockResolvedValue({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "succeeded",
        submitted_at: "2026-08-14T01:00:00.000Z",
        started_at: "2026-08-14T01:00:01.000Z",
        completed_at: "2026-08-14T01:02:00.000Z",
        result: {
          extraction_id: "extraction-ready",
          review_path: "/menu/add/youtube?extractionId=extraction-ready",
          recipe_id: null,
          recipe_path: null,
        },
        error: null,
        can_retry: false,
      },
      error: null,
    });

    renderImport({ initialYoutubeUrl: youtubeUrl });

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        "/menu/add/youtube?extractionId=extraction-ready",
      );
    });
  });

  it("renders an expired re-entry as a fresh extraction action", async () => {
    vi.mocked(asyncApi.fetchYoutubeExtractionSession).mockResolvedValue({
      success: false,
      data: null,
      error: {
        code: "EXTRACTION_EXPIRED",
        message: "결과가 만료됐어요. 다시 추출해 주세요.",
        fields: [],
      },
    });

    renderImport({ initialExtractionId: "extraction-expired" });

    expect(await screen.findByText("결과가 만료됐어요. 다시 추출해 주세요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "다시 추출" }).getAttribute("href"))
      .toBe("/menu/add/youtube");
  });
});
