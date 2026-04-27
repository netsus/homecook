"use client";

import React from "react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "문제가 발생했어요",
  message,
  onRetry,
  retryLabel = "다시 시도",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3">
        <svg
          aria-hidden="true"
          className="h-10 w-10 text-[var(--brand)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-base font-bold text-[var(--foreground)]">{title}</h3>
      {message ? (
        <p className="mt-1 text-sm text-[var(--text-3)]">{message}</p>
      ) : null}
      {onRetry ? (
        <button
          className="mt-4 rounded-[var(--radius-sm)] bg-[var(--brand)] px-5 py-2.5 text-sm font-bold text-[var(--surface)] transition-colors hover:bg-[var(--brand-deep)]"
          onClick={onRetry}
          type="button"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
