"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useActionConfirmationStore } from "@/stores/ui-store";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

export function ActionConfirmation() {
  const message = useActionConfirmationStore((state) => state.message);
  const dismiss = useActionConfirmationStore((state) => state.dismiss);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogBoundary({ active: Boolean(message), dialogRef, onClose: dismiss });

  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onClick={dismiss}>
      <div
        aria-labelledby="action-confirmation-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-[var(--surface)] p-6 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        </div>
        <h2 className="text-lg font-extrabold leading-relaxed text-[var(--foreground)]" id="action-confirmation-title">{message}</h2>
        <button className="mt-6 min-h-12 w-full rounded-2xl bg-[var(--brand)] px-4 py-3 font-bold text-white" onClick={dismiss} type="button">확인</button>
      </div>
    </div>,
    document.body,
  );
}
