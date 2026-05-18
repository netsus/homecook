import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebModalProps extends React.HTMLAttributes<HTMLDivElement> {
  onBackdropClick?: () => void;
}

export function WebModal({
  children,
  className,
  onClick,
  onBackdropClick,
  ...props
}: WebModalProps) {
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      onBackdropClick?.();
    }
  };

  return (
    <div
      className={cn("web-modal-backdrop", className)}
      onClick={handleBackdropClick}
      {...props}
    >
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}
