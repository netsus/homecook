// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecipeQuantityContext } from "@/components/recipe/use-recipe-quantity-context";
const mocks = vi.hoisted(() => ({ read: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/api/recipe-quantity-context", () => ({ fetchRecipeQuantityContexts: mocks.read }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: mocks.profile }));
const source = { row_key: "row", ingredient_id: "ingredient", food_product_id: null, food_product_nutrition_version_id: null };
const context = { ready: true, context_sha256: "a".repeat(64), raw_default_unit: "g" as const };
const result = { subject: { owner_uuid: "owner", account_generation: 3 }, items: [{ ...source, context }] };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
describe("explicit quantity context retry", () => {
  beforeEach(() => { mocks.read.mockReset().mockResolvedValue(result); mocks.profile.mockReset().mockResolvedValue({ id: "owner", account_generation: 3 }); });
  it("does not read or save on mount/login restoration and requests only on an explicit retry", async () => {
    const onResolved = vi.fn(); const onError = vi.fn();
    const { result: hook } = renderHook(() => useRecipeQuantityContext({ sources: [source], subject: () => ({ owner: "owner", generation: 3 }), onResolved, onError }));
    expect(mocks.read).not.toHaveBeenCalled();
    await act(async () => { await hook.current.request("row"); });
    expect(mocks.read).toHaveBeenCalledOnce(); expect(onResolved).toHaveBeenCalledWith("row", context); expect(onError).not.toHaveBeenCalled();
  });
  it("ignores a late response after the row is replaced with another source", async () => {
    const pending = deferred<typeof result>(); mocks.read.mockReturnValue(pending.promise);
    const onResolved = vi.fn(); const onError = vi.fn();
    const { result: hook, rerender } = renderHook(({ sources }) => useRecipeQuantityContext({ sources, subject: () => ({ owner: "owner", generation: 3 }), onResolved, onError }), { initialProps: { sources: [source] } });
    let request: Promise<void>;
    act(() => { request = hook.current.request("row"); });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    rerender({ sources: [{ ...source, ingredient_id: "another" }] });
    await act(async () => { pending.resolve(result); await request; });
    expect(onResolved).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });
  it("never attaches a context across owner/generation rotation", async () => {
    mocks.profile.mockResolvedValueOnce({ id: "owner", account_generation: 3 }).mockResolvedValueOnce({ id: "owner", account_generation: 4 });
    const onResolved = vi.fn(); const onError = vi.fn();
    const { result: hook } = renderHook(() => useRecipeQuantityContext({ sources: [source], subject: () => ({ owner: "owner", generation: 3 }), onResolved, onError }));
    await act(async () => { await hook.current.request("row"); });
    expect(onResolved).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledWith(expect.stringContaining("원입력"));
  });
  it.each([
    { owner: "another", generation: 4 },
    { owner: "another", generation: 3 },
    { owner: "owner", generation: 4 },
    { owner: null, generation: null },
  ])("ignores a resolved read when the current draft subject becomes $owner/$generation", async currentSubject => {
    const pending = deferred<typeof result>(); mocks.read.mockReturnValue(pending.promise);
    const onResolved = vi.fn(); const onError = vi.fn(); const onUnauthorized = vi.fn();
    const initialProps: { subject: { owner: string | null; generation: number | null } } = { subject: { owner: "owner", generation: 3 } };
    const { result: hook, rerender } = renderHook(({ subject }: { subject: { owner: string | null; generation: number | null } }) =>
      useRecipeQuantityContext({ sources: [source], subject: () => subject, onResolved, onError, onUnauthorized }),
    { initialProps });
    let request: Promise<void>; act(() => { request = hook.current.request("row"); });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    rerender({ subject: currentSubject });
    await act(async () => { pending.resolve(result); await request; });
    expect(onResolved).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(onUnauthorized).not.toHaveBeenCalled();
    expect(hook.current.loadingKey).toBeNull();
  });
  it.each([
    { owner: "another", generation: 4 },
    { owner: "another", generation: 3 },
    { owner: "owner", generation: 4 },
    { owner: null, generation: null },
  ])("ignores an old read's 401 when the current draft subject becomes $owner/$generation", async currentSubject => {
    const { ApiFetchError } = await import("@/lib/api/fetch-json");
    const pending = deferred<typeof result>();
    mocks.read.mockReturnValue(pending.promise.then(() => { throw new ApiFetchError({ message: "로그인이 필요해요.", status: 401, code: "UNAUTHORIZED", fields: [] }); }));
    const onResolved = vi.fn(); const onError = vi.fn(); const onUnauthorized = vi.fn();
    const initialProps: { subject: { owner: string | null; generation: number | null } } = { subject: { owner: "owner", generation: 3 } };
    const { result: hook, rerender } = renderHook(({ subject }: { subject: { owner: string | null; generation: number | null } }) =>
      useRecipeQuantityContext({ sources: [source], subject: () => subject, onResolved, onError, onUnauthorized }),
    { initialProps });
    let request: Promise<void>; act(() => { request = hook.current.request("row"); });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    rerender({ subject: currentSubject });
    await act(async () => { pending.resolve(result); await request; });
    expect(onResolved).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(onUnauthorized).not.toHaveBeenCalled();
    expect(hook.current.loadingKey).toBeNull();
  });
  it("aborts an outstanding read on cancel/unmount and does not restore it", async () => {
    const pending = deferred<typeof result>(); mocks.read.mockReturnValue(pending.promise);
    const onResolved = vi.fn(); const onError = vi.fn();
    const { result: hook, unmount } = renderHook(() => useRecipeQuantityContext({ sources: [source], subject: () => ({ owner: "owner", generation: 3 }), onResolved, onError }));
    let request: Promise<void>; act(() => { request = hook.current.request("row"); });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    const signal = mocks.read.mock.calls[0][1]; unmount(); expect(signal.aborted).toBe(true);
    pending.resolve(result); await request!; expect(onResolved).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });
});

it("uses the existing resume-only login callback on 401 and does not automatically repeat the read", async () => {
  const { ApiFetchError } = await import("@/lib/api/fetch-json");
  mocks.read.mockReset();
  mocks.profile.mockReset().mockRejectedValue(new ApiFetchError({ message: "로그인이 필요해요.", status: 401, code: "UNAUTHORIZED", fields: [] }));
  const onResolved = vi.fn(); const onError = vi.fn(); const onUnauthorized = vi.fn();
  const { result: hook, rerender } = renderHook(() => useRecipeQuantityContext({ sources: [source], subject: () => ({ owner: "owner", generation: 3 }), onResolved, onError, onUnauthorized }));
  await act(async () => { await hook.current.request("row"); });
  expect(onUnauthorized).toHaveBeenCalledWith("row"); expect(mocks.read).not.toHaveBeenCalled();
  mocks.profile.mockResolvedValue({ id: "owner", account_generation: 3 }); rerender();
  expect(mocks.read).not.toHaveBeenCalled(); expect(onResolved).not.toHaveBeenCalled();
});
