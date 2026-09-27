// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecipeCookingEntry } from "@/components/cooking/recipe-cooking-entry";
const mocks = vi.hoisted(() => ({ read: vi.fn(), start: vi.fn(), router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/shared/use-app-return", () => ({ useAppReturn: () => ({ href: "/recipebooks/book-1" }) }));
vi.mock("@/components/shared/use-mobile-fullscreen-page", () => ({ useMobileFullscreenPage: vi.fn() }));
vi.mock("@/lib/api/fetch-json", () => ({ fetchJson: mocks.read, isApiFetchError: (e: object) => "status" in e }));
vi.mock("@/lib/api/cooking", () => ({ createSnapshotV2CookingSession: mocks.start, isCookingApiError: (e: object) => "status" in e }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ id: "recipe-1", revision: 7 });
  mocks.start.mockReset().mockResolvedValue({ session_id: "session-1", contract_version: "snapshot_v2" });
});
afterEach(cleanup);
it("starts one pinned session from a book link and preserves return context under Strict Mode", async () => {
  render(<StrictMode><RecipeCookingEntry initialAuthenticated recipeId="recipe-1" servings={2} /></StrictMode>);
  await waitFor(() => expect(mocks.router.replace).toHaveBeenCalled());
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(mocks.start).toHaveBeenCalledWith({ mode: "standalone", recipe_id: "recipe-1", expected_recipe_revision: 7, cooking_servings: 2 }, expect.any(String));
  const url = new URL(mocks.router.replace.mock.calls[0][0], "http://localhost");
  expect(url.pathname).toBe("/cooking/session-attempts/session-1/cook-mode");
  expect(url.searchParams.get("returnTo")).toBe("/recipebooks/book-1");
});
it("retries an uncertain creation using the same body and key", async () => {
  mocks.start.mockRejectedValueOnce(new Error("connection lost"));
  render(<RecipeCookingEntry initialAuthenticated recipeId="recipe-1" servings={2} />);
  await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(mocks.router.replace).toHaveBeenCalled());
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.start.mock.calls[1]).toEqual(mocks.start.mock.calls[0]);
});
it("does not create a cooking session before login", () => {
  render(<RecipeCookingEntry initialAuthenticated={false} recipeId="recipe-1" servings={2} />);
  expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toContain("next=");
  expect(mocks.start).not.toHaveBeenCalled();
});
