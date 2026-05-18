import * as React from "react";

import { WebEmptyState, type WebEmptyStateProps } from "@/components/web/web-empty-state";
import { cn } from "@/components/web/utils";

export function WebErrorState({ className, ...props }: WebEmptyStateProps) {
  return (
    <WebEmptyState
      className={cn("web-error-state", className)}
      {...props}
    />
  );
}
