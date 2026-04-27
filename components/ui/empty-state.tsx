"use client";

import React from "react";

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
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {icon ? (
        <div className="mb-3 text-[var(--text-4)]">{icon}</div>
      ) : (
        <div className="mb-3">
          <svg
            aria-hidden="true"
            className="h-10 w-10 text-[var(--text-4)]"
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
        </div>
      )}
      <h3 className="text-base font-bold text-[var(--foreground)]">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm text-[var(--text-3)]">{description}</p>
      ) : null}
      {action ? (
        <button
          className="mt-4 rounded-[var(--radius-sm)] bg-[var(--brand)] px-5 py-2.5 text-sm font-bold text-[var(--surface)] transition-colors hover:bg-[var(--brand-deep)]"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
