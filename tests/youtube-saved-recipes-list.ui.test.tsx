// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YoutubeSavedRecipesScreen } from "@/components/recipe/youtube-saved-recipes-screen";
import { fetchYoutubeSavedRecipes } from "@/lib/api/youtube-saved-recipes";

vi.mock("@/lib/api/youtube-saved-recipes", () => ({ fetchYoutubeSavedRecipes: vi.fn() }));

describe("saved YouTube recipe discovery", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("shows an honest empty state with an import entry", async () => {
    vi.mocked(fetchYoutubeSavedRecipes).mockResolvedValue({ success: true, data: { drafts: [] }, error: null });
    render(<YoutubeSavedRecipesScreen />);
    expect(await screen.findByText("아직 보관한 레시피가 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "유튜브 레시피 가져오기" }).getAttribute("href")).toBe("/recipes/new/youtube");
  });

  it("reopens durable results rather than canonical recipe IDs", async () => {
    vi.mocked(fetchYoutubeSavedRecipes).mockResolvedValue({ success: true, data: { drafts: [{
      draft_id: "11111111-1111-4111-8111-111111111111", revision: 2, title: "된장찌개",
      thumbnail_url: null, created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:00:00Z",
    }] }, error: null });
    render(<YoutubeSavedRecipesScreen />);
    const link = await screen.findByRole("link", { name: /된장찌개/ });
    expect(link.getAttribute("href")).toBe("/recipes/youtube/saved/11111111-1111-4111-8111-111111111111");
  });

  it("keeps authorization errors visible and returns to this collection after login", async () => {
    vi.mocked(fetchYoutubeSavedRecipes).mockResolvedValue({ success: false, data: null,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] } });
    render(<YoutubeSavedRecipesScreen />);
    expect((await screen.findByRole("alert")).textContent).toContain("로그인이 필요해요.");
    expect(screen.getByRole("link", { name: "로그인하고 돌아오기" }).getAttribute("href"))
      .toBe("/login?next=%2Frecipes%2Fyoutube%2Fsaved");
    expect(screen.queryByText("아직 보관한 레시피가 없어요")).toBeNull();
  });

  it("retries a failed read without displaying a false empty collection", async () => {
    vi.mocked(fetchYoutubeSavedRecipes)
      .mockResolvedValueOnce({ success: false, data: null, error: { code: "NETWORK_ERROR", message: "연결 오류", fields: [] } })
      .mockResolvedValueOnce({ success: true, data: { drafts: [] }, error: null });
    render(<YoutubeSavedRecipesScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 보관한 레시피가 없어요")).toBeTruthy();
    expect(fetchYoutubeSavedRecipes).toHaveBeenCalledTimes(2);
  });
});
