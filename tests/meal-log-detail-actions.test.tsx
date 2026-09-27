// @vitest-environment jsdom
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { renderMealLogShell } from "./fixtures/meal-log-ui-harness";
afterEach(cleanup);
it("offers the shared back icon and deletes directly from details through confirmation", async () => {
  const { fetchMock } = renderMealLogShell();
  await userEvent.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  const detail = screen.getByRole("dialog", { name: "식사 기록 상세" });
  expect(within(detail).getByRole("button", { name: "식사 기록으로 돌아가기" }).querySelector("path")?.getAttribute("d")).toBe("m15 18-6-6 6-6");
  expect(within(detail).queryByText("처음 기록한 양을 바로 수정할 수 있어요.")).toBeNull();
  await userEvent.click(within(detail).getByRole("button", { name: "기록 삭제" }));
  const confirm = screen.getByRole("alertdialog", { name: "식사 기록 삭제 확인" });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  await userEvent.click(within(confirm).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
  expect(deletes).toHaveLength(1);
  expect(JSON.parse(String(deletes[0][1]?.body))).toEqual({ expected_revision: 1 });
  expect(new Headers(deletes[0][1]?.headers).get("Idempotency-Key")).toBeTruthy();
});
