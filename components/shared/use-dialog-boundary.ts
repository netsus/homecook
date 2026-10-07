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

const bodyLocks = new WeakMap<HTMLElement, { count: number; previousOverflow: string }>();

function lockBodyScroll(body: HTMLElement) {
  const lock = bodyLocks.get(body) ?? { count: 0, previousOverflow: body.style.overflow };
  lock.count += 1;
  bodyLocks.set(body, lock);
  body.style.overflow = "hidden";
  return () => {
    lock.count -= 1;
    if (lock.count > 0) return;
    body.style.overflow = lock.previousOverflow;
    bodyLocks.delete(body);
  };
}

function isVisibleFocusTarget(element: HTMLElement, dialog: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.inert || node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (node === dialog) break;
  }
  return true;
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => isVisibleFocusTarget(element, dialog));
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
    if (activeElement && activeElement !== document.body && !dialog.contains(activeElement)) {
      invokerFocusRef.current = activeElement;
    }
    const releaseBodyScroll = lockBodyScroll(document.body);
    const isolated: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
    }> = [];

    const initialTarget = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialTarget.focus({ preventScroll: true });
    const focusGuardFrame = requestAnimationFrame(() => {
      if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
      const target = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
    });

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
        if (event.isComposing || event.keyCode === 229) return;
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
      releaseBodyScroll();
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
          if (target && !target.closest("[inert], [aria-hidden='true']")) target.focus({ preventScroll: true });
          invokerFocusRef.current = null;
        }
      });
    };
  }, [active, dialogRef, fallbackFocusRef, initialFocusRef]);

  return { setReturnFocusTarget };
}
