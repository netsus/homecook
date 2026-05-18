import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebEmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
}

export function WebEmptyState({
  className,
  description,
  icon,
  title,
  ...props
}: WebEmptyStateProps) {
  return (
    <div className={cn("web-state-panel", className)} {...props}>
      <div className="web-state-icon">{icon}</div>
      <div className="web-state-title">{title}</div>
      {description ? <div className="web-state-desc">{description}</div> : null}
    </div>
  );
}
