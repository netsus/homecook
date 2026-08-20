// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG entry mutations", () => {
  afterEach(cleanup);
  beforeEach(() => window.sessionStorage.clear());

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

  it("restores the exact edit action after cancel", async () => {
    const user = userEvent.setup();
    renderMealLogShell();
    const invoker = await screen.findByRole("button", { name: /간식의 플레인 요거트 식사 기록 수정/u });

    await user.click(invoker);
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 수정" }))
      .getByRole("button", { name: "취소" }));
    await waitFor(() => expect(document.activeElement).toBe(invoker));
  });

  it.each([
    ["before", false],
    ["after", true],
  ])("moves focus to the destination heading when authoritative relocation renders %s restoration", async (_timing, applyMutationRefresh) => {
    const user = userEvent.setup();
    renderMealLogShell({ applyMutationRefresh });
    const invoker = await screen.findByRole("button", { name: /간식의 플레인 요거트 식사 기록 수정/u });

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
    renderMealLogShell({ applyMutationRefresh: true });

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
    renderMealLogShell({ conflictMutation: "delete" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 삭제/u }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    const error = await within(screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" })).findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" })).toBeTruthy();
  });

  it("reuses an edit key only for the same payload and rotates it after correction", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell();
    const keys: string[] = [];
    let attempts = 0;

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    fetchMock.mockImplementation(async () => {
      const call = fetchMock.mock.calls.at(-1) as unknown as [RequestInfo | URL, RequestInit?];
      keys.push(new Headers(call[1]?.headers).get("Idempotency-Key") ?? "");
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
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

  it("refreshes the conflicted entry revision and active columns before a corrected edit retry", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ conflictMutation: "edit" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain("최신 기록을 반영했어요");
    expect(within(dialog).getByRole("option", { name: "저녁" })).toBeTruthy();
    const amount = within(dialog).getByRole("spinbutton", { name: "실제 양" });
    expect((amount as HTMLInputElement).value).toBe("2");
    await user.clear(amount);
    await user.type(amount, "3");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(JSON.parse(String(patches[0][1]?.body)).expected_revision).toBe(1);
    expect(JSON.parse(String(patches[1][1]?.body)).expected_revision).toBe(2);
    expect(JSON.parse(String(patches[1][1]?.body)).source).toEqual({
      type: "ingredient",
      id: "30000000-0000-4000-8000-000000000002",
    });
    expect(new Headers(patches[1][1]?.headers).get("Idempotency-Key"))
      .not.toBe(new Headers(patches[0][1]?.headers).get("Idempotency-Key"));
  });

  it("refreshes a conflicted delete to the latest revision before retrying", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ conflictMutation: "delete" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 삭제/u }));
    const dialog = screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" });
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("최신 기록을 반영했어요");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(JSON.parse(String(deletes[0][1]?.body)).expected_revision).toBe(1);
    expect(JSON.parse(String(deletes[1][1]?.body)).expected_revision).toBe(2);
  });

  it("supports two explicit conflict refreshes without automatically overwriting authority", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({ conflictCount: 2, conflictMutation: "edit" });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await within(dialog).findByRole("alert");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(2));
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "식사 기록 수정" })).toBeNull());

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches.map(([, init]) => JSON.parse(String(init?.body)).expected_revision)).toEqual([1, 2, 3]);
    expect(new Set(patches.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"))).size).toBe(3);
  });

  it("uses the latest active column after a conflict while preserving only amount and unit", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({
      conflictColumnAuthority: "moved",
      conflictMutation: "edit",
    });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    const amount = within(dialog).getByRole("spinbutton", { name: "실제 양" });
    await user.clear(amount);
    await user.type(amount, "3");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await within(dialog).findByRole("alert");

    expect((within(dialog).getByRole("combobox", { name: "옮길 끼니" }) as HTMLSelectElement).value)
      .toBe("20000000-0000-4000-8000-000000000003");
    expect((amount as HTMLInputElement).value).toBe("3");
    expect((within(dialog).getByRole("textbox", { name: "단위" }) as HTMLInputElement).value).toBe("개");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    const retry = JSON.parse(String(patches[1][1]?.body));
    expect(retry.meal_plan_column_id).toBe("20000000-0000-4000-8000-000000000003");
    expect(retry.expected_revision).toBe(2);
    expect(retry.source).toEqual({
      type: "ingredient",
      id: "30000000-0000-4000-8000-000000000002",
    });
  });

  it("clears a deleted latest column and blocks conflict retry until explicit reselection", async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderMealLogShell({
      conflictColumnAuthority: "deleted",
      conflictMutation: "edit",
    });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    const dialog = screen.getByRole("dialog", { name: "식사 기록 수정" });
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await within(dialog).findByRole("alert");

    const selector = within(dialog).getByRole("combobox", { name: "옮길 끼니 (필수)" });
    expect((selector as HTMLSelectElement).value).toBe("");
    expect((within(dialog).getByRole("button", { name: "수정 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

    await user.selectOptions(selector, "20000000-0000-4000-8000-000000000002");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patches[1][1]?.body)).meal_plan_column_id)
      .toBe("20000000-0000-4000-8000-000000000002");
  });

  it("fails closed after the selected day authority refresh fails and recovers after retry", async () => {
    const user = userEvent.setup();
    renderMealLogShell({ failRefreshAfterMutation: true });

    await user.click(await screen.findByRole("button", { name: /아침의 달걀 식사 기록 수정/u }));
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 수정" }))
      .getByRole("button", { name: "수정 저장" }));

    expect(await screen.findByRole("heading", { name: "식사 기록을 불러오지 못했어요" })).toBeTruthy();
    expect(screen.queryByText("달걀")).toBeNull();
    expect(screen.queryByRole("button", { name: /식사 기록 수정/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /먹은 음식 추가/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /식사 기록 삭제/u })).toBeNull();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /아침의 달걀 식사 기록 수정/u }) as HTMLButtonElement).disabled).toBe(false));
  });
});
