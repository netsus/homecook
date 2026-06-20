// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotFound from "@/app/not-found";

describe("NotFound", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.clear();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "http://localhost:3000/planner",
    });
    window.history.pushState({}, "", "/missing-page?secret=query");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers clear recovery links from the 404 page", () => {
    const { container } = render(<NotFound />);

    expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeTruthy();
    expect(screen.getByText("주소가 바뀌었어요. 홈에서 다시 찾아보세요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너로" }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("navigation", { name: "하단 탭" })).toBeTruthy();
    expect(container.querySelector(".not-found-desktop-nav")).toBeTruthy();
    expect(container.querySelector(".not-found-mobile-tabs")).toBeTruthy();
  });

  it("lets users send inline 404 feedback with page context", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { received: true },
          error: null,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const user = userEvent.setup();

    render(<NotFound />);

    await user.type(
      screen.getByLabelText("404 피드백"),
      "플래너에서 오래된 링크를 눌렀어요.",
    );
    await user.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => {
      expect(screen.getByText("보내주셔서 고마워요. 확인 후 개선할게요.")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/feedback/404",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, string>;
    expect(body.message).toBe("플래너에서 오래된 링크를 눌렀어요.");
    expect(body.current_url).toContain("/missing-page");
    expect(body.referrer).toBe("http://localhost:3000/planner");
    expect(body.anonymous_id).toMatch(/^anon_/u);
    expect((screen.getByLabelText("404 피드백") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps recovery links usable when feedback submission fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND_FEEDBACK_WRITE_FAILED",
            message: "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
            fields: [],
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 500,
        },
      ),
    );
    const user = userEvent.setup();

    render(<NotFound />);

    await user.type(screen.getByLabelText("404 피드백"), "깨진 링크 같아요.");
    await user.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => {
      expect(screen.getByText("피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: "홈으로" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "플래너로" })).toBeTruthy();
  });
});
