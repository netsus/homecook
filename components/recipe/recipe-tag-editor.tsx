"use client";

import React, { useMemo, useState } from "react";

import {
  REVIEWED_RECIPE_TAG_LIMIT,
  addReviewedRecipeTag,
  normalizeRecipeTagKey,
} from "@/lib/recipe-tag-input";

interface RecipeTagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestedTags?: string[];
  isLoading?: boolean;
  errorMessage?: string | null;
  suggestionErrorMessage?: string | null;
  onRefreshSuggestions?: () => void;
  hideHeader?: boolean;
  className?: string;
}

export function RecipeTagEditor({
  tags,
  onChange,
  suggestedTags = [],
  isLoading = false,
  errorMessage = null,
  suggestionErrorMessage = null,
  onRefreshSuggestions,
  hideHeader = false,
  className,
}: RecipeTagEditorProps) {
  const [inputValue, setInputValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedKeys = useMemo(
    () => new Set(tags.map((tag) => normalizeRecipeTagKey(tag))),
    [tags],
  );
  const addableSuggestedTags = useMemo(
    () =>
      suggestedTags.filter((tag) => {
        const key = normalizeRecipeTagKey(tag);
        return key && !selectedKeys.has(key);
      }),
    [selectedKeys, suggestedTags],
  );
  const displayedError = errorMessage ?? localError;

  function addTag(rawValue: string) {
    const result = addReviewedRecipeTag(tags, rawValue);
    if (result.error) {
      setLocalError(result.error);
      return;
    }

    setInputValue("");
    setLocalError(null);
    onChange(result.tags);
  }

  function removeTag(tagToRemove: string) {
    setLocalError(null);
    const removeKey = normalizeRecipeTagKey(tagToRemove);
    onChange(tags.filter((tag) => normalizeRecipeTagKey(tag) !== removeKey));
  }

  return (
    <section
      className={[
        "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
        className ?? "",
      ].join(" ")}
      data-testid="recipe-tag-editor"
    >
      {!hideHeader ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold leading-[1.35] text-[var(--foreground)]">
            태그
          </h2>
          <span className="text-[12px] font-semibold text-[var(--text-3)]">
            {tags.length}/{REVIEWED_RECIPE_TAG_LIMIT}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            className="inline-flex max-w-full items-center gap-1 rounded-[var(--radius-full)] bg-[var(--brand-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--brand)]"
            key={normalizeRecipeTagKey(tag)}
          >
            <span className="truncate">{tag}</span>
            <button
              aria-label={`${tag} 삭제`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[13px] leading-none hover:bg-[var(--surface)]"
              onClick={() => removeTag(tag)}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 ? (
          <span className="text-[12px] font-medium text-[var(--text-3)]">
            태그 없음
          </span>
        ) : null}
      </div>

      {addableSuggestedTags.length > 0 || isLoading || suggestionErrorMessage ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isLoading ? (
            <span className="rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-2 py-1 text-[12px] font-semibold text-[var(--text-3)]">
              추천 중...
            </span>
          ) : null}
          {addableSuggestedTags.map((tag) => (
            <button
              className="rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--surface-fill)] px-2.5 py-1 text-[12px] font-semibold text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              key={normalizeRecipeTagKey(tag)}
              onClick={() => addTag(tag)}
              type="button"
            >
              + {tag}
            </button>
          ))}
          {suggestionErrorMessage ? (
            <button
              className="text-[12px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              onClick={onRefreshSuggestions}
              type="button"
            >
              다시 추천
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addTag(inputValue);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="visually-hidden">태그 추가</span>
          <input
            aria-label="태그 추가"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 text-[13px] font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--brand)]"
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="예: 한식"
            value={inputValue}
          />
        </label>
        <button
          aria-label="태그 추가하기"
          className="h-9 shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[12px] font-bold text-[var(--text-inverse)] disabled:opacity-40"
          disabled={!inputValue.trim()}
          type="submit"
        >
          추가
        </button>
      </form>

      {displayedError ? (
        <p className="mt-2 text-[12px] font-semibold text-[var(--danger)]" role="alert">
          {displayedError}
        </p>
      ) : null}
      {suggestionErrorMessage ? (
        <p className="mt-1 text-[12px] font-medium text-[var(--text-3)]">
          {suggestionErrorMessage}
        </p>
      ) : null}
    </section>
  );
}
