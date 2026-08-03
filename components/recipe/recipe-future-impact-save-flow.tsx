"use client";

import React, { useRef, useState } from "react";

import { RecipeFutureImpactDialog, type RecipeFutureImpact } from "@/components/recipe/recipe-future-impact-dialog";
import {
  fetchRecipeFutureImpact,
  patchRecipeWithFutureStrategy,
  type RecipeFutureDraft,
} from "@/lib/api/recipe-future-impact";

interface RecipeFutureImpactSaveFlowProps {
  baseRecipeRevision: number;
  draft: RecipeFutureDraft;
  enabled: boolean;
  imageObjectId: string | null;
  onSaved: (result: { id: string; revision: number }) => void;
  recipeId: string;
}

function readErrorCode(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "IMPACT_PREVIEW_FAILED";
}

export function RecipeFutureImpactSaveFlow({
  baseRecipeRevision,
  draft,
  enabled,
  imageObjectId,
  onSaved,
  recipeId,
}: RecipeFutureImpactSaveFlowProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [impact, setImpact] = useState<RecipeFutureImpact | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const patchKeyRef = useRef<string | null>(null);

  if (!enabled) return null;

  async function preview() {
    setOpen(true);
    setLoading(true);
    setImpact(null);
    setErrorCode(null);
    patchKeyRef.current = null;
    try {
      setImpact(await fetchRecipeFutureImpact(recipeId, baseRecipeRevision, draft));
    } catch (error) {
      setErrorCode(readErrorCode(error));
    } finally {
      setLoading(false);
    }
  }

  async function save(strategy: "keep" | "replace_all") {
    if (!impact || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    const idempotencyKey = patchKeyRef.current ?? crypto.randomUUID();
    patchKeyRef.current = idempotencyKey;
    try {
      const result = await patchRecipeWithFutureStrategy(recipeId, {
        baseRecipeRevision,
        draft,
        futurePlanStrategy: strategy,
        impactToken: impact.impact_token,
        imageObjectId,
      }, idempotencyKey);
      setOpen(false);
      onSaved(result);
    } catch (error) {
      setErrorCode(readErrorCode(error));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--brand)] px-4 font-bold text-[var(--brand)]" onClick={() => void preview()} type="button">변경사항 저장</button>
    {open ? <RecipeFutureImpactDialog errorCode={errorCode} impact={impact} loading={loading} onClose={() => { if (!submitting) setOpen(false); }} onRecheck={() => void preview()} onSave={(strategy) => void save(strategy)} submitting={submitting} /> : null}
  </>;
}
