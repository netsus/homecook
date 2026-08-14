// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG entry mutations", () => {
  afterEach(cleanup);

  it("exposes edit and delete actions without client-side nutrition recalculation", async () => {
    renderMealLogShell();

    expect(await screen.findAllByRole("button", { name: /식사 기록 수정/u }))
      .toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /식사 기록 삭제/u }))
      .toHaveLength(2);
    expect(screen.queryByText("클라이언트 계산")).toBeNull();
  });

  it("requires an explicit active-column selection for every deleted-origin edit", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: /간식의 플레인 요거트 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    expect(within(dialog).getByText("기존 위치: 삭제된 끼니 간식")).toBeTruthy();
    const selector = within(dialog).getByRole("combobox", { name: "옮길 끼니 (필수)" });
    expect((selector as HTMLSelectElement).value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(selector));
    const saveButton = within(dialog).getByRole("button", { name: "수정 저장" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.className).toContain("disabled:opacity-50");
    await user.selectOptions(selector, "20000000-0000-4000-8000-000000000002");
    expect(saveButton.disabled).toBe(false);
  });

  it("restores the invoking edit action after cancel and moves successful deleted edits to the destination section", async () => {
    const user = userEvent.setup();
    renderMealLogShell();
    const invoker = await screen.findByRole("button", { name: /간식의 플레인 요거트 식사 기록 수정/u });

    await user.click(invoker);
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 수정" }))
      .getByRole("button", { name: "취소" }));
    await waitFor(() => expect(document.activeElement).toBe(invoker));

    await user.click(invoker);
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "옮길 끼니 (필수)" }),
      "20000000-0000-4000-8000-000000000002",
    );
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "식사 기록 수정" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "점심" })));
  });

  it("moves focus to the origin section after a successful delete", async () => {
    const user = userEvent.setup();
    renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 삭제/u }));
    await user.click(within(screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" }))
      .getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "식사 기록 삭제 확인" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "아침" })));
  });

  it("keeps the edit dialog open while a mutation is pending", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));

    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    expect(within(dialog).getByRole("button", { name: "처리 중…" })).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "식사 기록 수정" })).toBeTruthy();
  });

  it("moves focus to a stale-revision error while preserving the dialog", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 삭제/u }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: false,
      data: null,
      error: { code: "CONFLICT", message: "현재 기록이 먼저 변경됐어요.", fields: [] },
    }), {
      headers: { "content-type": "application/json" },
      status: 409,
    }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" })).toBeTruthy();
  });

  it("reuses an edit key only for the same payload and rotates it after correction", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();
    const keys: string[] = [];

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    fetchMock.mockImplementation(async () => {
      const call = fetchMock.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit?];
      keys.push(new Headers(call[1]?.headers).get("Idempotency-Key") ?? "");
      return new Response(JSON.stringify({
        success: false,
        data: null,
        error: { code: "UNIT_CONVERSION_MISSING", message: "단위를 다시 확인해 주세요.", fields: [] },
      }), {
        headers: { "content-type": "application/json" },
        status: 422,
      });
    });

    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await screen.findByRole("alert");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await user.clear(within(dialog).getByRole("spinbutton", { name: "실제 양" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "실제 양" }), "3");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
