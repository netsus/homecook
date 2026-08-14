// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG add sheet", () => {
  afterEach(cleanup);

  it("opens the contracted recent, cooked-batch, and search sources", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    const dialog = screen.getByRole("dialog", { name: "먹은 음식 추가" });
    expect(dialog.className.split(" ")).toContain("h-[100dvh]");
    expect(screen.getByText("8월 10일 · 아침")).toBeTruthy();
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "요리한 음식" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "제품·재료" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    const cookedTab = screen.getByRole("tab", { name: "요리한 음식" });
    cookedTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "제품·재료" }).getAttribute("aria-selected"))
      .toBe("true");
    expect(await screen.findByText("최근·자주 먹은 음식")).toBeTruthy();
  });

  it("requires the suggested recent amount to be reviewed before save", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.click(await screen.findByRole("button", { name: /달걀/u }));
    const save = screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText("제안된 양을 확인해 주세요.")).toBeTruthy();

    await user.click(screen.getByRole("spinbutton", { name: "실제 양" }));
    await user.tab();
    expect(save.disabled).toBe(false);
  });

  it("fails closed when cooked-batch grams exceed the authoritative remainder", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ includeCookedBatch: true });

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    expect(await screen.findByText(/8월 9일 조리/u)).toBeTruthy();
    expect(screen.getByText(/완성 500g/u)).toBeTruthy();
    expect(screen.getByText(/영양 계산 완료/u)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    const amount = screen.getByRole("spinbutton", { name: "실제 양" });
    await user.clear(amount);
    await user.type(amount, "81");

    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText("남은 양 80g 이하로 입력해 주세요.")).toBeTruthy();
  });

  it("appends each server-ordered source with its single opaque cursor", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ paginatedSources: true });

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    await user.click(await screen.findByRole("button", { name: "요리한 음식 더 불러오기" }));
    expect(await screen.findByRole("button", { name: /카레/u })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.click(await screen.findByRole("button", { name: "최근 음식 더 불러오기" }));
    expect(await screen.findByRole("button", { name: /바나나/u })).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "제품·재료 검색" }), "시");
    await user.click(screen.getByRole("button", { name: "검색" }));
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

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    expect((await screen.findByRole("link", { name: /된장찌개 완성 중량 입력/u })).getAttribute("href"))
      .toBe("/leftovers");
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    const unmatched = await screen.findByRole("button", { name: /예전 카레/u });
    expect((unmatched as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("현재 중량·잔량 상태를 확인할 수 없어 저장할 수 없어요.")).toBeTruthy();
  });

  it("shows the recent brand and the contracted catalog source badges", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ catalogBadges: true });

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    expect(await screen.findByText("무먹식품 · 제품 · 최근 2개 · 3회 기록")).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "제품·재료 검색" }), "요거트");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText("공공브랜드 · 제품 · 공공 영양DB")).toBeTruthy();
    expect(screen.getByText("동네브랜드 · 제품 · 사용자 등록")).toBeTruthy();
  });
});
