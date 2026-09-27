// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManualRecipePublishAction } from "@/components/recipe/manual-recipe-publish-action";
import { ApiFetchError, fetchJson } from "@/lib/api/fetch-json";
import { useActionConfirmationStore } from "@/stores/ui-store";

vi.mock("@/lib/api/fetch-json", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/fetch-json")>(), fetchJson: vi.fn(),
}));
const recipeId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.mocked(fetchJson).mockReset(); useActionConfirmationStore.getState().dismiss(); });
afterEach(cleanup);

describe("manual recipe publication action", () => {
  it("waits for publication before announcing success and prevents duplicate pending requests", async () => {
    let resolve!: (value: { id: string; visibility: "public" }) => void;
    vi.mocked(fetchJson).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const onPublished = vi.fn(); const user = userEvent.setup();
    render(<ManualRecipePublishAction recipeId={recipeId} onPublished={onPublished} />);
    await user.click(screen.getByRole("button", { name: "공개하여 검색·공유하기" }));
    const pending = screen.getByRole<HTMLButtonElement>("button", { name: "공개 준비 중…" });
    expect(pending.disabled).toBe(true);
    await user.click(pending);
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith(`/api/v1/recipes/${recipeId}/publish`, { method: "POST" });
    expect(onPublished).not.toHaveBeenCalled();
    expect(useActionConfirmationStore.getState().message).toBeNull();
    await act(async () => resolve({ id: recipeId, visibility: "public" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(useActionConfirmationStore.getState().message).toBe("공개했어요. 홈에서 검색하고 링크로 공유할 수 있어요.");
  });

  it("keeps failed publication retryable without refreshing the recipe or reporting success", async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new ApiFetchError({ status: 503, code: "INTERNAL_ERROR", fields: [], message: "공개 등록이 완료되지 않았어요." }));
    vi.mocked(fetchJson).mockResolvedValueOnce({ id: recipeId, visibility: "public" });
    const onPublished = vi.fn(); const user = userEvent.setup();
    render(<ManualRecipePublishAction recipeId={recipeId} onPublished={onPublished} />);
    await user.click(screen.getByRole("button", { name: "공개하여 검색·공유하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("완료되지 않았어요");
    expect(onPublished).not.toHaveBeenCalled(); expect(useActionConfirmationStore.getState().message).toBeNull();
    await user.click(screen.getByRole("button", { name: "공개하여 검색·공유하기" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers a login return to this action after authentication fails", async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new ApiFetchError({ status: 401, code: "UNAUTHORIZED", fields: [], message: "로그인이 필요해요." }));
    const onPublished = vi.fn(); const user = userEvent.setup();
    render(<ManualRecipePublishAction recipeId={recipeId} onPublished={onPublished} />);
    await user.click(screen.getByRole("button", { name: "공개하여 검색·공유하기" }));
    const link = await screen.findByRole<HTMLAnchorElement>("link", { name: "다시 로그인" });
    expect(new URL(link.href).searchParams.get("next")).toBe(`/recipe/${recipeId}#recipe-publish`);
    expect(onPublished).not.toHaveBeenCalled(); expect(useActionConfirmationStore.getState().message).toBeNull();
  });
});
