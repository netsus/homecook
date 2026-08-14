// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

const RETURN_CONTEXT_KEY = "homecook.meal-log-return-context.v1";
const RESTORED_BATCH_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_BATCH_ID = "40000000-0000-4000-8000-000000000002";

describe("MEAL_LOG unauthorized return-to-action", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(cleanup);

  it("hides private day data and shows the existing login return gate when a read returns 401", async () => {
    renderMealLogShell({ unauthorized: "read" });

    expect(await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeTruthy();
    expect(screen.queryByText("달걀")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    const gate = screen.getByTestId("meal-log-auth-gate-login");
    expect(gate.getAttribute("data-next-path")).toBe("/planner?segment=log&date=2026-08-10");
  });

  it("preserves the selected date, meal, confirmed add draft, and add invoker across a create 401", async () => {
    const user = userEvent.setup();
    const first = renderMealLogShell({ unauthorized: "create" });

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.click(await screen.findByRole("button", { name: /달걀/u }));
    await user.click(screen.getByRole("spinbutton", { name: "실제 양" }));
    await user.tab();
    await user.click(screen.getByRole("button", { name: "기록 저장" }));

    expect(await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeTruthy();
    expect(screen.queryByText("달걀")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(RETURN_CONTEXT_KEY) ?? "null")).toMatchObject({
      action: "add",
      date: "2026-08-10",
      columnId: "20000000-0000-4000-8000-000000000001",
      invoker: "section-add",
      draft: { name: "달걀", amount: 2, unit: "개" },
    });

    first.unmount();
    renderMealLogShell();
    const restored = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    expect(within(restored).getByText("8월 10일 · 아침")).toBeTruthy();
    expect(within(restored).getByText("달걀", { selector: "footer p" })).toBeTruthy();
    expect((within(restored).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("2");
    expect((within(restored).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled).toBe(false);
    const restoredInvoker = screen.getByRole("button", { hidden: true, name: "아침에 먹은 음식 추가" });
    await user.click(within(restored).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(document.activeElement).toBe(restoredInvoker));
  });

  async function captureCookedBatchDraft(user: ReturnType<typeof userEvent.setup>) {
    const first = renderMealLogShell({ includeCookedBatch: true, unauthorized: "create" });

    await user.click(await screen.findByRole("button", { name: "아침에 먹은 음식 추가" }));
    await user.click(await screen.findByRole("button", { name: /된장찌개/u }));
    await user.click(screen.getByRole("button", { name: "기록 저장" }));
    await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" });

    const context = JSON.parse(window.sessionStorage.getItem(RETURN_CONTEXT_KEY) ?? "null") as {
      draft: { amount: number; maxAmount: number; name: string };
    };
    first.unmount();
    return context;
  }

  function storeCookedBatchDraft(context: {
    draft: { amount: number; maxAmount: number; name: string };
  }, draft: Partial<typeof context.draft> = {}) {
    window.sessionStorage.setItem(RETURN_CONTEXT_KEY, JSON.stringify({
      ...context,
      draft: { ...context.draft, ...draft },
    }));
  }

  it("keeps a restored cooked-batch draft disabled until the latest known available batch replaces its authority", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context, { amount: 40, maxAmount: 80, name: "로그인 전 된장찌개" });

    const restored = renderMealLogShell({
      batchRemainingWeight: 60,
      deferBatchLoad: true,
      includeCookedBatch: true,
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);

    restored.releaseBatchLoad();
    await waitFor(() => expect(
      (within(dialog).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).max,
    ).toBe("60"));
    expect(within(dialog).getByText("된장찌개", { selector: "footer p" })).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("does not block a new catalog selection while restored cooked-batch authority is still loading", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    const restored = renderMealLogShell({ catalogBadges: true, deferBatchLoad: true });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    await user.click(within(dialog).getByRole("tab", { name: "제품·재료" }));
    await user.type(within(dialog).getByRole("textbox", { name: "제품·재료 검색" }), "두유");
    await user.click(within(dialog).getByRole("button", { name: "검색" }));
    await user.click(await within(dialog).findByRole("button", { name: /공공 두유/u }));

    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(false);
    restored.releaseBatchLoad();
  });

  it("uses the latest reduced cooked-batch remainder as maxAmount and blocks an oversized restored draft", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context, { amount: 80, maxAmount: 80 });

    renderMealLogShell({ batchRemainingWeight: 30, includeCookedBatch: true });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    expect(await within(dialog).findByText("남은 양 30g 이하로 입력해 주세요.")).toBeTruthy();
    expect((within(dialog).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).max)
      .toBe("30");
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("finds a valid restored cooked batch on a later availability=all page without changing the visible first page", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context, { amount: 40, maxAmount: 80 });

    const restored = renderMealLogShell({
      batchPages: [
        {
          cursor: null,
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "batch-page-2",
          hasNext: true,
        },
        {
          cursor: "batch-page-2",
          items: [{ id: RESTORED_BATCH_ID, recipeTitle: "된장찌개", remainingWeight: 55 }],
          nextCursor: null,
          hasNext: false,
        },
      ],
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });

    await waitFor(() => expect(
      (within(dialog).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).max,
    ).toBe("55"));
    expect(within(dialog).getByRole("button", { name: /카레/u })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "요리한 음식 더 불러오기" })).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches"))
      .map(([input]) => new URL(String(input), "http://localhost").searchParams.get("cursor")))
      .toEqual([null, "batch-page-2"]);
  });

  it("fails closed after one repeated restored-batch cursor without requesting forever", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    const restored = renderMealLogShell({
      batchPages: [
        {
          cursor: null,
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "repeated-cursor",
          hasNext: true,
        },
        {
          cursor: "repeated-cursor",
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "repeated-cursor",
          hasNext: true,
        },
      ],
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });

    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "기록 저장" })).toBeNull());
    await waitFor(() => expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches")))
      .toHaveLength(2));
    expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches"))
      .map(([input]) => new URL(String(input), "http://localhost").searchParams.get("cursor")))
      .toEqual([null, "repeated-cursor"]);
  });

  it("fails closed when restored-batch cursors cycle back to a visited page", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    const restored = renderMealLogShell({
      batchPages: [
        {
          cursor: null,
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "cursor-a",
          hasNext: true,
        },
        {
          cursor: "cursor-a",
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "cursor-b",
          hasNext: true,
        },
        {
          cursor: "cursor-b",
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "cursor-a",
          hasNext: true,
        },
      ],
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });

    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "기록 저장" })).toBeNull());
    await waitFor(() => expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches")))
      .toHaveLength(3));
    expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches"))
      .map(([input]) => new URL(String(input), "http://localhost").searchParams.get("cursor")))
      .toEqual([null, "cursor-a", "cursor-b"]);
  });

  it("fails closed when a later restored-batch page returns an error", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    const restored = renderMealLogShell({
      batchPages: [
        {
          cursor: null,
          items: [{ id: OTHER_BATCH_ID, recipeTitle: "카레" }],
          nextCursor: "error-cursor",
          hasNext: true,
        },
        {
          cursor: "error-cursor",
          items: [],
          nextCursor: null,
          hasNext: false,
          errorStatus: 503,
        },
      ],
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });

    expect((await within(dialog).findByRole("alert")).textContent)
      .toContain("요리한 음식 페이지를 불러오지 못했어요.");
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "기록 저장" })).toBeNull());
    expect(restored.fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/cooked-batches"))
      .map(([input]) => new URL(String(input), "http://localhost").searchParams.get("cursor")))
      .toEqual([null, "error-cursor"]);
  });

  it("preserves a new catalog selection after the delayed restored-batch response has settled", async () => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    const restored = renderMealLogShell({
      batchPages: [{ cursor: null, items: [], nextCursor: null, hasNext: false }],
      catalogBadges: true,
      deferredBatchCursors: [null],
    });
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    await user.click(within(dialog).getByRole("tab", { name: "제품·재료" }));
    await user.type(within(dialog).getByRole("textbox", { name: "제품·재료 검색" }), "두유");
    await user.click(within(dialog).getByRole("button", { name: "검색" }));
    await user.click(await within(dialog).findByRole("button", { name: /공공 두유/u }));
    expect(within(dialog).getByText("공공 두유", { selector: "footer p" })).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(false);

    restored.releaseBatchLoad();
    await waitFor(() => {
      expect(restored.settledBatchCursors()).toEqual([null]);
      expect(within(dialog).getByText("공공 두유", { selector: "footer p" })).toBeTruthy();
    });
    expect((within(dialog).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value)
      .toBe("100");
    expect((within(dialog).getByRole("textbox", { name: "단위" }) as HTMLInputElement).value)
      .toBe("ml");
    expect((within(dialog).getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it.each([
    ["missing", { batchWeightStatus: "missing" as const, includeCookedBatch: true }],
    ["unrecoverable", { batchWeightStatus: "unrecoverable" as const, includeCookedBatch: true }],
    ["depleted", { batchRemainingWeight: 0, batchStatus: "depleted" as const, includeCookedBatch: true }],
    ["absent from the latest list", { includeCookedBatch: false }],
  ])("removes a restored cooked-batch draft when the latest batch is %s", async (_state, options) => {
    const user = userEvent.setup();
    const context = await captureCookedBatchDraft(user);
    storeCookedBatchDraft(context);

    renderMealLogShell(options);
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "기록 저장" })).toBeNull());
    expect(within(dialog).queryByText("된장찌개", { selector: "footer p" })).toBeNull();
  });

  it("preserves the edit draft and invoking entry action while hiding it after an edit 401", async () => {
    const user = userEvent.setup();
    const first = renderMealLogShell({ unauthorized: "edit" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    const amount = within(dialog).getByRole("spinbutton", { name: "실제 양" });
    await user.clear(amount);
    await user.type(amount, "3");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    expect(await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeTruthy();
    expect(screen.queryByText("달걀")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(RETURN_CONTEXT_KEY) ?? "null")).toMatchObject({
      action: "edit",
      date: "2026-08-10",
      entryId: "10000000-0000-4000-8000-000000000001",
      invoker: "entry-edit",
      draft: { amount: 3, unit: "개" },
    });

    first.unmount();
    renderMealLogShell();
    const restored = await screen.findByRole("dialog", { name: "식사 기록 수정" });
    expect((within(restored).getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("3");
    const restoredInvoker = screen.getByRole("button", { hidden: true, name: /아침의 달걀 식사 기록 수정/u });
    await user.click(within(restored).getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "식사 기록 수정" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(restoredInvoker));
  });

  it("preserves the invoking delete action while hiding the confirmation and private entry after 401", async () => {
    const user = userEvent.setup();
    const first = renderMealLogShell({ unauthorized: "delete" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 삭제/u }));
    await user.click(within(screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" }))
      .getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeTruthy());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("달걀")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(RETURN_CONTEXT_KEY) ?? "null")).toMatchObject({
      action: "delete",
      date: "2026-08-10",
      entryId: "10000000-0000-4000-8000-000000000001",
      invoker: "entry-delete",
    });

    first.unmount();
    renderMealLogShell({ applyMutationRefresh: true });
    const restored = await screen.findByRole("alertdialog", { name: "식사 기록 삭제 확인" });
    await user.click(within(restored).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "식사 기록 삭제 확인" })).toBeNull());
    expect(screen.queryByRole("button", { name: /아침의 달걀 식사 기록 삭제/u })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "아침" })));
  });

  it("focuses the destination context after a restored deleted-origin edit moves sections", async () => {
    const user = userEvent.setup();
    const first = renderMealLogShell({ unauthorized: "edit" });

    await user.click(await screen.findByRole("button", { name: /간식의 플레인 요거트 식사 기록 수정/u }));
    const initialDialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    await user.selectOptions(
      within(initialDialog).getByRole("combobox", { name: "옮길 끼니 (필수)" }),
      "20000000-0000-4000-8000-000000000002",
    );
    await user.click(within(initialDialog).getByRole("button", { name: "수정 저장" }));
    await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" });

    first.unmount();
    renderMealLogShell({ applyMutationRefresh: true });
    const restored = await screen.findByRole("dialog", { name: "식사 기록 수정" });
    const originalInvoker = screen.getByRole("button", { hidden: true, name: /간식의 플레인 요거트 식사 기록 수정/u });
    await user.click(within(restored).getByRole("button", { name: "수정 저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "식사 기록 수정" })).toBeNull());
    const currentInvoker = screen.getByRole("button", { name: /점심의 플레인 요거트 식사 기록 수정/u });
    expect(originalInvoker.isConnected).toBe(false);
    expect(currentInvoker.isConnected).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "점심" })));
  });
});
