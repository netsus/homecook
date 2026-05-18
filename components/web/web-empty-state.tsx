import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebEmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  action?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
}

export function WebEmptyState({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: WebEmptyStateProps) {
  return (
    <div className={cn("web-state-panel", className)} {...props}>
      <div className="web-state-icon">{icon}</div>
      <h2 className="web-state-title">{title}</h2>
      {description ? <div className="web-state-desc">{description}</div> : null}
      {action ? <div className="web-state-action">{action}</div> : null}
    </div>
  );
}
