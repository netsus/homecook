// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YoutubeImportEntrySheet } from "@/components/planner/youtube-import-entry-sheet";
import { AppBackButton } from "@/components/shared/app-back-button";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: React.PropsWithChildren<{ href: string; prefetch?: boolean }>) => {
    void _prefetch;

    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("AppBackButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses the shared app back label by default", () => {
    render(<AppBackButton onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
  });

  it("keeps the YouTube entry sheet to one navigation back action", () => {
    render(
      <YoutubeImportEntrySheet
        onBack={vi.fn()}
        onClose={vi.fn()}
        targetLabel="4/18 아침"
        youtubeHref="/menu/add/youtube"
      />,
    );

    expect(screen.getByTestId("youtube-import-entry-back").getAttribute("aria-label")).toBe(
      "뒤로 가기",
    );
    expect(screen.queryByRole("button", { name: "뒤로" })).toBeNull();
    expect(screen.queryByRole("button", { name: "뒤로 가기" })).toBeTruthy();
  });

  it("keeps app navigation back labels on the shared wording", () => {
    const appBackSurfaces = [
      "components/leftovers/leftovers-screen.tsx",
      "components/leftovers/ate-list-screen.tsx",
      "components/mypage/mypage-mobile-screen.tsx",
      "components/mypage/mypage-screen.tsx",
      "components/recipe/recipe-detail-screen.tsx",
      "components/settings/settings-mobile-screen.tsx",
      "components/settings/settings-screen.tsx",
    ];

    for (const filePath of appBackSurfaces) {
      const source = readFileSync(filePath, "utf8");
      expect(source, filePath).not.toMatch(/aria-label="뒤로(?:가기)?"/);
    }
  });

  it("uses the shared app bar for the full-screen YouTube import back action", () => {
    const source = readFileSync("components/recipe/youtube-import-screen.tsx", "utf8");
    const screenBranch = source.slice(source.indexOf('if (presentation === "screen")'));

    expect(screenBranch).toContain("<AppBar");
    expect(screenBranch).toContain("onBack={handleBack}");
    expect(screenBranch).not.toMatch(
      /<WebButton onClick=\{handleBack\} variant="secondary">\s*뒤로\s*<\/WebButton>/u,
    );
  });
});
