// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RecipeBookDetailPage from "@/app/mypage/recipe-books/[book_id]/page";
const mocks = vi.hoisted(() => ({ authenticated: true, read: vi.fn(), detail: vi.fn(), router: { push: vi.fn(), replace: vi.fn() }, query: new URLSearchParams() }));
vi.mock("@/lib/auth/server-initial-auth", () => ({ getInitialAuthenticatedFromServer: async () => mocks.authenticated }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => mocks.query, usePathname: () => "/mypage/recipe-books/book" }));
vi.mock("@/components/shared/use-mobile-viewport", () => ({ useIsMobileViewport: () => true }));
vi.mock("@/lib/api/recipe", () => ({ fetchRecipeBookRecipes: mocks.read, fetchRecipeBookRecipeDetail: mocks.detail }));
vi.mock("@/components/auth/social-login-buttons", () => ({ SocialLoginButtons: () => null }));
vi.mock("@/components/shared/use-soft-keyboard-open", () => ({ useSoftKeyboardOpen: () => false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { mocks.authenticated = true; mocks.read.mockReset(); mocks.detail.mockReset(); });
it.each(["loading", "empty", "error", "guest", "ready"])("keeps exactly one shared mobile tab bar in %s state", async state => {
  vi.stubGlobal("React", React);
  mocks.authenticated = state !== "guest";
  const item = { recipe_id: "recipe", title: "QA", base_servings: 2, tags: [], thumbnail_url: null, view_count: 0, added_at: "2026-10-17", total_duration_text: null, total_duration_seconds: null };
  mocks.read.mockImplementation(() => state === "loading" ? new Promise(() => {}) : Promise.resolve(state === "error"
    ? { success: false, data: null, error: { code: "ERROR", message: "QA 읽기 오류", fields: [] } }
    : { success: true, data: { items: state === "ready" ? [item] : [], has_next: false, next_cursor: null }, error: null }));
  mocks.detail.mockResolvedValue({ success: true, data: { ...item, ingredients: [], steps: [] }, error: null });
  render(await RecipeBookDetailPage({ params: Promise.resolve({ book_id: "book" }), searchParams: Promise.resolve({ type: "custom", name: "QA" }) }));
  if (state === "empty") await screen.findByText("아직 이 레시피북에 레시피가 없어요");
  if (state === "error") await screen.findByText("QA 읽기 오류");
  if (state === "guest") await screen.findByText("이 화면은 로그인이 필요해요");
  if (state === "ready") await waitFor(() => expect(mocks.detail).toHaveBeenCalled());
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  const nav = screen.getByRole("navigation", { name: "하단 탭" });
  expect(within(nav).getAllByRole("link")).toHaveLength(5);
  expect(within(nav).getByRole("link", { name: "마이" }).getAttribute("aria-current")).toBe("page");
});
