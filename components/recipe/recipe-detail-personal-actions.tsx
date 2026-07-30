"use client";

import React from "react";

import { Button } from "@/components/ui/button";

export type RecipeDetailPersonalAccessState =
  | "loading"
  | "unknown"
  | "public"
  | "owner-private"
  | "other-owner-private"
  | "deleted"
  | "quarantined"
  | "not-found";

interface RecipeDetailPersonalActionsProps {
  capabilityEnabled: boolean;
  accessState: RecipeDetailPersonalAccessState;
  isAuthenticated: boolean;
  onFork: (payload: { requiresLogin: boolean }) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RecipeDetailPersonalActions({
  capabilityEnabled,
  accessState,
  isAuthenticated,
  onFork,
  onEdit,
  onDelete,
}: RecipeDetailPersonalActionsProps) {
  if (!capabilityEnabled) {
    return null;
  }

  if (accessState === "public") {
    return (
      <div className="space-y-3">
        <Button
          data-action-level="secondary"
          fullWidth
          onClick={() => onFork({ requiresLogin: !isAuthenticated })}
          variant="secondary"
        >
          내 레시피로 수정
        </Button>
      </div>
    );
  }

  if (accessState === "owner-private") {
    return (
      <div className="space-y-3">
        <Button
          data-action-level="secondary"
          fullWidth
          onClick={onEdit}
          variant="secondary"
        >
          편집
        </Button>
        <div className="border-t border-[var(--line)] pt-3">
          <Button
            className="w-full"
            data-action-level="destructive-tertiary"
            onClick={onDelete}
            variant="destructive"
          >
            삭제
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
