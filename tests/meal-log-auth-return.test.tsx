// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

const RETURN_CONTEXT_KEY = "homecook.meal-log-return-context.v1";

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

  it("focuses the current edit action after a restored deleted-origin edit moves sections", async () => {
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
    await waitFor(() => expect(document.activeElement).toBe(currentInvoker));
  });
});
