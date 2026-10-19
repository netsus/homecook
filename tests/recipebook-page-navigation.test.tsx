// @vitest-environment jsdom
import React from "react";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";
import RecipeBookDetailPage from "@/app/mypage/recipe-books/[book_id]/page";
const mocks = vi.hoisted(() => ({ authenticated: true, mobile: true, read: vi.fn(), detail: vi.fn(), router: { push: vi.fn(), replace: vi.fn() }, query: new URLSearchParams() }));
vi.mock("@/lib/auth/server-initial-auth", () => ({ getInitialAuthenticatedFromServer: async () => mocks.authenticated }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => mocks.query, usePathname: () => "/mypage/recipe-books/book" }));
vi.mock("@/components/shared/use-mobile-viewport", () => ({ useIsMobileViewport: () => mocks.mobile }));
vi.mock("@/lib/api/recipe", () => ({ fetchRecipeBookRecipes: mocks.read, fetchRecipeBookRecipeDetail: mocks.detail }));
vi.mock("@/components/auth/social-login-buttons", () => ({ SocialLoginButtons: () => null }));
vi.mock("@/components/shared/use-soft-keyboard-open", () => ({ useSoftKeyboardOpen: () => false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { mocks.authenticated = true; mocks.mobile = true; mocks.read.mockReset(); mocks.detail.mockReset(); });
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

it("pages desktop contents with the selection, preserves keyboard access and omits duplicate page dots", async () => {
  vi.stubGlobal("React", React); mocks.mobile = false;
  const items = Array.from({length: 17}, (_, index) => ({ recipe_id: `recipe-${index}`, title: `요리 ${index + 1}`, base_servings: 2, tags: [], thumbnail_url: null, view_count: 0, added_at: "2026-10-17", total_duration_text: null, total_duration_seconds: null }));
  mocks.read.mockResolvedValue({ success: true, data: { items, has_next: false, next_cursor: null }, error: null });
  mocks.detail.mockImplementation(async (_book: string, id: string) => ({success: true, data: {...items.find(item => item.recipe_id === id), ingredients: [], steps: []}, error: null}));
  render(await RecipeBookDetailPage({params: Promise.resolve({book_id: "book"}), searchParams: Promise.resolve({type:"custom",name:"QA"})}));
  const nav = await screen.findByRole("navigation", {name: "QA 목차"});
  await waitFor(() => expect(within(nav).getAllByRole("listitem")).toHaveLength(8));
  expect(within(nav).getByRole("button", {name: /01.*요리 1.*01쪽/}).getAttribute("aria-current")).toBe("page");
  const user = userEvent.setup(); await user.click(within(nav).getByRole("button", {name: "다음 목차"}));
  expect(within(nav).getByRole("button", {name: /09.*요리 9.*09쪽/}).getAttribute("aria-current")).toBe("page");
  const next = within(nav).getByRole("button", {name:"다음 목차"}); next.focus(); await user.keyboard("{Enter}");
  expect(within(nav).getAllByRole("listitem")).toHaveLength(1);
  expect(within(nav).getByRole("button", {name: /17.*요리 17.*17쪽/}).getAttribute("aria-current")).toBe("page");
  expect((within(nav).getByRole("button", {name:"다음 목차"}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(within(nav).getByRole("button", {name:"이전 목차"}));
  expect(within(nav).getAllByRole("listitem")).toHaveLength(8);
  expect(screen.queryByRole("group", {name:"페이지 선택"})).toBeNull();
});

it("keeps the selected recipe across mobile/desktop round trips", async () => {
  vi.stubGlobal("React", React); mocks.query = new URLSearchParams();
  const items = Array.from({length: 17}, (_, index) => ({ recipe_id: `recipe-${index}`, title: `요리 ${index + 1}`, base_servings: 2, tags: [], thumbnail_url: null, view_count: 0, added_at: "2026-10-17", total_duration_text: null, total_duration_seconds: null }));
  mocks.read.mockResolvedValue({ success: true, data: { items, has_next: false, next_cursor: null }, error: null });
  mocks.detail.mockImplementation(async (_book: string, id: string) => ({success: true, data: {...items.find(item => item.recipe_id === id), ingredients: [], steps: []}, error: null}));
  const book = () => <RecipeBookDetailScreen bookId="book" bookName="QA" bookType="custom" initialAuthenticated />;
  const view = render(book()), user = userEvent.setup();
  await user.click(await screen.findByRole("button", {name:"목차 열기"}));
  await user.click(screen.getByTestId("recipebook-mobile-toc-card-recipe-12"));
  expect(screen.getByRole("heading", {name:"요리 13"})).toBeTruthy();
  mocks.mobile = false; view.rerender(book());
  const nav = await screen.findByRole("navigation", {name:"QA 목차"});
  expect(within(nav).getByText("2 / 3")).toBeTruthy();
  expect(within(nav).getByRole("button", {name:/13.*요리 13.*13쪽/}).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("heading", {name:"요리 13"})).toBeTruthy();
  await user.click(within(nav).getByRole("button", {name:"다음 목차"}));
  expect(screen.getByRole("heading", {name:"요리 17"})).toBeTruthy();
  mocks.mobile = true; view.rerender(book());
  expect(screen.getByRole("heading", {name:"요리 17"})).toBeTruthy();
  await user.click(screen.getByRole("button", {name:"이전 레시피"}));
  expect(screen.getByRole("heading", {name:"요리 16"})).toBeTruthy();
  await user.click(screen.getByRole("button", {name:"다음 레시피"}));
  expect(screen.getByRole("heading", {name:"요리 17"})).toBeTruthy();
});
