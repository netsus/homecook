// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";

describe("AppFeedbackToast", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses the same visual shell as growth notifications for local success feedback", () => {
    render(<AppFeedbackToast message="저장했어요" tone="success" />);

    const toast = screen.getByTestId("app-feedback-toast");
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.className).toContain("rounded-[var(--radius-card)]");
    expect(toast.className).toContain("growth-toast-card-xp");
    expect(toast.className).toContain("border-[var(--growth-toast-xp-border)]");
    expect(toast.textContent).toContain("저장했어요");
  });

  it("keeps local error feedback in the shared shell without archiving it", () => {
    render(<AppFeedbackToast message="저장하지 못했어요" tone="error" />);

    const toast = screen.getByTestId("app-feedback-toast");
    expect(toast.getAttribute("data-feedback-tone")).toBe("error");
    expect(toast.className).toContain("app-feedback-toast-error");
    expect(toast.className).toContain("rounded-[var(--radius-card)]");
    expect(toast.textContent).toContain("저장하지 못했어요");
  });
});
