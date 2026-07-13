// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AboutScreen } from "@/components/about/about-screen";

const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

afterEach(() => {
  cleanup();
  routerReplace.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("AboutScreen", () => {
  it("ships responsive guide styles with protected touch and anchor geometry", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toContain(".about-page {");
    expect(css).toMatch(/\.about-mobile-back\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
    expect(css).toMatch(/\.about-section\s*\{[^}]*scroll-margin-top:/);
    expect(css).toMatch(/\.about-accordion-trigger\s*\{[^}]*min-height:\s*52px;/);
    expect(css).toContain("@media (min-width: 1024px)");
  });

  it("renders the public guide hierarchy and approved destinations", () => {
    const { container } = render(<AboutScreen contactEmail="help@zipbap.example" />);

    expect(screen.getAllByRole("heading", { level: 1, name: "무엇을 먹든, 계획은 한곳에서" })).toHaveLength(1);
    expect(screen.getByText("한 끼는 이렇게 이어져요")).toBeTruthy();
    expect(screen.getByText("끼니 계획이 편해지는 이유")).toBeTruthy();
    expect(screen.getByText("WHY IT WORKS")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "무먹 가이드 목차" })).toBeTruthy();
    for (const id of ["how-to", "features", "guides", "faq"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(screen.getAllByRole("link", { name: "레시피 둘러보기" })[0]?.getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너 시작하기" }).getAttribute("href")).toBe("/planner");
    expect(screen.queryByRole("navigation", { name: "홈 하단 탭" })).toBeNull();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("uses real accordion buttons with connected ARIA panels", async () => {
    const user = userEvent.setup();
    render(<AboutScreen />);

    const trigger = screen.getByRole("button", { name: "처음 시작하기" });
    const panelId = trigger.getAttribute("aria-controls");

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(panelId).toBe("guide-panel-guide-start");
    expect(document.getElementById(panelId!)?.hasAttribute("hidden")).toBe(true);

    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(panelId!);
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(within(panel!).getByText("홈에서 제목을 검색하거나 태그를 선택해요.")).toBeTruthy();
  });

  it("renders a truthful contact link only when legal info provides an email", () => {
    const { rerender } = render(<AboutScreen />);

    expect(screen.queryByRole("link", { name: /이메일/ })).toBeNull();
    expect(screen.getByText("운영 문의처를 준비하고 있어요.")).toBeTruthy();

    rerender(<AboutScreen contactEmail="help@zipbap.example" />);

    expect(screen.getByRole("link", { name: "이메일로 문의하기" }).getAttribute("href")).toBe("mailto:help@zipbap.example");
  });

  it("returns a direct mobile visit to the HOME fallback", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/about");
    render(<AboutScreen />);

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(routerReplace).toHaveBeenCalledWith("/");
  });

  it("uses browser history after a verified same-origin HOME entry", async () => {
    const user = userEvent.setup();
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const entryHistoryLength = window.history.length;
    window.sessionStorage.setItem(
      "homecook:about-return",
      JSON.stringify({
        createdAt: Date.now(),
        historyLength: entryHistoryLength,
        href: "/",
      }),
    );
    window.history.pushState({}, "", "/about#how-to");
    render(<AboutScreen />);

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(historyBack).toHaveBeenCalledOnce();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("rejects an unsafe cross-origin return marker and falls back to HOME", async () => {
    const user = userEvent.setup();
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    window.sessionStorage.setItem(
      "homecook:about-return",
      JSON.stringify({
        createdAt: Date.now(),
        historyLength: window.history.length,
        href: "https://example.com/phishing",
      }),
    );
    window.history.pushState({}, "", "/about");
    render(<AboutScreen />);

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(historyBack).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/");
  });
});
