// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { notifyCookedBatchChanged } from "@/lib/cooked-batch-events";
import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

function selectedDay() {
  return within(screen.getByRole("region", { name: "8월 10일 월요일 식사 기록", hidden: true }));
}
async function openBreakfast(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("region", { name: "8월 10일 월요일 식사 기록" });
  await user.click(await selectedDay().findByRole("button", { name: "아침에 먹은 음식 추가" }));
  await user.click(screen.getByRole("tab", { name: "요리한 음식" }));
}

describe("MEAL_LOG add sheet", () => {
  afterEach(cleanup);

  it("keeps the chosen date and meal through food selection and saves without target selectors", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ includeCookedBatch: true });
    await openBreakfast(user);
    expect(screen.getByRole("heading", { name: "8월 10일 아침" })).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const sheet = screen.getByRole("dialog", { name: "먹은 음식 추가" });
    expect(within(sheet).getByRole("heading", { name: "8월 10일 아침" })).toBeTruthy();
    expect(within(sheet).queryByLabelText("먹은 날짜")).toBeNull();
    expect(within(sheet).queryByRole("combobox", { name: "끼니" })).toBeNull();
    const amount = within(sheet).getByRole("textbox", { name: "먹은 양" });
    await user.clear(amount);
    await user.type(amount, "50");
    await user.click(within(sheet).getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST")).toBe(true));
    const request = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST")!;
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({
      consumed_local_date: "2026-08-10",
      meal_plan_column_id: "20000000-0000-4000-8000-000000000001",
      quantity: { amount: 50, unit: "g" },
    });
  });

  it("submits the amount with Enter but ignores composition, repeat, and an invalid amount", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ includeCookedBatch: true });
    await openBreakfast(user);
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const amount = screen.getByRole("textbox", { name: "먹은 양" });
    const saves = () => fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST");
    await user.clear(amount);
    fireEvent.keyDown(amount, { key: "Enter" });
    expect(saves()).toHaveLength(0);
    await user.type(amount, "50");
    fireEvent.keyDown(amount, { key: "Enter", isComposing: true });
    fireEvent.keyDown(amount, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(amount, { key: "Enter", repeat: true });
    expect(saves()).toHaveLength(0);
    fireEvent.keyDown(amount, { key: "Enter" });
    fireEvent.keyDown(amount, { key: "Enter" });
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(JSON.parse(String(saves()[0][1]?.body)).quantity).toEqual({ amount: 50, unit: "g" });
  });

  it("retains the amount sheet when selection dragging ends on the backdrop", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ includeCookedBatch: true });
    await openBreakfast(user);
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const dialog = screen.getByRole("dialog", { name: "먹은 음식 추가" });
    const amount = within(dialog).getByRole("textbox", { name: "먹은 양" });
    await user.clear(amount);
    await user.type(amount, "50");
    await user.pointer([{ target: amount, keys: "[MouseLeft>]" }, { target: dialog.parentElement!, keys: "[/MouseLeft]" }]);
    expect(screen.getByRole("textbox", { name: "먹은 양" })).toBe(amount);
    expect(screen.queryByRole("button", { name: "계속 편집" })).toBeNull();
    await user.click(dialog.parentElement!);
    expect(screen.getByRole("button", { name: "계속 편집" })).toBeTruthy();
  });

  it("hides depleted foods instead of offering an action that will fail", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ includeCookedBatch: true, batchStatus: "depleted", batchRemainingWeight: 0 });
    await openBreakfast(user);
    await screen.findByText("요리한 음식 전체");
    await waitFor(() => expect(screen.queryByRole("status", { name: "음식 목록 불러오는 중" })).toBeNull());
    expect(screen.queryByText("된장찌개")).toBeNull();
  });

  it("invalidates a selected batch immediately after an acknowledged depletion", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ includeCookedBatch: true });
    await openBreakfast(user);
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    expect(screen.getByRole("button", { name: "기록 저장" })).toBeTruthy();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (!String(input).includes("/cooked-batches")) return response;
      const body = await response.json();
      body.data.items = body.data.items.map((batch: object) => ({ ...batch, status: "eaten", remaining_weight_g: 0, batch_status: "depleted", depleted_reason: "consumed" }));
      return new Response(JSON.stringify(body), { status: 200 });
    });
    act(() => notifyCookedBatchChanged("40000000-0000-4000-8000-000000000001"));
    expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("status", { name: "음식 목록 불러오는 중" })).toBeNull());
    expect(screen.queryByText("된장찌개")).toBeNull();
  });

  it("does not restore a depleted food from an older pending list response", async () => {
    const user = userEvent.setup();
    const { fetchMock, releaseBatchLoad, settledBatchCursors } = renderMealLogShell({ includeCookedBatch: true, deferBatchLoad: true });
    await openBreakfast(user);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/cooked-batches"))).toBe(true));
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => String(input).includes("/cooked-batches")
      ? new Response(JSON.stringify({ success: true, data: { items: [], has_next: false, next_cursor: null }, error: null }))
      : original(input, init));
    act(() => notifyCookedBatchChanged("40000000-0000-4000-8000-000000000001"));
    await waitFor(() => expect(screen.queryByRole("status", { name: "음식 목록 불러오는 중" })).toBeNull());
    await act(async () => { releaseBatchLoad(null); });
    await waitFor(() => expect(settledBatchCursors()).toContain(null));
    expect(screen.queryByText("된장찌개")).toBeNull();
  });

  it("keeps search and results in one scroller and explains an empty result", async () => {
    const user = userEvent.setup();
    renderMealLogShell();
    await openBreakfast(user);
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    expect(screen.getByTestId("meal-log-source-scroll").contains(input)).toBe(true);
    await user.type(input, "없는음식");
    expect(screen.getByRole("status", { name: "제품·재료 검색 중" })).toBeTruthy();
    expect(await screen.findByText("검색 결과가 없어요. 다른 제품·재료 이름으로 찾아보세요.")).toBeTruthy();
  });

  it("keeps a cleared quantity empty, rejects zero and below-minimum amounts, and saves 12.5 once", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();
    await openBreakfast(user);
    await user.click(screen.getByRole("tab", { name: "최근" }));
    await user.click(await screen.findByRole("button", { name: /달걀/u }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" });
    const save = screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" });
    await user.clear(amount);
    expect(amount.value).toBe(""); expect(save.disabled).toBe(true);
    await user.click(save);
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST").map(([url, init]) => [String(url), init?.body])).toEqual([]);
    for (const invalid of ["0", "0.001"]) {
      await user.clear(amount); await user.type(amount, invalid);
      expect(save.disabled).toBe(true);
    }
    await user.clear(amount); await user.type(amount, "12.");
    expect(amount.value).toBe("12.");
    await user.type(amount, "5"); await user.click(save);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST")).toHaveLength(1));
    const post = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/meal-log/entries") && init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body)).quantity.amount).toBe(12.5);
  });

  it("opens the contracted recent, cooked-batch, and search sources", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await openBreakfast(user);
    const dialog = screen.getByRole("dialog", { name: "먹은 음식 추가" });
    expect(dialog.className.split(" ")).toContain("h-[78dvh]");
    expect(screen.getByText("8월 10일 아침")).toBeTruthy();
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "요리한 음식" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "제품·재료" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    const cookedTab = screen.getByRole("tab", { name: "요리한 음식" });
    cookedTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "제품·재료" }).getAttribute("aria-selected"))
      .toBe("true");
    expect(screen.queryByText("최근·자주 먹은 음식")).toBeNull();
    expect(screen.queryByRole("button", { name: /달걀/ })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "최근" }));
    expect(await screen.findByRole("button", { name: /달걀/ })).toBeTruthy();
    expect(screen.queryByText("최근·자주 먹은 음식")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "요리한 음식" }));
    expect(screen.queryByRole("button", { name: /달걀/ })).toBeNull();
  });

  it("truncates long recent names visually while retaining the full accessible name", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();
    const original = fetchMock.getMockImplementation()!;
    const title = "정말 길어서 한 줄을 넘을 수 있는 내가 직접 만든 달걀 요리 이름";
    fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (!String(input).includes("/meal-log/recent")) return response;
      const body = await response.json();
      body.data.items[0].display_name = title;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    await openBreakfast(user);
    await user.click(screen.getByRole("tab", { name: "최근" }));
    const button = await screen.findByRole("button", { name: new RegExp(title) });
    const name = within(button).getByText(title);
    expect(name.className).toContain("truncate");
    expect(name.getAttribute("title")).toBe(title);
  });

  it("requires the suggested recent amount to be reviewed before save", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await openBreakfast(user);
    await user.click(screen.getByRole("tab", { name: "최근" }));
    await user.click(await screen.findByRole("button", { name: /달걀/u }));
    const save = screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText("제안된 양을 확인해 주세요.")).toBeTruthy();

    await user.click(screen.getByRole("textbox", { name: "먹은 양" }));
    await user.tab();
    expect(save.disabled).toBe(false);
  });

  it("fails closed when cooked-batch grams exceed the authoritative remainder", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ includeCookedBatch: true });

    await openBreakfast(user);
    expect(await screen.findByText(/8월 9일 조리/u)).toBeTruthy();
    expect(screen.getByText(/남은 양 80g/u)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const amount = screen.getByRole("textbox", { name: "먹은 양" });
    await user.clear(amount);
    await user.type(amount, "81");

    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText("남은 양 80g 이하로 입력해 주세요.")).toBeTruthy();
  });

  it("keeps cooked food quantities in grams instead of accepting an incompatible unit", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ includeCookedBatch: true });
    await openBreakfast(user);
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const unit = screen.getByRole("textbox", { name: "단위" }) as HTMLInputElement;
    expect(unit.value).toBe("g");
    expect(unit.readOnly).toBe(true);
    expect(screen.queryByText("먹은 양을 g(그램) 단위로 입력해 주세요.")).toBeNull();
  });

  it("appends each server-ordered source with its single opaque cursor", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ paginatedSources: true });

    await openBreakfast(user);
    await user.click(await screen.findByRole("button", { name: "요리한 음식 더 불러오기" }));
    expect(await screen.findByRole("button", { name: /카레/u })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "최근" }));
    await user.click(await screen.findByRole("button", { name: "최근 음식 더 불러오기" }));
    expect(await screen.findByRole("button", { name: /바나나/u })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.type(screen.getByRole("searchbox", { name: "제품·재료 검색" }), "시");
    expect(await screen.findByRole("button", { name: /시금치/u })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "제품·재료 더 불러오기" }));
    expect(await screen.findByRole("button", { name: /우유/u })).toBeTruthy();

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("cursor=recent-cursor"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("cursor=batch-cursor"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("cursor=catalog-cursor"))).toBe(true);
  });

  it("fails closed for an unmatched cooked recent and links only an eligible missing batch", async () => {
    const user = userEvent.setup();
    renderMealLogShell({
      batchWeightStatus: "missing",
      includeCookedBatch: true,
      recentCookedWithoutProjection: true,
    });

    await openBreakfast(user);
    expect(screen.queryByText(/g 식사 기록 저장 불가|완성 무게 확인 불가|이전 기록이라 중량/)).toBeNull();
    expect((await screen.findByRole("link", { name: /된장찌개 완성 중량 입력/u })).getAttribute("href"))
      .toBe("/leftovers");
    await user.click(screen.getByRole("tab", { name: "최근" }));
    const unmatched = await screen.findByRole("button", { name: /예전 카레/u });
    expect((unmatched as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("현재 추가할 수 없는 음식이에요. 요리한 음식 탭에서 상태를 확인해 주세요.")).toBeTruthy();
  });

  it("shows the recent brand and the contracted catalog source badges", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ catalogBadges: true });

    await openBreakfast(user);
    await user.click(screen.getByRole("tab", { name: "최근" }));
    expect(await screen.findByText("무먹식품 · 제품 · 최근 2개 · 3회 기록")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.type(screen.getByRole("searchbox", { name: "제품·재료 검색" }), "요거트");
    expect(await screen.findByText("공공브랜드 · 제품 · 공공 영양DB")).toBeTruthy();
    expect(screen.getByText("동네브랜드 · 제품 · 사용자 등록")).toBeTruthy();
  });
});
