// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MealLogScreen } from "@/components/planner/meal-log-screen";
import { createGuestMealLogDay } from "@/lib/planner/guest-planner-preview";
const api = vi.hoisted(() => ({ fetch: vi.fn(), remove: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogDay: api.fetch, deleteMealLogEntry: api.remove, createMealLogEntry: api.create, updateMealLogEntry: vi.fn(), isMealLogApiError: () => false }));
vi.mock("@/components/planner/meal-log-add-sheet", () => ({ MealLogAddSheet: ({ date, onSave }: { date: string; onSave: (selection: unknown, columnId: string) => void }) => <button onClick={() => onSave({ amount: 100, unit: "g", id: "source", type: "cooked_batch" }, "column")}>save {date}</button> }));
const props = { date: "2026-09-06", showDateNavigation: false, onDateChange: vi.fn(), onUnauthorized: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true"); sessionStorage.clear(); api.fetch.mockImplementation(async (date: string) => createGuestMealLogDay(date)); api.remove.mockResolvedValue({}); api.create.mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("renders seven scrollable date cards with server nutrition tiles and textual food macros", async () => {
  const view = render(<MealLogScreen {...props} guest />);
  expect(view.container.querySelectorAll("[data-planner-date]")).toHaveLength(7);
  const monday = screen.getByRole("region", { name: "8월 31일 월요일 식사 기록" });
  expect(within(monday).getByRole("region", { name: "하루 영양" }).querySelectorAll("dd")).toHaveLength(4);
  expect(within(monday).queryByRole("img", { name: /탄단지/ })).toBeNull();
  expect(screen.getByText("1,607")).toBeTruthy();
});
it("uses the clicked day's authority for add even when selected date has not rerendered", async () => {
  render(<MealLogScreen {...props} />);
  const monday = await screen.findByRole("region", { name: "8월 31일 월요일 식사 기록" });
  await waitFor(() => expect(within(monday).getAllByRole("button", { name: /먹은 음식 추가/ })).toHaveLength(3));
  await userEvent.setup().click(within(monday).getAllByRole("button", { name: /먹은 음식 추가/ })[0]);
  await userEvent.setup().click(screen.getByRole("button", { name: "save 2026-08-31" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ consumedLocalDate: "2026-08-31" }), expect.any(String)));
});
it("passes the clicked guest day into the login gate", async () => {
  const login = vi.fn();
  render(<MealLogScreen {...props} guest onLoginRequired={login} />);
  const monday = screen.getByRole("region", { name: "8월 31일 월요일 식사 기록" });
  await userEvent.setup().click(within(monday).getAllByRole("button", { name: /먹은 음식 추가/ })[0]);
  expect(login).toHaveBeenCalledWith("2026-08-31");
});
it("keeps a delete tied to the clicked day while the selected date changes", async () => {
  const view = render(<MealLogScreen {...props} />);
  const monday = await screen.findByRole("region", { name: "8월 31일 월요일 식사 기록" });
  const user = userEvent.setup();
  const remove = await within(monday).findAllByRole("button", { name: /식사 기록 삭제/ });
  await user.click(remove[0]);
  const callsBefore = api.fetch.mock.calls.length;
  view.rerender(<MealLogScreen {...props} date="2026-09-02" />);
  expect(api.fetch.mock.calls).toHaveLength(callsBefore);
  const dialog = screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" });
  await user.click(within(dialog).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(api.fetch).toHaveBeenLastCalledWith("2026-08-31"));
});
it("keeps successful dates visible while a failed date has no mutation buttons", async () => {
  api.fetch.mockImplementation(async (date: string) => { if (date === "2026-09-01") throw new Error("일시적인 오류"); return createGuestMealLogDay(date); });
  render(<MealLogScreen {...props} />);
  const monday = await screen.findByRole("region", { name: "8월 31일 월요일 식사 기록" });
  expect(await within(monday).findByText("그릭요거트 볼")).toBeTruthy();
  const tuesday = screen.getByRole("region", { name: "9월 1일 화요일 식사 기록" });
  expect(within(tuesday).getByText(/이 날짜의 기록을 확인하지 못했어요/)).toBeTruthy();
  expect(within(tuesday).queryByRole("button")).toBeNull();
});
it("provides stable guest food placement, unique DOM ids and no private reads when dates change", () => {
  const view = render(<MealLogScreen {...props} guest />);
  const foodCard = screen.getByText("그릭요거트 볼").closest("[data-planner-date]")?.getAttribute("data-planner-date");
  view.rerender(<MealLogScreen {...props} date="2026-09-02" guest />);
  expect(screen.getByText("그릭요거트 볼").closest("[data-planner-date]")?.getAttribute("data-planner-date")).toBe(foodCard);
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(api.fetch).not.toHaveBeenCalled();
});
it("reports readiness after all dates settle and does not report cached weeks before a refetch", async () => {
  const ready = vi.fn();
  const view = render(<MealLogScreen {...props} onDaysReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalledWith("2026-08-31"));
  view.rerender(<MealLogScreen {...props} date="2026-09-07" onDaysReady={ready} />);
  await waitFor(() => expect(ready).toHaveBeenCalledWith("2026-09-07"));
  ready.mockClear();
  const resolvers: Array<() => void> = [];
  api.fetch.mockImplementation((date: string) => new Promise((resolve) => resolvers.push(() => resolve(createGuestMealLogDay(date)))));
  view.rerender(<MealLogScreen {...props} onDaysReady={ready} />);
  expect(ready).not.toHaveBeenCalled();
  await import("@testing-library/react").then(({ act }) => act(async () => { resolvers.forEach((resolve) => resolve()); }));
  await waitFor(() => expect(ready).toHaveBeenCalledWith("2026-08-31"));
});
