"use client";

import React from "react";

import { ContentState } from "@/components/shared/content-state";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  const stateIcon = icon ?? (
    <svg
      aria-hidden="true"
      className="h-10 w-10 text-[#ADB5BD]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.375 7.5h17.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125H3.375c-.621 0-1.125-.504-1.125-1.125V8.625c0-.621.504-1.125 1.125-1.125z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <ContentState
      actionLabel={action?.label}
      description={description}
      onAction={action?.onClick}
      tone="empty"
      title={title}
      variant="subtle"
    >
      <div className="flex justify-center">{stateIcon}</div>
    </ContentState>
  );
}
