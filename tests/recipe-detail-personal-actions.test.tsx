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
    const source = readFileSync(
      join(process.cwd(), "components/recipe/recipe-detail-screen.tsx"),
      "utf8",
    );

    expect(source).toContain("<RecipeDetailPersonalActions");
    expect(source).toContain("capabilityEnabled={canEditPersonalRecipe}");
    expect(source).toContain('accessState={canEditPersonalRecipe ? "owner-private" : "unknown"}');
    expect(source).toContain("<RecipeDetailPersonalEditor");
    expect(source).toContain("isPersonalEditorOpen && canEditPersonalRecipe && activePersonalEditContext");
    expect(source).toContain("createSnapshotV2CookingSession");
  });
});
