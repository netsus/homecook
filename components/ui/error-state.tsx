"use client";

import React from "react";

import { ContentState } from "@/components/shared/content-state";

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
    <ContentState
      actionLabel={onRetry ? retryLabel : undefined}
      description={message}
      onAction={onRetry}
      tone="error"
      title={title}
      variant="subtle"
    >
      <div className="flex justify-center">
        <svg
          aria-hidden="true"
          className="h-10 w-10 text-[#FF6B6B]"
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
    </ContentState>
  );
}
