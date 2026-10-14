// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalRecipeDeleteDialog } from "@/components/recipe/personal-recipe-delete-dialog";
import { RecipeDetailPersonalActions } from "@/components/recipe/recipe-detail-personal-actions";

describe("recipe detail personal actions", () => {
  afterEach(cleanup);

  it("keeps every personal entry dark while the capability is off", () => {
    const { rerender } = render(
      <RecipeDetailPersonalActions
        accessState="public"
        capabilityEnabled={false}
        isAuthenticated
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onFork={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <RecipeDetailPersonalActions
        accessState="owner-private"
        capabilityEnabled={false}
        isAuthenticated
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onFork={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders public fork as a secondary action and preserves login intent", async () => {
    const user = userEvent.setup();
    const onFork = vi.fn();

    render(
      <RecipeDetailPersonalActions
        accessState="public"
        capabilityEnabled
        isAuthenticated={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onFork={onFork}
      />,
    );

    const button = screen.getByRole("button", { name: "내 레시피로 수정" });
    expect(button.getAttribute("data-action-level")).toBe("secondary");
    await user.click(button);
    expect(onFork).toHaveBeenCalledWith({ requiresLogin: true });
  });

  it("keeps owner edit secondary and delete in a separate destructive row", () => {
    render(
      <RecipeDetailPersonalActions
        accessState="owner-private"
        capabilityEnabled
        isAuthenticated
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onFork={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "편집" }).getAttribute("data-action-level"),
    ).toBe("secondary");
    expect(
      screen.getByRole("button", { name: "삭제" }).getAttribute("data-action-level"),
    ).toBe("destructive-tertiary");
  });

  it.each([
    "loading",
    "other-owner-private",
    "deleted",
    "quarantined",
    "not-found",
  ] as const)("fails closed for %s without revealing a CTA", (accessState) => {
    render(
      <RecipeDetailPersonalActions
        accessState={accessState}
        capabilityEnabled
        isAuthenticated
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onFork={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gates the actual owner editor on the server-projected edit context", () => {
    const screenSource = readFileSync(
      join(process.cwd(), "components/recipe/recipe-detail-screen.tsx"),
      "utf8",
    );
    const editorSource = readFileSync(
      join(process.cwd(), "components/recipe/recipe-detail-personal-editor.tsx"),
      "utf8",
    );
    const impactSource = readFileSync(
      join(process.cwd(), "components/recipe/recipe-future-impact-save-flow.tsx"),
      "utf8",
    );

    expect(screenSource).toContain("<RecipeDetailPersonalActions");
    expect(screenSource).toContain("capabilityEnabled={personalRecipeCapabilityEnabled}");
    expect(screenSource).toContain("accessState={personalRecipeAccessState}");
    expect(screenSource).toContain("type: \"recipe-fork\"");
    expect(screenSource).toContain("setPersonalEditorMode(\"fork\")");
    expect(screenSource).toContain("<RecipeDetailPersonalEditor");
    expect(screenSource).toContain("isPersonalEditorOpen && activePersonalEditorContext");
    expect(screenSource).toContain("mode={personalEditorMode}");
    expect(screenSource).toContain("createSnapshotV2CookingSession");
    expect(editorSource).toContain("type: \"recipe-save-as-new\"");
    expect(editorSource).toContain("fixed inset-0 z-[120]");
    expect(editorSource).toContain("font-semibold text-[var(--text-2)]");
    expect(impactSource).toContain("w-full");
    expect(impactSource).toContain("bg-[var(--brand)]");
    expect(impactSource).toContain("text-[var(--text-inverse)]");
  });

  it("keeps the QA future-impact fallback behind an explicit query plus client fixture gate", () => {
    const source = readFileSync(
      join(process.cwd(), "components/recipe/recipe-detail-screen.tsx"),
      "utf8",
    );

    expect(source).toContain("const searchParams = new URLSearchParams(window.location.search);");
    expect(source.match(/isQaFixtureClientModeEnabled\(\)/gu)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(source).toContain('searchParams.get("qaFutureImpact") === "1"');
    expect(source).not.toContain('searchParams.get("qaForkContext")');
    expect(source).toContain("const qaForkContext = useMemo(() => (");
  });

  it("confirms deletion once and blocks close/repeated clicks while deletion is pending", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => {
      view.rerender(<PersonalRecipeDeleteDialog isOpen onClose={onClose} onConfirm={onConfirm} submitting />);
    });
    const view = render(<PersonalRecipeDeleteDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog", { name: "정말 레시피를 삭제할까요?" }).textContent)
      .toContain("기존 계획, 요리, 기록은 그대로 남아요.");
    await user.dblClick(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "삭제 중" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "취소" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<PersonalRecipeDeleteDialog isOpen onClose={onClose} onConfirm={onConfirm}
      errorMessage="레시피를 삭제하지 못했어요." />);
    expect(screen.getByRole("alert").textContent).toBe("레시피를 삭제하지 못했어요.");
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
