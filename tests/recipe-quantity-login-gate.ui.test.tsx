// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { useAuthGateStore } from "@/stores/ui-store";
vi.mock("@/components/shared/use-desktop-viewport", () => ({ useDesktopViewport: () => false }));
afterEach(() => { cleanup(); useAuthGateStore.getState().close(); });
const owner = "550e8400-e29b-41d4-a716-446655440001";
const row = "550e8400-e29b-41d4-a716-446655440002";
describe("quantity resume login explanation", () => {
  it.each([false, true])("keeps pantry wording and explains quantity resume %s", quantity => {
    useAuthGateStore.getState().open({ type: "recipe-fork", recipeId: "recipe", sourceOwnerUuid: owner, sourceAccountGeneration: 3,
      resumeEditor: quantity ? { mode: "edit", rowKey: row, source: "quantity" } : { mode: "edit", rowKey: row },
      editContext: { base_recipe_revision: 1, image_object_id: null, draft: { title: "원문", description: null, base_servings: 2, ingredients: [], steps: [] } } });
    render(<LoginGateModal />);
    expect(screen.getByText(quantity ? "같은 계정으로 로그인하면 수량 초안을 다시 열어요. 수량 정보는 직접 다시 확인하며 자동 저장하지 않아요." : "같은 계정으로 다시 로그인하면 작성 중인 제품 선택으로 돌아가요. 자동으로 저장하지 않아요.")).toBeTruthy();
  });
});
