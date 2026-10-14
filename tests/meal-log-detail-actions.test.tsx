// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ActionConfirmation } from "@/components/shared/action-confirmation";
import { showActionConfirmation, useActionConfirmationStore } from "@/stores/ui-store";
import { renderMealLogShell } from "./fixtures/meal-log-ui-harness";
afterEach(() => { useActionConfirmationStore.getState().dismiss(); cleanup(); });
it.each(["close", "Escape"])("returns cancel focus to the actual detail add button after %s", async action => {
  renderMealLogShell(); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "아침에 먹은 음식 추가" }));
  const add = screen.getByRole("dialog", { name: "먹은 음식 추가" });
  await user.click(await within(add).findByRole("button", { name: /달걀/ }));
  if (action === "close") await user.click(within(add).getByRole("button", { name: "닫기" }));
  else await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "아침에 먹은 음식 추가" })));
});
it("returns acknowledged add success to its detail invoker without focusing behind confirmation", async () => {
  renderMealLogShell(); render(<ActionConfirmation />); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "아침에 먹은 음식 추가" }));
  const add = screen.getByRole("dialog", { name: "먹은 음식 추가" });
  await user.click(await within(add).findByRole("button", { name: /달걀/ }));
  await user.click(within(add).getByRole("textbox", { name: "먹은 양" })); await user.tab();
  await user.click(within(add).getByRole("button", { name: "기록 저장" }));
  const success = await screen.findByRole("dialog", { name: "식사기록에 추가했어요." });
  expect(success.contains(document.activeElement)).toBe(true);
  await user.click(within(success).getByRole("button", { name: "확인" }));
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "아침에 먹은 음식 추가" })));
});
it.each(["unmount", "newer-confirmation", "pathname"])("ignores a late add success after %s without replacing newer focus", async change => {
  const shell = renderMealLogShell(); render(<ActionConfirmation />); const user = userEvent.setup();
  const previousHref = window.location.href;
  const originalFetch = shell.fetchMock.getMockImplementation()!;
  let resolve!: (response: Response) => void;
  shell.fetchMock.mockImplementation((input, init) => String(input).includes("/meal-log/entries") && init?.method === "POST"
    ? new Promise<Response>(done => { resolve = done; }) : originalFetch(input, init));
  await user.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "아침에 먹은 음식 추가" }));
  const add = screen.getByRole("dialog", { name: "먹은 음식 추가" });
  await user.click(await within(add).findByRole("button", { name: /달걀/ }));
  await user.click(within(add).getByRole("textbox", { name: "먹은 양" })); await user.tab();
  await user.click(within(add).getByRole("button", { name: "기록 저장" }));
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  if (change === "unmount") shell.unmount();
  if (change === "pathname") {
    shell.historyMocks.replace.mockRestore();
    window.history.replaceState(null, "", "/different-screen");
    render(<button type="button">새 화면 작업</button>);
    screen.getByRole("button", { name: "새 화면 작업" }).focus();
  } else showActionConfirmation("새 화면의 안내");
  const response = await originalFetch("/api/v1/meal-log/entries", { method: "POST" });
  await act(async () => { resolve(response); });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "식사기록에 추가했어요." })).toBeNull());
  expect(useActionConfirmationStore.getState().message).toBe(change === "pathname" ? null : "새 화면의 안내");
  if (change === "pathname") expect(document.activeElement).toBe(screen.getByRole("button", { name: "새 화면 작업" }));
  else expect(screen.getByRole("dialog", { name: "새 화면의 안내" }).contains(document.activeElement)).toBe(true);
  if (change === "pathname") window.history.replaceState(null, "", previousHref);
});
it("offers the shared back icon and deletes directly from details through confirmation", async () => {
  const { fetchMock } = renderMealLogShell();
  await userEvent.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  const detail = screen.getByRole("dialog", { name: "식사 기록 상세" });
  expect(within(detail).getByRole("button", { name: "식사 기록으로 돌아가기" }).querySelector("path")?.getAttribute("d")).toBe("m15 18-6-6 6-6");
  expect(within(detail).queryByText("처음 기록한 양을 바로 수정할 수 있어요.")).toBeNull();
  expect(within(detail).getByRole("heading", { name: "8월 10일 아침" })).toBeTruthy();
  expect(within(detail).queryByText("식사기록 상세")).toBeNull();
  await userEvent.click(within(detail).getByRole("button", { name: "기록 삭제" }));
  const confirm = screen.getByRole("dialog", { name: /월 \d+일/ });
  expect(within(confirm).getByRole("heading", { name: "8월 10일 아침" })).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  await userEvent.click(within(confirm).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /월 \d+일/ })).toBeNull());
  const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
  expect(deletes).toHaveLength(1);
  expect(JSON.parse(String(deletes[0][1]?.body))).toEqual({ expected_revision: 1 });
  expect(new Headers(deletes[0][1]?.headers).get("Idempotency-Key")).toBeTruthy();
});

it("adds another food from detail to the same date and active meal, with no row delete controls", async () => {
  renderMealLogShell();
  await userEvent.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  const detail = screen.getByRole("dialog", { name: "식사 기록 상세" });
  await userEvent.click(within(detail).getByRole("button", { name: "아침에 먹은 음식 추가" }));
  const add = screen.getByRole("dialog", { name: "먹은 음식 추가" });
  expect(within(add).getByText("8월 10일 아침")).toBeTruthy();
  await userEvent.click(within(add).getByRole("button", { name: "닫기" }));
  expect(screen.queryByRole("button", { name: "아침의 달걀 식사 기록 삭제" })).toBeNull();
});
