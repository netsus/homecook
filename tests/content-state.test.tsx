// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContentState } from "@/components/shared/content-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

describe("prototype-derived state UI primitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks ContentState as prototype-derived and removes the legacy glass shell", () => {
    render(
      <ContentState
        actionLabel="다시 시도"
        description="잠시 후 다시 불러올 수 있어요."
        onAction={vi.fn()}
        tone="error"
        title="불러오지 못했어요"
      />,
    );

    const shell = screen
      .getByRole("heading", { name: "불러오지 못했어요" })
      .closest("[data-state-kind='prototype-derived']");

    expect(shell).not.toBeNull();
    expect(shell?.getAttribute("data-state-tone")).toBe("error");
    expect(shell?.className).not.toContain("glass-panel");
    expect(screen.getByRole("button", { name: "다시 시도" }).className).toContain(
      "min-h-[var(--control-height-md)]",
    );
  });

  it("marks Skeleton blocks as Wave1-derived placeholders", () => {
    render(<Skeleton data-testid="state-skeleton" height={44} rounded="full" />);

    const skeleton = screen.getByTestId("state-skeleton");

    expect(skeleton.getAttribute("data-state-kind")).toBe("prototype-derived");
    expect(skeleton.getAttribute("data-state-tone")).toBe("skeleton");
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
  });

  it("centers login gates without a visible bordered card shell", () => {
    render(
      <ContentState
        description="로그인 후 이어서 사용할 수 있어요."
        safeBottomPadding
        tone="gate"
        title="이 화면은 로그인이 필요해요"
      />,
    );

    const shell = screen
      .getByRole("heading", { name: "이 화면은 로그인이 필요해요" })
      .closest("[data-state-kind='prototype-derived']");

    expect(shell?.className).toContain("min-h-[calc(100dvh-92px)]");
    expect(shell?.className).toContain("border-0");
    expect(shell?.className).toContain("shadow-none");
    expect(shell?.className).toContain("items-center");
  });

  it("keeps legacy EmptyState and ErrorState on the shared ContentState shell", () => {
    const retry = vi.fn();

    render(
      <>
        <EmptyState title="아직 없어요" description="새 항목을 추가해보세요." />
        <ErrorState
          message="네트워크 상태를 확인해 주세요."
          onRetry={retry}
          title="문제가 생겼어요"
        />
      </>,
    );

    const emptyShell = screen
      .getByRole("heading", { name: "아직 없어요" })
      .closest("[data-state-kind='prototype-derived']");
    const errorShell = screen
      .getByRole("heading", { name: "문제가 생겼어요" })
      .closest("[data-state-kind='prototype-derived']");

    expect(emptyShell?.getAttribute("data-state-tone")).toBe("empty");
    expect(errorShell?.getAttribute("data-state-tone")).toBe("error");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
