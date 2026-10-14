// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

vi.mock("@/lib/api/meal-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/meal-log")>();
  return { ...actual, fetchMealLogDay: async (...args: Parameters<typeof actual.fetchMealLogDay>) => ({
    ...await actual.fetchMealLogDay(...args), quantity_policy: "quantity-v4" as const,
  }) };
});
afterEach(cleanup);
it("keeps legacy count editing on its original policy when there is no recorded v4 unit evidence", async () => {
  const user = userEvent.setup(); const { fetchMock } = renderMealLogShell();
  await user.click(await screen.findByRole("button", { name: "아침의 달걀 식사 기록 상세" }));
  await user.click(screen.getByRole("button", { name: "식사 기록 수정" }));
  const edit = screen.getByRole("dialog", { name: /월 \d+일/ });
  expect(within(edit).getByRole<HTMLInputElement>("textbox", { name: "단위" }).value).toBe("개");
  expect(within(edit).getByText("이전 단위의 환산 근거를 확인하지 못해 기존 숫자 입력을 유지해요. 원래 양과 단위는 보존했어요.")).toBeTruthy();
  const amount = within(edit).getByRole("textbox", { name: "먹은 양" });
  await user.clear(amount); await user.type(amount, "3"); await user.click(within(edit).getByRole("button", { name: "수정 저장" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
  const body = JSON.parse(String(request[1]?.body));
  expect(body.quantity).toEqual({ amount: 3, unit: "개" }); expect(body.expected_revision).toBe(1);
  expect(body).not.toHaveProperty("quantity_input");
});
