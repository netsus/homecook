"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type ReturnFocusTarget = HTMLElement | (() => HTMLElement | null) | null;

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function useDialogBoundary({
  active = true,
  closeOnEscape = true,
  dialogRef,
  fallbackFocusRef,
  initialFocusRef,
  onClose,
}: {
  active?: boolean;
  closeOnEscape?: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const invokerFocusRef = useRef<HTMLElement | null>(null);
  const requestedReturnFocusRef = useRef<ReturnFocusTarget>(null);
  const setReturnFocusTarget = useCallback((target: ReturnFocusTarget) => {
    requestedReturnFocusRef.current = target;
  }, []);

  useEffect(() => {
    closeRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const fallbackFocusTarget = fallbackFocusRef?.current ?? null;
    if (activeElement && !dialog.contains(activeElement)) {
      invokerFocusRef.current = activeElement;
    }
    const previousOverflow = document.body.style.overflow;
    const isolated: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
    }> = [];

    const initialTarget = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialTarget.focus();
    const focusGuardFrame = requestAnimationFrame(() => {
      if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
      const target = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
      target.focus();
    });
    document.body.style.overflow = "hidden";

    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        isolated.push({
          element: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute("aria-hidden"),
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      if (parent === document.body) break;
      branch = parent;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (closeOnEscapeRef.current) {
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(focusGuardFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert, ariaHidden } of isolated.reverse()) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      requestAnimationFrame(() => {
        const requestedTarget = typeof requestedReturnFocusRef.current === "function"
          ? requestedReturnFocusRef.current()
          : requestedReturnFocusRef.current;
        const returnTarget = invokerFocusRef.current;
        if (!dialog.isConnected) {
          const target = requestedTarget?.isConnected
            ? requestedTarget
            : returnTarget?.isConnected ? returnTarget : fallbackFocusTarget;
          target?.focus();
          invokerFocusRef.current = null;
        }
      });
    };
  }, [active, dialogRef, fallbackFocusRef, initialFocusRef]);

  return { setReturnFocusTarget };
}
