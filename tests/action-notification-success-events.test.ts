// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProductPlannerEntry } from "@/lib/api/product-planner-entry";
import { completeShoppingList } from "@/lib/api/shopping";
import { deleteAccount, logout } from "@/lib/api/mypage";
import {
  HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET,
  HOMECOOK_APP_ACTION_NOTIFICATION_EVENT,
} from "@/lib/app-action-notifications";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();
const actionListener = vi.fn();
const resetListener = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  window.addEventListener(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, actionListener);
  window.addEventListener(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET, resetListener);
});

afterEach(() => {
  window.removeEventListener(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT, actionListener);
  window.removeEventListener(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET, resetListener);
  vi.unstubAllGlobals();
});

function respond(success: boolean) {
  return {
    ok: success,
    status: success ? 200 : 409,
    json: async () => ({
      success,
      data: success ? { completed: true } : null,
      error: success ? null : { code: "CONFLICT", message: "다시 확인해 주세요.", fields: [] },
    }),
  };
}

describe("authoritative action notification refresh", () => {
  it("refreshes product planning history only after successful registration", async () => {
    const body = { product_id: "product-1", plan_date: "2026-09-28", column_id: "column-1", quantity: { amount: 100, unit: "g" as const } };
    fetchMock.mockResolvedValueOnce(respond(false));
    await expect(createProductPlannerEntry(body)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(actionListener).not.toHaveBeenCalled();
    const entry = { id: "entry-1", ...body };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ success: true, data: { entry }, error: null }) });
    await expect(createProductPlannerEntry(body)).resolves.toEqual(entry);
    expect(actionListener).toHaveBeenCalledTimes(1);
  });

  it("waits for shopping completion success and emits a refresh without invented notification text", async () => {
    let resolveRequest!: (value: ReturnType<typeof respond>) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const pending = completeShoppingList("list-1");
    expect(actionListener).not.toHaveBeenCalled();
    resolveRequest(respond(true));
    await pending;
    expect(actionListener).toHaveBeenCalledTimes(1);
    expect(actionListener.mock.calls[0][0]).not.toHaveProperty("detail");
  });

  it("does not announce failed or unparseable shopping completion", async () => {
    fetchMock.mockResolvedValueOnce(respond(false));
    await expect(completeShoppingList("list-1")).rejects.toMatchObject({ code: "CONFLICT" });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError("invalid json"); } });
    await expect(completeShoppingList("list-1")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(actionListener).not.toHaveBeenCalled();
  });
});

describe.each([
  ["logout", () => logout()],
  ["account deletion", () => deleteAccount("550e8400-e29b-41d4-a716-446655440000")],
] as const)("notification identity reset on %s", (_name, perform) => {
  it("clears account history only after the server confirms success", async () => {
    fetchMock.mockResolvedValueOnce(respond(false));
    await expect(perform()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(resetListener).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(respond(true));
    await perform();
    expect(resetListener).toHaveBeenCalledTimes(1);
    expect(actionListener).not.toHaveBeenCalled();
  });
});
