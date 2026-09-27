import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/api/fetch-json";

vi.mock("@/lib/mock/qa-fixture-overrides", () => ({ withQaFixtureOverrideHeaders: (init: RequestInit) => init }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const success = () => Response.json({ success: true, data: { id: "recipe" }, error: null });
const unavailable = () => Response.json({ success: false, data: null,
  error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE", message: "maintenance", fields: [] } }, { status: 503 });

describe("fetchJson bounded read recovery", () => {
  it.each(["network", "service"])("retries a temporary %s failure once while the returned promise stays pending", async (kind) => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => kind === "network"
      ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(unavailable()))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetch);
    let settled = false;
    const pending = fetchJson("/api/v1/recipes").finally(() => { settled = true; });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    finish(success());
    await expect(pending).resolves.toEqual({ id: "recipe" });
  });

  it("stops after the second 503 with a retry message and preserves the API code", async () => {
    const fetch = vi.fn().mockImplementation(async () => unavailable());
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson("/api/v1/recipes")).rejects.toMatchObject({
      status: 503, code: "ACCOUNT_LIFECYCLE_MAINTENANCE", message: expect.stringContaining("다시 시도"),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 409])("never retries an actual auth denial (%s)", async (status) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: false, data: null,
      error: { code: "ACCOUNT_SESSION_STALE", message: "세션을 다시 확인해 주세요.", fields: [] } }, { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson("/api/v1/recipes")).rejects.toMatchObject({ status, code: "ACCOUNT_SESSION_STALE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["POST", "PATCH", "DELETE"])("does not replay a %s mutation on network failure", async (method) => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson("/api/v1/recipes", { method })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["/api/v1/recipes/recipe-id", "/auth/logout", "/api/v1/unknown"])("does not replay a GET with possible side effects: %s", async (path) => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => unavailable());
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson(path)).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("respects caller cancellation without restarting the read", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException("Aborted", "AbortError");
    const fetch = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson("/api/v1/recipes", { signal: controller.signal })).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds both stalled read attempts instead of leaving loading forever", async () => {
    const signals: AbortController[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController(); signals.push(controller); return controller.signal;
    });
    const fetch = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const pending = expect(fetchJson("/api/v1/recipes")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    signals[0].abort(new DOMException("Timed out", "TimeoutError"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    signals[1].abort(new DOMException("Timed out", "TimeoutError"));
    await pending;
    expect(AbortSignal.timeout).toHaveBeenNthCalledWith(1, 10_000);
    expect(AbortSignal.timeout).toHaveBeenNthCalledWith(2, 10_000);
  });
});
