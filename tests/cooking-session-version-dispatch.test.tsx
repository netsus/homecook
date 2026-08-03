// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import { getCookingSessionCookModeHref } from "@/lib/cooking/session-version-dispatch";

describe("cooking session version dispatch", () => {
  afterEach(cleanup);

  it("routes only from an explicit contract version", () => {
    expect(getCookingSessionCookModeHref({ session_id: "legacy", contract_version: "legacy_v1" })).toBe("/cooking/sessions/legacy/cook-mode");
    expect(getCookingSessionCookModeHref({ session_id: "snapshot", contract_version: "snapshot_v2" })).toBe("/cooking/session-attempts/snapshot/cook-mode");
    expect(() => getCookingSessionCookModeHref({ session_id: "guess" } as never)).toThrow(/contract_version/);
  });

  it("renders terminal snapshot sessions read-only without legacy fallback actions", () => {
    render(<SnapshotV2CookModeView data={{ session_id: "s", contract_version: "snapshot_v2", mode: "planner", status: "completed", recipe: { id: "r", title: "고정된 김치찌개", cooking_servings: 2, ingredients: [{ ingredient_id: "ingredient-1", standard_name: "김치", amount: 200, unit: "g", display_text: "김치 200g", ingredient_type: "QUANT", scalable: true }], steps: [{ step_number: 1, instruction: "김치를 냄비에 넣고 끓여요.", cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [], heat_level: "medium", duration_seconds: 600, duration_text: "10분" }] }, pantry_candidates: [] }} onCancel={() => undefined} />);
    expect(screen.getByText("고정된 김치찌개")).toBeTruthy();
    expect(screen.getByText("김치")).toBeTruthy();
    expect(screen.getByText("김치를 냄비에 넣고 끓여요.")).toBeTruthy();
    expect(screen.getByText(/완료된 요리 기록/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
  });

  it("keeps snapshot loading inside the existing whole-board geometry", () => {
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-pending" />);
    expect(screen.getByTestId("snapshot-v2-cook-mode-loading")).toBeTruthy();
    expect(screen.getByTestId("snapshot-v2-cook-mode-loading").querySelector(".cook-whole-board-mobile")).toBeTruthy();
  });
});
