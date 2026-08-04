// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookingStartAction } from "@/components/cooking/cooking-start-action";

describe("cooking start navigation", () => {
  afterEach(cleanup);

  it("stays put and blocks duplicate actions until exact success", async () => {
    const user = userEvent.setup();
    let resolveStart!: (value: { session_id: string; contract_version: "snapshot_v2" }) => void;
    const start = vi.fn(() => new Promise<{ session_id: string; contract_version: "snapshot_v2" }>((resolve) => { resolveStart = resolve; }));
    const navigate = vi.fn();
    render(<CookingStartAction label="김치찌개 요리하기" navigate={navigate} start={start} />);

    await user.click(screen.getByRole("button", { name: "김치찌개 요리하기" }));
    expect((screen.getByRole("button", { name: "김치찌개 요리하기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("세션 생성 중…")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "김치찌개 요리하기" }));
    expect(start).toHaveBeenCalledTimes(1);

    resolveStart({ session_id: "snapshot", contract_version: "snapshot_v2" });
    await screen.findByText("이동 준비 완료");
    expect(navigate).toHaveBeenCalledWith("/cooking/session-attempts/snapshot/cook-mode");
  });

  it("keeps the current screen on failure and offers retry", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const start = vi.fn().mockRejectedValue(new Error("시작하지 못했어요"));
    render(<CookingStartAction label="요리하기" navigate={navigate} start={start} />);
    await user.click(screen.getByRole("button", { name: "요리하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("시작하지 못했어요");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps real recipe and planner start consumers behind the dormant snapshot boundary", () => {
    const recipeSource = readFileSync(join(process.cwd(), "components/recipe/recipe-detail-screen.tsx"), "utf8");
    const plannerSource = readFileSync(join(process.cwd(), "components/planner/meal-screen.tsx"), "utf8");
    expect(recipeSource).toContain("createSnapshotV2CookingSession");
    expect(plannerSource).toContain("createSnapshotV2CookingSession");
    expect(recipeSource).toContain("recipeSnapshotUiMode");
    expect(recipeSource).toContain("recipe.revision");
    expect(plannerSource).toContain("recipeSnapshotUiMode");
    expect(plannerSource).toContain("meal.revision");
  });
});
