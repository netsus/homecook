"use client";

import * as React from "react";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { cn } from "@/components/web/utils";
import { WebModalBoundaryContext } from "@/components/web/web-modal";

type WebDialogSize = "narrow" | "default" | "wide";

export interface WebDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  "aria-labelledby": string;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  /** Disable only when the caller already owns useDialogBoundary. */
  manageFocus?: boolean;
  size?: WebDialogSize;
}

export const WebDialog = React.forwardRef<HTMLDivElement, WebDialogProps>(
  function WebDialog(
    {
      className,
      fallbackFocusRef,
      manageFocus = true,
      size = "default",
      tabIndex = -1,
      ...props
    },
    ref,
  ) {
    const modalBoundary = React.useContext(WebModalBoundaryContext);
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    // React autoFocus runs before effects; retain the opener before that commit.
    const invokerFallbackRef = React.useRef<HTMLElement | null>(
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    );
    const setDialogRef = React.useCallback((element: HTMLDivElement | null) => {
      dialogRef.current = element;
      if (typeof ref === "function") return ref(element);
      if (ref) ref.current = element;
    }, [ref]);

    useDialogBoundary({
      active: manageFocus && modalBoundary !== null,
      closeOnEscape: !modalBoundary?.closeDisabled,
      dialogRef,
      fallbackFocusRef: fallbackFocusRef ?? invokerFallbackRef,
      onClose: () => modalBoundary?.onClose?.(),
    });

    return (
      <div
        aria-modal="true"
        className={cn(
          "web-dialog",
          size !== "default" && `web-dialog-${size}`,
          className,
        )}
        ref={setDialogRef}
        role="dialog"
        tabIndex={tabIndex}
        {...props}
      />
    );
  },
);

export function WebDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-header", className)} {...props} />;
}

export function WebDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("web-dialog-title", className)} {...props} />;
}

export function WebDialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-body", className)} {...props} />;
}

export function WebDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-footer", className)} {...props} />;
}
