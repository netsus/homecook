// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  YoutubeExtractionNotificationCenter,
  YoutubeExtractionNotificationTrigger,
} from "@/components/youtube-extraction/youtube-extraction-notification-center";
import * as api from "@/lib/api/youtube-extraction-jobs";
import { useYoutubeExtractionStore } from "@/stores/youtube-extraction-store";
import {
  notifyYoutubeExtractionSessionRegistered,
  YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY,
} from "@/lib/youtube-extraction-client-state";

vi.mock("@/lib/api/youtube-extraction-jobs", () => ({
  enqueueYoutubeExtraction: vi.fn(),
  fetchYoutubeExtractionJob: vi.fn(),
  fetchYoutubeExtractionNotifications: vi.fn(),
  markYoutubeExtractionDelivered: vi.fn(),
  markYoutubeExtractionSeen: vi.fn(),
}));

const successItem = {
  job_id: "11111111-1111-4111-8111-111111111111",
  status: "succeeded" as const,
  submitted_at: "2026-08-14T01:00:00.000Z",
  completed_at: "2026-08-14T01:03:00.000Z",
  video_title_snapshot: null,
  thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  delivery_key: "delivery-success",
  delivered_at: null,
  seen_at: null,
  result: {
    extraction_id: "extraction-success",
    review_path: "/menu/add/youtube?extractionId=extraction-success",
    recipe_id: null,
    recipe_path: null,
  },
  error: null,
  can_retry: false,
};

const failedItem = {
  ...successItem,
  job_id: "22222222-2222-4222-8222-222222222222",
  status: "failed" as const,
  delivery_key: "delivery-failed",
  video_title_snapshot: "매콤한 두부조림",
  result: null,
  error: {
    code: "NOT_RECIPE_VIDEO" as const,
    message: "레시피 영상으로 확인되지 않았어요.",
    retryable: false,
  },
};

const activeJob = {
  job_id: "44444444-4444-4444-8444-444444444444",
  status: "queued" as const,
  submitted_at: "2026-08-14T01:10:00.000Z",
  started_at: null,
  completed_at: null,
  result: null,
  error: null,
  can_retry: false,
};

function renderCenter() {
  return render(
    <>
      <YoutubeExtractionNotificationTrigger />
      <YoutubeExtractionNotificationCenter initialAuthenticated />
    </>,
  );
}

