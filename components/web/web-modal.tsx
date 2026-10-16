"use client";

import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebModalProps extends React.HTMLAttributes<HTMLDivElement> {
  closeDisabled?: boolean;
  onBackdropClick?: () => void;
}

export const WebModalBoundaryContext = React.createContext<{
  closeDisabled: boolean;
  onClose?: () => void;
} | null>(null);

export function WebModal({
  children,
  className,
  closeDisabled = false,
  onClick,
  onBackdropClick,
  ...props
}: WebModalProps) {
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented && !closeDisabled) {
      onBackdropClick?.();
    }
  };

  return (
    <WebModalBoundaryContext.Provider value={{ closeDisabled, onClose: onBackdropClick }}>
      <div
        className={cn("web-modal-backdrop", className)}
        onClick={handleBackdropClick}
        {...props}
      >
        <div onClick={(event) => event.stopPropagation()}>{children}</div>
      </div>
    </WebModalBoundaryContext.Provider>
  );
}
