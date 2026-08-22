// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("wires owner delete through a dedicated confirm dialog and stable request flow", () => {
    const screenSource = readFileSync(
      join(process.cwd(), "components/recipe/recipe-detail-screen.tsx"),
      "utf8",
    );
    const dialogSource = readFileSync(
      join(process.cwd(), "components/recipe/personal-recipe-delete-dialog.tsx"),
      "utf8",
    );
    const apiSource = readFileSync(
      join(process.cwd(), "lib/api/personal-recipe.ts"),
      "utf8",
    );

    expect(screenSource).toContain("PersonalRecipeDeleteDialog");
    expect(screenSource).toContain("deletePersonalRecipe");
    expect(screenSource).toContain("const deleteKeyRef = React.useRef<string | null>(null)");
    expect(screenSource).toContain("const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)");
    expect(screenSource).toContain("const [isDeletingPersonalRecipe, setIsDeletingPersonalRecipe] = useState(false)");
    expect(screenSource).toContain("const [deletePersonalRecipeError, setDeletePersonalRecipeError] = useState<string | null>(null)");
    expect(screenSource).toContain("onDelete={openDeletePersonalRecipeDialog}");
    expect(screenSource).not.toContain("onDelete={() => undefined}");
    expect(screenSource).toContain("deleteKeyRef.current ?? crypto.randomUUID()");
    expect(screenSource).toContain("router.refresh()");
    expect(screenSource).toContain("setDetailErrorKind(\"not-found\")");

    expect(dialogSource).toContain("AppConfirmDialog");
    expect(dialogSource).toContain("AppModalFooterActions");
    expect(dialogSource).toContain('backdropLayerClassName="z-[120]"');
    expect(dialogSource).toContain("useDialogBoundary");
    expect(dialogSource).toContain("정말 레시피를 삭제할까요?");
    expect(dialogSource).toContain("기존 계획, 요리, 기록은 그대로 남아요.");
    expect(dialogSource).toContain("role=\"alert\"");
    expect(dialogSource).toContain('confirmLabel={submitting ? "삭제 중" : "삭제"}');
    expect(dialogSource).toContain('confirmTone="danger"');

    expect(apiSource).toContain("Idempotency-Key");
    expect(apiSource).toContain("method: \"DELETE\"");
    expect(apiSource).toContain("/api/v1/recipes/");
  });
});
