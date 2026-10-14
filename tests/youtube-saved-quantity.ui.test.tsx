// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchYoutubeSavedRecipe, updateYoutubeSavedRecipe } from "@/lib/api/youtube-saved-recipes";
import type { YoutubeSavedRecipeResult } from "@/types/youtube-saved-recipe";
import type { QuantityInputSnapshot } from "@/types/quantity-input";
import type { ApiResponse } from "@/types/api";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/recipes/youtube/saved/fixture", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api/cooking-methods", () => ({ fetchCookingMethods: vi.fn() }));
vi.mock("@/lib/api/youtube-saved-recipes", () => ({ fetchYoutubeSavedRecipe: vi.fn(), updateYoutubeSavedRecipe: vi.fn(), ensureYoutubeSavedRecipe: vi.fn() }));
const draftId = "11111111-1111-4111-8111-111111111111";
const otherId = "11111111-1111-4111-8111-111111111112";
const rowId = "22222222-2222-4222-8222-222222222222";
const fingerprint = "a".repeat(64);
const ok = (data: YoutubeSavedRecipeResult): ApiResponse<YoutubeSavedRecipeResult> => ({ success: true, data, error: null });
const snapshot = (raw = "1/3", unit = "g", amount = 1 / 3): QuantityInputSnapshot => ({ schema_version: "quantity-v4", raw_value: raw,
  raw_unit: unit, numerator: raw === "1/3" ? "1" : raw === "2/3" ? "2" : raw, denominator: raw.includes("/") ? "3" : "1",
  normalized: unit === "g" ? { amount, unit: "g" } : null, quality: unit === "g" ? "direct" : "unavailable",
  reason: unit === "g" ? null : "DENSITY_UNAVAILABLE", evidence_ids: [], source_versions: [], batch_basis: null });
function fixture(): YoutubeSavedRecipeResult {
  return { draft_id: draftId, revision: 1, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z",
    source: { extraction_id: "33333333-3333-4333-8333-333333333333", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
    quantity_policy: "quantity-v4", quantity_contexts: { [rowId]: { fingerprint, options: null } },
    content: { title: "분수 원문 레시피", base_servings: 2, tags: [], steps: [], ingredients: [{ row_id: rowId, source_draft_ingredient_id: null,
      standard_name: "소금", quantity_mode: "quantity", amount: 1 / 3, unit: "g", display_text: "소금 1/3g", component_label: null,
      quantity_input: snapshot(), quantity_context_fingerprint: fingerprint }] } };
}
const props = { entryContext: "standalone" as const, initialSavedDraftId: draftId, columnId: "", planDate: "", slotName: "" };
async function open() { const view = render(<YoutubeImportScreen {...props} />);await screen.findByRole("heading", { name: "분수 원문 레시피" });return view; }
async function edit(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "재료 수정" }));return screen.getByLabelText("소금 수량") as HTMLInputElement; }
async function unit(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText("소금 단위 직접 입력");await user.clear(input);await user.type(input, value);await user.tab();return input as HTMLInputElement;
}
async function title(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "기본 정보 수정" }));const input = screen.getByLabelText("레시피명");await user.clear(input);await user.type(input, "제목만 수정");
}
async function save(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByRole("button", { name: "변경사항 저장" }));await waitFor(() => expect(updateYoutubeSavedRecipe).toHaveBeenCalled()); }
function deferred() { let resolve!: (value: ApiResponse<YoutubeSavedRecipeResult>) => void;const promise = new Promise<ApiResponse<YoutubeSavedRecipeResult>>(done => { resolve = done; });return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks();vi.mocked(fetchCookingMethods).mockResolvedValue({ success: true, data: { methods: [] }, error: null });
  vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(fixture()));vi.mocked(updateYoutubeSavedRecipe).mockResolvedValue(ok({ ...fixture(), revision: 2 })); });
afterEach(cleanup);