describe("YouTube extraction notification center", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useYoutubeExtractionStore.getState().setAuthenticated(false);
    useYoutubeExtractionStore.getState().setItems([]);
    useYoutubeExtractionStore.getState().setOpen(false);
    useYoutubeExtractionStore.getState().setView("unseen-completed");
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockReset();
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem, failedItem], next_cursor: null },
      error: null,
    });
    vi.mocked(api.markYoutubeExtractionDelivered).mockReset();
    vi.mocked(api.markYoutubeExtractionDelivered).mockResolvedValue({
      success: true,
      data: { delivered_count: 2 },
      error: null,
    });
    vi.mocked(api.markYoutubeExtractionSeen).mockReset();
    vi.mocked(api.markYoutubeExtractionSeen).mockResolvedValue({
      success: true,
      data: { seen_count: 2 },
      error: null,
    });
    vi.mocked(api.enqueueYoutubeExtraction).mockReset();
    vi.mocked(api.fetchYoutubeExtractionJob).mockReset();
  });

  afterEach(() => cleanup());

  it("records delivered for visible toasts without clearing the unseen badge", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem], next_cursor: null },
      error: null,
    });
    const user = userEvent.setup();
    renderCenter();

    expect(await screen.findByText("레시피 추출이 끝났어요")).toBeTruthy();
    expect(screen.getByText("추출 결과를 확인하고 레시피로 등록할 수 있어요.")).toBeTruthy();
    expect(screen.getByLabelText("YouTube 추출 알림 1개")).toBeTruthy();

    await waitFor(() => {
      expect(api.markYoutubeExtractionDelivered).toHaveBeenCalledWith(["delivery-success"]);
    });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "toast 닫기" })[0]);
    expect(screen.getByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();
  });

  it("does not replay an already delivered unseen toast after restart or relogin", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: {
        items: [{ ...successItem, delivered_at: "2026-08-14T01:04:00.000Z" }],
        next_cursor: null,
      },
      error: null,
    });

    renderCenter();

    expect(await screen.findByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    expect(screen.queryByText("레시피 추출이 끝났어요")).toBeNull();
    expect(api.markYoutubeExtractionDelivered).not.toHaveBeenCalled();
  });

  it("describes a consumed successful extraction as an already registered recipe", async () => {
    const consumedItem = {
      ...successItem,
      result: {
        extraction_id: "extraction-consumed",
        review_path: null,
        recipe_id: "recipe-registered",
        recipe_path: "/recipes/recipe-registered",
      },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [consumedItem], next_cursor: null },
      error: null,
    });
    renderCenter();

    expect(await screen.findByText("이미 등록한 레시피예요")).toBeTruthy();
    const toast = document.querySelector("[data-youtube-notification-toast]");
    expect(toast?.querySelector("p")?.textContent).toBe("이미 등록한 레시피예요");
    expect(screen.queryByText("추출 결과를 확인하고 레시피로 등록할 수 있어요.")).toBeNull();
    expect(screen.getByRole("link", { name: "레시피 보기" }).getAttribute("href"))
      .toBe("/recipes/recipe-registered");
  });

  it("shows the exact safe failure message in an individual toast", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [failedItem], next_cursor: null },
      error: null,
    });

    renderCenter();

    expect(await screen.findByText("YouTube 레시피 추출에 실패했어요")).toBeTruthy();
    expect(screen.getByText("레시피 영상으로 확인되지 않았어요.")).toBeTruthy();
  });

  it("preserves the user's current focus when a nonmodal unauthorized notice appears", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
    });
    const user = userEvent.setup();
    render(
      <>
        <button type="button">현재 작업</button>
        <YoutubeExtractionNotificationCenter initialAuthenticated />
      </>,
    );
    const currentAction = screen.getByRole("button", { name: "현재 작업" });
    await user.click(currentAction);

    expect(await screen.findByRole("complementary", { name: "로그인 안내" })).toBeTruthy();
    expect(document.activeElement).toBe(currentAction);
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "로그인 안내 닫기" }),
    );
  });

  it("hands panel focus to the login notice when an open list becomes unauthorized", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications)
      .mockResolvedValueOnce({
        success: true,
        data: { items: [successItem], next_cursor: null },
        error: null,
      })
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
      });
    const user = userEvent.setup();
    renderCenter();

    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "알림 닫기" }));
    await user.click(screen.getByRole("tab", { name: "지난 알림" }));

    const heading = await screen.findByRole("heading", { name: "로그인이 필요해요" });
    expect(document.activeElement).toBe(heading);
  });

  it("marks only the exact owner-scoped job seen after the browser observes registration success", async () => {
    const unrelatedItem = {
      ...successItem,
      job_id: "66666666-6666-4666-8666-666666666666",
      delivery_key: "delivery-unrelated",
      result: {
        ...successItem.result,
        extraction_id: "extraction-unrelated",
      },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem, unrelatedItem], next_cursor: null },
      error: null,
    });
    vi.mocked(api.markYoutubeExtractionSeen).mockResolvedValue({
      success: true,
      data: { seen_count: 1 },
      error: null,
    });

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 2개")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([successItem.job_id]);
    });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalledWith([unrelatedItem.job_id]);
    expect(screen.getByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    expect(window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY)).toBe("[]");
  });

  it("fresh-fetches the first unseen page when local items and cursor miss the registration ack", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (_view, options) => ({
      success: true,
      data: options?.limit === 50
        ? { items: [successItem], next_cursor: null }
        : { items: [], next_cursor: null },
      error: null,
    }));
    vi.mocked(api.markYoutubeExtractionSeen).mockResolvedValue({
      success: true,
      data: { seen_count: 1 },
      error: null,
    });

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith(
        "unseen-completed",
        { limit: 50 },
      );
      expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([successItem.job_id]);
    });
    expect(window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY)).toBe("[]");
  });

  it("continues from the fresh first-page cursor to find the exact registration ack", async () => {
    const unrelatedItem = {
      ...successItem,
      job_id: "77777777-7777-4777-8777-777777777777",
      delivery_key: "delivery-unrelated-page-one",
      result: { ...successItem.result, extraction_id: "extraction-unrelated" },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (_view, options) => {
      if (options?.cursor === "fresh-cursor-2") {
        return { success: true, data: { items: [successItem], next_cursor: null }, error: null };
      }
      if (options?.limit === 50) {
        return {
          success: true,
          data: { items: [unrelatedItem], next_cursor: "fresh-cursor-2" },
          error: null,
        };
      }
      return { success: true, data: { items: [], next_cursor: null }, error: null };
    });
    vi.mocked(api.markYoutubeExtractionSeen).mockResolvedValue({
      success: true,
      data: { seen_count: 1 },
      error: null,
    });

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith(
        "unseen-completed",
        { cursor: "fresh-cursor-2", limit: 50 },
      );
      expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([successItem.job_id]);
    });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalledWith([unrelatedItem.job_id]);
  });

  it("preserves a pending registration ack when its fresh reconciliation fetch fails", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (_view, options) => (
      options?.limit === 50
        ? {
            success: false,
            data: null,
            error: { code: "NETWORK_ERROR", message: "연결을 확인해 주세요.", fields: [] },
          }
        : { success: true, data: { items: [], next_cursor: null }, error: null }
    ));

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith(
        "unseen-completed",
        { limit: 50 },
      );
    });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();
    expect(JSON.parse(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY) ?? "[]",
    )).toEqual(["extraction-success"]);
  });

  it("leaves a different extraction unseen when the fresh reconciliation pages do not match", async () => {
    const unrelatedItem = {
      ...successItem,
      job_id: "88888888-8888-4888-8888-888888888888",
      delivery_key: "delivery-unrelated-fresh",
      result: { ...successItem.result, extraction_id: "extraction-unrelated" },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (_view, options) => ({
      success: true,
      data: options?.limit === 50
        ? { items: [unrelatedItem], next_cursor: null }
        : { items: [], next_cursor: null },
      error: null,
    }));

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith(
        "unseen-completed",
        { limit: 50 },
      );
    });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();
    expect(JSON.parse(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY) ?? "[]",
    )).toEqual(["extraction-success"]);
  });

  it("clears a pending ack when the exact owner-scoped archive row is already seen", async () => {
    const alreadySeen = {
      ...successItem,
      delivered_at: "2026-08-14T01:04:00.000Z",
      seen_at: "2026-08-14T01:05:00.000Z",
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view, options) => {
      if (options?.limit === 50 && view === "archive") {
        return { success: true, data: { items: [alreadySeen], next_cursor: null }, error: null };
      }
      return { success: true, data: { items: [], next_cursor: null }, error: null };
    });

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => expect(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY),
    ).toBe("[]"));
    expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith("archive", { limit: 50 });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();
  });

  it("keeps registration successful and retries durable seen after a network failure without permanent hiding", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem], next_cursor: null },
      error: null,
    });
    vi.mocked(api.markYoutubeExtractionSeen)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "NETWORK_ERROR", message: "연결을 확인해 주세요.", fields: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { seen_count: 1 },
        error: null,
      });

    renderCenter();
    expect(await screen.findByText("레시피 추출이 끝났어요")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => expect(api.markYoutubeExtractionSeen).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    expect(JSON.parse(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY) ?? "[]",
    )).toEqual(["extraction-success"]);

    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(api.markYoutubeExtractionSeen).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("YouTube 추출 알림 없음")).toBeTruthy();
    expect(window.sessionStorage.getItem(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY)).toBe("[]");
  });

  it("paginates the owner-scoped unseen list and never marks a different extraction", async () => {
    const unrelatedItem = {
      ...successItem,
      job_id: "77777777-7777-4777-8777-777777777777",
      delivery_key: "delivery-unrelated-page-one",
      result: { ...successItem.result, extraction_id: "extraction-unrelated" },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (_view, options) => ({
      success: true,
      data: options?.cursor === "cursor-2"
        ? { items: [successItem], next_cursor: null }
        : { items: [unrelatedItem], next_cursor: "cursor-2" },
      error: null,
    }));
    vi.mocked(api.markYoutubeExtractionSeen).mockResolvedValue({
      success: true,
      data: { seen_count: 1 },
      error: null,
    });

    renderCenter();
    expect(await screen.findByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    act(() => notifyYoutubeExtractionSessionRegistered("extraction-success"));

    await waitFor(() => {
      expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith(
        "unseen-completed",
        { cursor: "cursor-2", limit: 50 },
      );
    });
    expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([successItem.job_id]);
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalledWith([unrelatedItem.job_id]);
  });

  it("groups multiple terminal items into one toast and delivers every represented key", async () => {
    renderCenter();

    expect(await screen.findByText("레시피 추출 2건이 끝났어요")).toBeTruthy();
    expect(screen.queryByText("레시피 추출이 끝났어요")).toBeNull();
    expect(screen.queryByText("YouTube 레시피 추출에 실패했어요")).toBeNull();
    expect(screen.getByTestId("youtube-notification-toast-icon").textContent).toBe("•");
    expect(screen.getByTestId("youtube-notification-toast-icon").getAttribute("data-outcome"))
      .toBe("mixed");
    await waitFor(() => {
      expect(api.markYoutubeExtractionDelivered).toHaveBeenCalledWith([
        successItem.delivery_key,
        failedItem.delivery_key,
      ]);
    });
  });

  it("projects a stored active job immediately and replaces it with its terminal notification", async () => {
    window.sessionStorage.setItem(
      "homecook.youtube-extraction-jobs",
      JSON.stringify([activeJob.job_id]),
    );
    vi.mocked(api.fetchYoutubeExtractionNotifications)
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], next_cursor: null },
        error: null,
      })
      .mockResolvedValue({
        success: true,
        data: { items: [successItem], next_cursor: null },
        error: null,
      });
    vi.mocked(api.fetchYoutubeExtractionJob)
      .mockResolvedValueOnce({ success: true, data: activeJob, error: null })
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...activeJob,
          status: "succeeded",
          completed_at: successItem.completed_at,
          result: successItem.result,
        },
        error: null,
      });
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 없음" }));
    expect(await screen.findByText("추출 대기 중")).toBeTruthy();
    expect(screen.getByText("진행 중 1 · 새 소식 0")).toBeTruthy();

    window.dispatchEvent(new CustomEvent("homecook:youtube-extraction-job-enqueued"));

    await waitFor(() => expect(screen.queryByText("추출 대기 중")).toBeNull());
    expect(await screen.findByRole("heading", { name: "YouTube 레시피" })).toBeTruthy();
  });

  it("marks exposed list rows seen, supports Escape, and gates retry by can_retry", async () => {
    const user = userEvent.setup();
    renderCenter();

    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 2개" }));
    expect(screen.getByRole("dialog", { name: "YouTube 추출 알림" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();

    await waitFor(() => {
      expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([
        successItem.job_id,
        failedItem.job_id,
      ]);
    });
    expect(screen.getByLabelText("YouTube 추출 알림 없음")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "YouTube 추출 알림" })).toBeNull();
  });

  it("keeps the badge unseen until the seen mutation succeeds and offers a retry", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem], next_cursor: null },
      error: null,
    });
    vi.mocked(api.markYoutubeExtractionSeen)
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: { code: "NETWORK_ERROR", message: "연결을 확인해 주세요.", fields: [] },
      })
      .mockResolvedValueOnce({ success: true, data: { seen_count: 1 }, error: null });
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));

    expect(await screen.findByRole("button", { name: "확인 상태 다시 저장" })).toBeTruthy();
    expect(screen.getByLabelText("YouTube 추출 알림 1개")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "확인 상태 다시 저장" }));
    await waitFor(() => expect(screen.getByLabelText("YouTube 추출 알림 없음")).toBeTruthy());
  });

  it("marks seen when the user follows a toast CTA, not when merely delivered", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem], next_cursor: null },
      error: null,
    });
    const user = userEvent.setup();

    renderCenter();
    const cta = await screen.findByRole("link", { name: "결과 확인" });
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    expect(api.markYoutubeExtractionSeen).not.toHaveBeenCalled();
    await user.click(cta);

    expect(api.markYoutubeExtractionSeen).toHaveBeenCalledWith([successItem.job_id]);
  });

  it("recovers a pending job after navigation or restart and refreshes terminal notifications", async () => {
    window.sessionStorage.setItem(
      "homecook.youtube-extraction-jobs",
      JSON.stringify([successItem.job_id]),
    );
    vi.mocked(api.fetchYoutubeExtractionJob).mockResolvedValue({
      success: true,
      data: {
        job_id: successItem.job_id,
        status: "succeeded",
        submitted_at: successItem.submitted_at,
        started_at: successItem.submitted_at,
        completed_at: successItem.completed_at,
        result: successItem.result,
        error: null,
        can_retry: false,
      },
      error: null,
    });

    renderCenter();

    await waitFor(() => expect(api.fetchYoutubeExtractionJob).toHaveBeenCalledWith(successItem.job_id));
    await waitFor(() => expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledTimes(2));
    expect(window.sessionStorage.getItem("homecook.youtube-extraction-jobs")).toBe("[]");
  });

  it("shows only a login return action when the session expires", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
    });

    renderCenter();

    const login = await screen.findByRole("link", { name: "로그인하고 돌아오기" });
    expect(login.getAttribute("href")).toContain("/login?next=");
    expect(screen.getByRole("button", { name: "로그인 안내 닫기" })).toBeTruthy();
    expect(login.closest("aside")?.className).not.toContain("top-[");
    expect(screen.queryByText("매콤한 두부조림")).toBeNull();
    expect(screen.queryByText("YouTube 레시피")).toBeNull();
  });

  it("keeps mobile toasts below primary controls and uses a compact mobile row", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [successItem], next_cursor: null },
      error: null,
    });
    const user = userEvent.setup();
    renderCenter();

    const toast = await screen.findByTestId("youtube-notification-toast-stack");
    expect(toast.className).toContain("bottom-");
    expect(toast.className).toContain("sm:top-");
    await user.click(screen.getByRole("button", { name: "YouTube 추출 알림 1개" }));
    const row = screen.getByRole("article", { name: "YouTube 레시피" });
    expect(row.className).toContain("grid-cols-[48px_minmax(0,1fr)]");
  });

  it("uses the official retry label and exact retry body for quota failures", async () => {
    const quotaItem = {
      ...failedItem,
      can_retry: true,
      error: {
        code: "QUOTA_EXCEEDED" as const,
        message: "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.",
        retryable: true,
      },
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockResolvedValue({
      success: true,
      data: { items: [quotaItem], next_cursor: null },
      error: null,
    });
    vi.mocked(api.enqueueYoutubeExtraction).mockResolvedValue({
      success: true,
      data: {
        job_id: "33333333-3333-4333-8333-333333333333",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-14T02:00:00.000Z",
      },
      error: null,
    });
    vi.mocked(api.fetchYoutubeExtractionJob).mockResolvedValue({
      success: true,
      data: {
        ...activeJob,
        job_id: "33333333-3333-4333-8333-333333333333",
      },
      error: null,
    });
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    await user.click(screen.getByRole("button", { name: "나중에 다시 시도" }));

    expect(api.enqueueYoutubeExtraction).toHaveBeenCalledWith({
      retry_job_id: quotaItem.job_id,
    });
    expect(JSON.parse(window.sessionStorage.getItem("homecook.youtube-extraction-jobs") ?? "[]"))
      .toContain("33333333-3333-4333-8333-333333333333");

    await user.click(await screen.findByRole("button", { name: /YouTube 추출 알림/ }));
    expect(await screen.findByText("추출 대기 중")).toBeTruthy();
  });

  it("keeps the archive response after switching tabs", async () => {
    const archiveItem = {
      ...successItem,
      seen_at: "2026-08-14T02:00:00.000Z",
      video_title_snapshot: "감자 수프 archive",
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view) => ({
      success: true,
      data: {
        items: view === "archive" ? [archiveItem] : [successItem],
        next_cursor: null,
      },
      error: null,
    }));
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    await user.click(screen.getByRole("tab", { name: "지난 알림" }));

    expect(await screen.findByRole("heading", { name: "감자 수프 archive" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "YouTube 레시피" })).toBeNull();
  });

  it.each(["focus", "online"] as const)(
    "refreshes unseen notifications in the background on %s while preserving the archive view",
    async (eventName) => {
      const archiveItem = {
        ...successItem,
        seen_at: "2026-08-14T02:00:00.000Z",
        video_title_snapshot: "감자 수프 archive",
      };
      const foregroundItem = {
        ...failedItem,
        job_id: "99999999-9999-4999-8999-999999999999",
        delivery_key: "delivery-foreground",
        video_title_snapshot: "새로 끝난 두부조림",
      };
      let unseenItems: Array<typeof successItem | typeof failedItem> = [successItem];
      vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view) => ({
        success: true,
        data: {
          items: view === "archive" ? [archiveItem] : unseenItems,
          next_cursor: null,
        },
        error: null,
      }));
      const user = userEvent.setup();

      renderCenter();
      await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
      await user.click(screen.getByRole("tab", { name: "지난 알림" }));
      expect(await screen.findByRole("heading", { name: "감자 수프 archive" })).toBeTruthy();

      unseenItems = [successItem, foregroundItem];
      act(() => window.dispatchEvent(new Event(eventName)));

      expect(await screen.findByLabelText("YouTube 추출 알림 2개")).toBeTruthy();
      expect(await screen.findByText("레시피 추출 2건이 끝났어요")).toBeTruthy();
      expect(screen.getByRole("tab", { name: "지난 알림" }).getAttribute("aria-selected"))
        .toBe("true");
      expect(screen.getByRole("heading", { name: "감자 수프 archive" })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "새로 끝난 두부조림" })).toBeNull();
    },
  );

  it("implements complete keyboard tab semantics for notification views", async () => {
    const user = userEvent.setup();
    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 2개" }));

    const unseenTab = screen.getByRole("tab", { name: "새 알림" });
    const archiveTab = screen.getByRole("tab", { name: "지난 알림" });
    expect(unseenTab.getAttribute("aria-controls")).toBe("youtube-extraction-unseen-panel");
    expect(unseenTab.getAttribute("tabindex")).toBe("0");
    expect(archiveTab.getAttribute("tabindex")).toBe("-1");
    unseenTab.focus();

    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(archiveTab);
    expect(archiveTab.getAttribute("aria-selected")).toBe("true");
    expect(archiveTab.getAttribute("aria-controls")).toBe("youtube-extraction-archive-panel");
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("youtube-extraction-archive-panel");
    expect(panel.getAttribute("aria-labelledby")).toBe("youtube-extraction-archive-tab");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(unseenTab);
    expect(unseenTab.getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(archiveTab);
    expect(archiveTab.getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(unseenTab);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(archiveTab);
  });

  it("announces and displays the official completed time in current and archive rows", async () => {
    const archiveItem = {
      ...successItem,
      seen_at: "2026-08-14T02:00:00.000Z",
      video_title_snapshot: "완료 시각 archive",
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view) => ({
      success: true,
      data: { items: view === "archive" ? [archiveItem] : [successItem], next_cursor: null },
      error: null,
    }));
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    expect(screen.getByLabelText("완료 시각 2026년 8월 14일 오전 10:03").getAttribute("datetime"))
      .toBe(successItem.completed_at);

    await user.click(screen.getByRole("tab", { name: "지난 알림" }));
    expect((await screen.findByLabelText("완료 시각 2026년 8월 14일 오전 10:03")).getAttribute("datetime"))
      .toBe(successItem.completed_at);
  });

  it("uses the exact archive empty copy", async () => {
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view) => ({
      success: true,
      data: { items: view === "archive" ? [] : [successItem], next_cursor: null },
      error: null,
    }));
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    await user.click(screen.getByRole("tab", { name: "지난 알림" }));

    expect(await screen.findByText("완료된 추출 작업이 없어요.")).toBeTruthy();
    expect(screen.queryByText("표시할 알림이 없어요.")).toBeNull();
  });

  it("appends cursor pages without duplicates and preserves list scroll and focus", async () => {
    const archiveFirst = {
      ...successItem,
      seen_at: "2026-08-14T02:00:00.000Z",
      video_title_snapshot: "감자 수프 page one",
    };
    const archiveSecond = {
      ...failedItem,
      job_id: "55555555-5555-4555-8555-555555555555",
      seen_at: "2026-08-14T02:05:00.000Z",
      video_title_snapshot: "두부조림 page two",
    };
    vi.mocked(api.fetchYoutubeExtractionNotifications).mockImplementation(async (view, options) => {
      if (view !== "archive") {
        return { success: true, data: { items: [successItem], next_cursor: null }, error: null };
      }
      if (options?.cursor === "cursor-2") {
        return {
          success: true,
          data: { items: [archiveFirst, archiveSecond], next_cursor: null },
          error: null,
        };
      }
      return {
        success: true,
        data: { items: [archiveFirst], next_cursor: "cursor-2" },
        error: null,
      };
    });
    const user = userEvent.setup();

    renderCenter();
    await user.click(await screen.findByRole("button", { name: "YouTube 추출 알림 1개" }));
    await user.click(screen.getByRole("tab", { name: "지난 알림" }));
    const list = await screen.findByTestId("youtube-notification-list");
    const loadMore = await screen.findByRole("button", { name: "알림 더 보기" });
    Object.defineProperty(list, "scrollTop", { configurable: true, value: 36, writable: true });
    loadMore.focus();

    await user.click(loadMore);

    expect(await screen.findByRole("heading", { name: "두부조림 page two" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "감자 수프 page one" })).toHaveLength(1);
    expect(list.scrollTop).toBe(36);
    expect(document.activeElement).toBe(list);
    expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledWith("archive", {
      cursor: "cursor-2",
    });
  });

  it("keeps the drawer above the app header and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderCenter();
    const trigger = await screen.findByRole("button", { name: "YouTube 추출 알림 2개" });
    trigger.focus();

    await user.click(trigger);

    const overlay = screen.getByTestId("youtube-notification-overlay");
    expect(overlay.className).toContain("z-[500]");
    expect(screen.getByRole("heading", { name: "YouTube 추출 알림" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "알림 닫기" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the stable header trigger when the grouped-toast opener unmounts", async () => {
    const user = userEvent.setup();
    renderCenter();
    const headerTrigger = await screen.findByRole("button", { name: "YouTube 추출 알림 2개" });
    const toastOpener = await screen.findByRole("button", { name: "알림 보기" });

    await user.click(toastOpener);
    toastOpener.closest("article")?.remove();
    await user.click(screen.getByRole("button", { name: "알림 닫기" }));

    expect(document.activeElement).toBe(headerTrigger);
  });
});
