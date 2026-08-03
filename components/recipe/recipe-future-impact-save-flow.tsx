"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { RecipeFutureImpactDialog, type RecipeFutureImpact } from "@/components/recipe/recipe-future-impact-dialog";
import {
  fetchRecipeFutureImpact,
  patchRecipeWithFutureStrategy,
  type RecipeFutureDraft,
} from "@/lib/api/recipe-future-impact";
import type { RecipeEditContext } from "@/types/recipe";

interface RecipeFutureImpactSaveFlowProps {
  actionDisabled?: boolean;
  baseRecipeRevision: number;
  draft: RecipeFutureDraft;
  enabled: boolean;
  imageObjectId: string | null;
  onSaved: (result: { id: string; revision: number }) => void;
  onUnauthorized?: (editContext: RecipeEditContext) => void;
  recipeId: string;
  resumePreview?: boolean;
}

function readErrorCode(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "IMPACT_PREVIEW_FAILED";
}

export function RecipeFutureImpactSaveFlow({
  actionDisabled = false,
  baseRecipeRevision,
  draft,
  enabled,
  imageObjectId,
  onSaved,
  onUnauthorized,
  recipeId,
  resumePreview = false,
}: RecipeFutureImpactSaveFlowProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [impact, setImpact] = useState<RecipeFutureImpact | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const patchKeyRef = useRef<string | null>(null);
  const previewDraftRef = useRef<RecipeFutureDraft | null>(null);
  const resumeAttemptedRef = useRef(false);

  const preview = useCallback(async () => {
    if (actionDisabled) return;
    const previewDraft = JSON.parse(JSON.stringify(draft)) as RecipeFutureDraft;
    setOpen(true);
    setLoading(true);
    setImpact(null);
    setErrorCode(null);
    patchKeyRef.current = null;
    previewDraftRef.current = previewDraft;
    try {
      setImpact(await fetchRecipeFutureImpact(recipeId, baseRecipeRevision, previewDraft));
    } catch (error) {
      const code = readErrorCode(error);
      setErrorCode(code);
      if (code === "UNAUTHORIZED" && onUnauthorized) {
        setOpen(false);
        onUnauthorized({
          base_recipe_revision: baseRecipeRevision,
          draft: previewDraft,
          image_object_id: imageObjectId,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [actionDisabled, baseRecipeRevision, draft, imageObjectId, onUnauthorized, recipeId]);

  useEffect(() => {
    if (!resumePreview || resumeAttemptedRef.current || actionDisabled || !enabled) return;
    resumeAttemptedRef.current = true;
    void preview();
  }, [actionDisabled, enabled, preview, resumePreview]);

  if (!enabled) return null;

  async function save(strategy: "keep" | "replace_all") {
    const previewDraft = previewDraftRef.current;
    if (!impact || !previewDraft || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    const idempotencyKey = patchKeyRef.current ?? crypto.randomUUID();
    patchKeyRef.current = idempotencyKey;
    try {
      const result = await patchRecipeWithFutureStrategy(recipeId, {
        baseRecipeRevision,
        draft: previewDraft,
        futurePlanStrategy: strategy,
        impactToken: impact.impact_token,
        imageObjectId,
      }, idempotencyKey);
      setOpen(false);
      onSaved(result);
    } catch (error) {
      const code = readErrorCode(error);
      setErrorCode(code);
      if (code === "UNAUTHORIZED" && onUnauthorized) {
        setOpen(false);
        onUnauthorized({
          base_recipe_revision: baseRecipeRevision,
          draft: previewDraft,
          image_object_id: imageObjectId,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--brand)] px-4 font-bold text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50" disabled={actionDisabled} onClick={() => void preview()} type="button">변경사항 저장</button>
    {open ? <RecipeFutureImpactDialog errorCode={errorCode} impact={impact} loading={loading} onClose={() => { if (!submitting) setOpen(false); }} onLogin={() => {
      const previewDraft = previewDraftRef.current;
      if (!previewDraft) return;
      onUnauthorized?.({
        base_recipe_revision: baseRecipeRevision,
        draft: previewDraft,
        image_object_id: imageObjectId,
      });
    }} onRecheck={() => void preview()} onSave={(strategy) => void save(strategy)} submitting={submitting} /> : null}
  </>;
}