describe("saved YouTube raw quantity UI", () => {
  it("opts into reading and reopens 1/3 without decimal replacement", async () => {
    const user = userEvent.setup();await open();expect(fetchYoutubeSavedRecipe).toHaveBeenCalledWith(draftId, true);
    expect(screen.getByText("1/3g")).toBeTruthy();expect((await edit(user)).value).toBe("1/3");
  });
  it("keeps title-only rows at eight keys and reloads raw metadata after the legacy response", async () => {
    const result = { ...fixture(), revision: 2, content: { ...fixture().content, title: "제목만 수정" } };
    const legacy = { ...result };delete legacy.quantity_policy;delete legacy.quantity_contexts;
    legacy.content = { ...result.content, ingredients: result.content.ingredients.map(ingredient => { const row = { ...ingredient };delete row.quantity_input;delete row.quantity_context_fingerprint;return row; }) };
    vi.mocked(updateYoutubeSavedRecipe).mockResolvedValue(ok(legacy));vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValueOnce(ok(fixture())).mockResolvedValueOnce(ok(result));
    const user = userEvent.setup();await open();await title(user);await save(user);
    expect(Object.keys(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])).toHaveLength(8);
    expect(await screen.findByRole("heading", { name: "제목만 수정" })).toBeTruthy();expect(screen.getByText("1/3g")).toBeTruthy();
    expect(fetchYoutubeSavedRecipe).toHaveBeenCalledTimes(2);
  });
  it("sends only raw three fields and expected context on an explicit numeric edit", async () => {
    const user = userEvent.setup();await open();const input = await edit(user);await user.clear(input);await user.type(input, "2/3");await save(user);
    expect(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0]).toMatchObject({ amount: 2 / 3, unit: "g",
      quantity_input: { schema_version: "quantity-v4", raw_value: "2/3", raw_unit: "g", expected_context_fingerprint: fingerprint } });
    expect(Object.keys(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0].quantity_input!)).toHaveLength(4);
  });
  it("preserves original 1/3g through SI conversion, save and reopen", async () => {
    const result = fixture();result.revision = 2;result.content.ingredients[0].amount = 1 / 3000;result.content.ingredients[0].unit = "kg";
    result.content.ingredients[0].quantity_input = { ...snapshot(), display_quantity: { amount: 1 / 3000, unit: "kg" } };
    vi.mocked(updateYoutubeSavedRecipe).mockResolvedValue(ok(result));const user = userEvent.setup();await open();await edit(user);
    await unit(user, "kg");expect((screen.getByLabelText("소금 수량") as HTMLInputElement).value).toBe(String(1 / 3000));
    expect(screen.getByText("원입력: 1/3 g")).toBeTruthy();await save(user);
    expect(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0]).toMatchObject({ amount: 1 / 3000, unit: "kg", quantity_input: { raw_value: "1/3", raw_unit: "g" } });
    await screen.findByRole("button", { name: "재료 수정" });await edit(user);await unit(user, "g");
    expect((screen.getByLabelText("소금 수량") as HTMLInputElement).value).toBe("1/3");
  });
  it("rejects an unsupported conversion, retaining the old unit and raw text", async () => {
    const user = userEvent.setup();await open();await edit(user);const input = await unit(user, "개");
    expect(input.value).toBe("g");expect((screen.getByLabelText("소금 수량") as HTMLInputElement).value).toBe("1/3");
    expect(screen.getByRole("alert").textContent).toContain("그 단위로 바꿀 근거가 없어요");expect(updateYoutubeSavedRecipe).not.toHaveBeenCalled();
  });
  it("blocks changed historical density but permits independent SI and new explicit quantity evidence", async () => {
    const data = fixture();data.quantity_contexts![rowId] = { fingerprint: "b".repeat(64), options: { policy_version: "ingredient-units-v4", profile_id: "fixture", preparation_state: null,
      default_unit: "g", choices: [{ unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null }, { unit: "mL", normalized: { amount: 2, unit: "g" }, quality: "estimated", reason: null }] } };
    vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(data));const user = userEvent.setup();await open();await edit(user);await unit(user, "mL");
    expect(screen.getByRole("alert").textContent).toContain("단위 근거가 바뀌었어요");await unit(user, "kg");expect((screen.getByLabelText("소금 단위 직접 입력") as HTMLInputElement).value).toBe("kg");
    await unit(user, "g");const input = screen.getByLabelText("소금 수량");await user.clear(input);await user.type(input, "2");await unit(user, "mL");await save(user);
    expect(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0]).toMatchObject({ amount: 1, unit: "mL", quantity_input: { raw_value: "2", raw_unit: "g", expected_context_fingerprint: "b".repeat(64) } });
  });
  it("reads raw fractions while OFF and locks quantity/unit modifications", async () => {
    const data = fixture();data.quantity_policy = null;vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(data));
    const user = userEvent.setup();await open();const input = await edit(user);expect(input.disabled).toBe(true);
    expect((screen.getByLabelText("소금 단위 직접 입력") as HTMLInputElement).disabled).toBe(true);expect(input.value).toBe("1/3");
    await title(user);await save(user);expect(Object.keys(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])).toHaveLength(8);
  });
  it("does not borrow a current density when the stored context stamp is absent", async () => {
    const data = fixture();delete data.content.ingredients[0].quantity_context_fingerprint;
    data.quantity_contexts![rowId].options = { policy_version: "ingredient-units-v4", profile_id: "fixture", preparation_state: null, default_unit: "g",
      choices: [{ unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null },
        { unit: "mL", normalized: { amount: 2, unit: "g" }, quality: "estimated", reason: null }] };
    vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(data));const user = userEvent.setup();await open();await edit(user);await unit(user, "mL");
    expect(screen.getByRole("alert").textContent).toContain("단위 근거가 바뀌었어요");
    expect((screen.getByLabelText("소금 단위 직접 입력") as HTMLInputElement).value).toBe("g");expect(updateYoutubeSavedRecipe).not.toHaveBeenCalled();
  });
  it.each(["raw-only", "policy-only", "context-only"])("locks partially delivered %s metadata", async kind => {
    const data = fixture();
    if (kind !== "policy-only") delete data.quantity_policy;
    if (kind !== "context-only") delete data.quantity_contexts;
    if (kind !== "raw-only") { delete data.content.ingredients[0].quantity_input;delete data.content.ingredients[0].quantity_context_fingerprint; }
    vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(data));const user = userEvent.setup();await open();
    expect((await edit(user)).disabled).toBe(true);
  });
  it("retains numeric legacy editing only when all new metadata is absent", async () => {
    const data = fixture();delete data.quantity_policy;delete data.quantity_contexts;delete data.content.ingredients[0].quantity_input;delete data.content.ingredients[0].quantity_context_fingerprint;
    vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok(data));const user = userEvent.setup();await open();const input = await edit(user);
    expect(input.disabled).toBe(false);await user.clear(input);await user.type(input, "250");await save(user);
    expect(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0].amount).toBe(250);
    expect(Object.keys(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0])).toHaveLength(8);
  });
  it("retains invalid fraction text and prevents a partial save", async () => {
    const user = userEvent.setup();await open();const input = await edit(user);await user.clear(input);await user.type(input, "1/");
    expect(input.value).toBe("1/");expect(screen.queryByRole("button", { name: "변경사항 저장" })).toBeNull();
    expect(updateYoutubeSavedRecipe).not.toHaveBeenCalled();
  });
  it("sends an explicit empty clear as null", async () => {
    const user = userEvent.setup();await open();await user.clear(await edit(user));await save(user);
    expect(vi.mocked(updateYoutubeSavedRecipe).mock.calls[0][2].ingredients[0]).toMatchObject({ amount: null, quantity_mode: "unknown", quantity_input: null });
  });
  it("keeps raw draft and same idempotency key on network retry", async () => {
    vi.mocked(updateYoutubeSavedRecipe).mockResolvedValueOnce({ success: false, data: null, error: { code: "NETWORK_ERROR", message: "fixture retry", fields: [] } });
    const user = userEvent.setup();await open();const input = await edit(user);await user.clear(input);await user.type(input, "2/3");await save(user);
    await user.click(await screen.findByRole("button", { name: "다시 시도" }));await waitFor(() => expect(updateYoutubeSavedRecipe).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(updateYoutubeSavedRecipe).mock.calls;expect(first[3]).toBe(second[3]);expect(first[2]).toEqual(second[2]);
  });
  it.each(["QUANTITY_CONTEXT_CHANGED", "QUANTITY_INPUT_REQUIRED", "UNIT_POLICY_INACTIVE"])("keeps draft on %s and reloads the latest read contract", async code => {
    vi.mocked(updateYoutubeSavedRecipe).mockResolvedValueOnce({ success: false, data: null, error: { code, message: "근거를 다시 확인해 주세요", fields: [] } });
    const user = userEvent.setup();await open();const input = await edit(user);await user.clear(input);await user.type(input, "2/3");await save(user);
    expect(await screen.findByRole("button", { name: "최신 내용 불러오기" })).toBeTruthy();expect(input.value).toBe("2/3");
    expect(screen.getByRole("heading", { name: "단위 입력을 다시 확인해 주세요" })).toBeTruthy();
    if (code === "UNIT_POLICY_INACTIVE") { expect(input.disabled).toBe(true);expect(screen.getByText("수량 수정은 잠시 사용할 수 없어요. 현재 수정 내용은 아직 저장되지 않았어요.")).toBeTruthy(); }
    await user.click(screen.getByRole("button", { name: "최신 내용 불러오기" }));await screen.findByRole("button", { name: "재료 수정" });expect(fetchYoutubeSavedRecipe).toHaveBeenLastCalledWith(draftId, true);
    expect(updateYoutubeSavedRecipe).toHaveBeenCalledTimes(1);
  });
  it("ignores an old reader response after switching saved drafts", async () => {
    const pending = deferred();vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok({ ...fixture(), draft_id: otherId, content: { ...fixture().content, title: "새 문서" } })).mockReturnValueOnce(pending.promise);
    const view = render(<YoutubeImportScreen {...props} />);view.rerender(<YoutubeImportScreen {...props} initialSavedDraftId={otherId} />);
    await screen.findByRole("heading", { name: "새 문서" });await act(async () => pending.resolve(ok(fixture())));
    expect(screen.queryByRole("heading", { name: "분수 원문 레시피" })).toBeNull();
  });
  it("locks edits during save and ignores a late prior-draft response", async () => {
    const pending = deferred();vi.mocked(updateYoutubeSavedRecipe).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();const view = await open();const input = await edit(user);await user.clear(input);await user.type(input, "2/3");await save(user);
    expect(input.closest("fieldset")?.disabled).toBe(true);vi.mocked(fetchYoutubeSavedRecipe).mockResolvedValue(ok({ ...fixture(), draft_id: otherId, content: { ...fixture().content, title: "새 문서" } }));
    view.rerender(<YoutubeImportScreen {...props} initialSavedDraftId={otherId} />);await screen.findByRole("heading", { name: "새 문서" });
    await act(async () => pending.resolve(ok({ ...fixture(), revision: 2 })));expect(screen.queryByRole("heading", { name: "분수 원문 레시피" })).toBeNull();expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("keeps unsaved raw text when cancelling the discard dialog without any write", async () => {
    const user = userEvent.setup();await open();const input = await edit(user);await user.clear(input);await user.type(input, "2/3");
    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));await user.click(await screen.findByRole("button", { name: "계속 수정" }));
    expect(input.value).toBe("2/3");expect(updateYoutubeSavedRecipe).not.toHaveBeenCalled();
  });
});
