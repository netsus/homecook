"use client";

import React from "react";

interface ModalHeaderProps {
  title: string;
  titleId?: string;
  /** Helper copy rendered below the title in muted text-sm */
  description?: string;
  /** Optional badge node rendered inline after the title */
  badge?: React.ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Ref forwarded to the close button — used by modals that need focus management */
  closeButtonRef?: React.Ref<HTMLButtonElement>;
}

/** D2: no eyebrow · D3: icon-only 44×44 circle close · description = copy-lock helper */
export function ModalHeader({
  title,
  titleId,
  description,
  badge,
  onClose,
  closeDisabled,
  closeButtonRef,
}: ModalHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            className="text-lg font-bold tracking-[-0.01em] text-[var(--foreground)]"
            id={titleId}
          >
            {title}
          </h2>
          {badge}
        </div>
        {description ? (
          <p className="mt-1 text-sm text-[var(--text-2)]">{description}</p>
        ) : null}
      </div>
      <button
        aria-label="닫기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition-colors disabled:opacity-40"
        disabled={closeDisabled}
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-fill)] transition-colors hover:brightness-95">
          <svg
            fill="none"
            height="18"
            viewBox="0 0 18 18"
            width="18"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 4L14 14M14 4L4 14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </span>
      </button>
    </div>
  );
}
